<?php
// /api/requests/treasury_action.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); die(json_encode(['error' => 'Método no permitido']));
}
if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'Tesoreria') {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado.']));
}

$conn = getDbConnection();
$action_user_id = $_SESSION['user_id'];
$request_id = $_POST['request_id'] ?? 0;
$action = $_POST['action'] ?? '';
$comments = $_POST['comments'] ?? '';

$stmt_check = $conn->prepare("SELECT id, user_id, status FROM requests WHERE id = ? AND status = 'Autorizado'");
$stmt_check->bind_param("i", $request_id);
$stmt_check->execute();
$request = $stmt_check->get_result()->fetch_assoc();
$stmt_check->close();

if (!$request) {
    http_response_code(404);
    die(json_encode(['error' => 'Solicitud no encontrada o ya no está en estado "Autorizado".']));
}

if (!in_array($action, ['Pagado', 'Rechazado', 'Correccion'])) {
    http_response_code(400); die(json_encode(['error' => 'Acción no válida.']));
}

if (($action === 'Rechazado' || $action === 'Correccion') && empty($comments)) {
    http_response_code(400); die(json_encode(['error' => 'Los comentarios son obligatorios para esta acción.']));
}

$payment_proof_path = null;
if ($action === 'Pagado') {
    if (isset($_FILES['payment_proof']) && $_FILES['payment_proof']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['payment_proof'];
        $upload_dir = __DIR__ . '/../../uploads/';
        $filename = 'pago-' . uniqid() . '-' . basename($file['name']);
        $payment_proof_path = '/uploads/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
            http_response_code(500); die(json_encode(['error' => 'Error al guardar el comprobante de pago.']));
        }
    } else {
        http_response_code(400); die(json_encode(['error' => 'El comprobante de pago es obligatorio.']));
    }
}

$conn->begin_transaction();
try {
    $sql = "";
    $types = "";
    $params = [];

    if ($action === 'Pagado') {
        $sql = "UPDATE requests SET status = ?, payment_proof_path = ?, updated_by = ? WHERE id = ?";
        $types = "ssii";
        $params = [$action, $payment_proof_path, $action_user_id, $request_id];
    } else {
        $sql = "UPDATE requests SET status = ?, approver_comments = ?, updated_by = ? WHERE id = ?";
        $types = "ssii";
        $params = [$action, $comments, $action_user_id, $request_id];
    }

    $stmt_update = $conn->prepare($sql);
    $stmt_update->bind_param($types, ...$params);
    $stmt_update->execute();

    $history_action = "Solicitud " . $action . " por Tesorería";
    $stmt_history = $conn->prepare("INSERT INTO request_history (request_id, user_id, action) VALUES (?, ?, ?)");
    $stmt_history->bind_param("iis", $request_id, $action_user_id, $history_action);
    $stmt_history->execute();

    $conn->commit();

    // --- INICIO: NOTIFICAR AL SOLICITANTE ---
    require_once __DIR__ . '/../notifications/send_notification.php';
    $solicitante_id = $request['user_id'];
    $title = "Tu Solicitud #{$request_id} ha sido actualizada por Tesorería";
    $body = "El nuevo estado es: {$action}.";
    $url = "/dashboard";
    sendNotificationToUsers([$solicitante_id], $title, $body, $url);
    // --- FIN: NOTIFICAR AL SOLICITANTE ---

    echo json_encode(['message' => 'Acción aplicada exitosamente.']);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Error al procesar la solicitud: ' . $e->getMessage()]);
}

$stmt_update->close();
$stmt_history->close();
$conn->close();