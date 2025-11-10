<?php
// /api/requests/authorize.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Método no permitido']));
}

if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'Autorizador') {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$input = json_decode(file_get_contents('php://input'), true);

$approver_id = $_SESSION['user_id'];
$request_id = $input['request_id'] ?? 0;
$action = $input['action'] ?? '';
$comments = $input['comments'] ?? '';

if (empty($request_id) || !in_array($action, ['Autorizado', 'Rechazado', 'Correccion'])) {
    http_response_code(400);
    die(json_encode(['error' => 'Datos inválidos']));
}

if (($action === 'Rechazado' || $action === 'Correccion') && empty($comments)) {
    http_response_code(400);
    die(json_encode(['error' => 'Los comentarios son obligatorios para esta acción.']));
}

$conn = getDbConnection();
$conn->begin_transaction();

try {
    // Actualizar la solicitud
    $stmt = $conn->prepare(
        "UPDATE requests SET status = ?, approver_id = ?, approver_comments = ? WHERE id = ? AND status = 'Pendiente'"
    );
    $stmt->bind_param("sisi", $action, $approver_id, $comments, $request_id);
    $stmt->execute();

    if ($stmt->affected_rows === 0) {
        throw new Exception('La solicitud no se pudo actualizar. Es posible que ya haya sido procesada.');
    }

    // Registrar en el historial
    $history_action = "Solicitud " . $action;
    $stmt_history = $conn->prepare("INSERT INTO request_history (request_id, user_id, action) VALUES (?, ?, ?)");
    $stmt_history->bind_param("iis", $request_id, $approver_id, $history_action);
    $stmt_history->execute();

    $conn->commit();

    // --- INICIO: LÓGICA DE NOTIFICACIONES ---
    require_once __DIR__ . '/../notifications/send_notification.php';
    
    // Notificar al solicitante sobre cualquier cambio
    $conn_notify = getDbConnection();
    $solicitante_stmt = $conn_notify->prepare("SELECT user_id FROM requests WHERE id = ?");
    $solicitante_stmt->bind_param("i", $request_id);
    $solicitante_stmt->execute();
    $solicitante_result = $solicitante_stmt->get_result()->fetch_assoc();
    
    if ($solicitante_result) {
        $solicitante_id = $solicitante_result['user_id'];
        $title_solicitante = "Tu Solicitud #{$request_id} ha sido actualizada";
        $body_solicitante = "El estado de tu solicitud ahora es: {$action}.";
        $url = "/dashboard";
        sendNotificationToUsers([$solicitante_id], $title_solicitante, $body_solicitante, $url);
    }
    
    // Si la acción fue "Autorizado", notificar también a Tesorería
    if ($action === 'Autorizado') {
        $tesoreria_result = $conn_notify->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'Tesoreria')");
        $tesoreria_ids = [];
        while ($row = $tesoreria_result->fetch_assoc()) {
            $tesoreria_ids[] = $row['id'];
        }
        
        if (!empty($tesoreria_ids)) {
            $title_tesoreria = "Solicitud Autorizada para Pago";
            $body_tesoreria = "La solicitud #{$request_id} ha sido autorizada y está lista para ser revisada.";
            $url = "/dashboard";
            sendNotificationToUsers($tesoreria_ids, $title_tesoreria, $body_tesoreria, $url);
        }
    }
    
    $conn_notify->close();
    // --- FIN: LÓGICA DE NOTIFICACIONES ---

    echo json_encode(['message' => 'Solicitud actualizada exitosamente.']);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

$stmt->close();
if (isset($stmt_history)) $stmt_history->close();
$conn->close();