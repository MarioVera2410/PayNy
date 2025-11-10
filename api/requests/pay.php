<?php
// /api/requests/pay.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); die(json_encode(['error' => 'Método no permitido']));
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado']));
}

$payer_id = $_SESSION['user_id'];
$payer_role = $_SESSION['user_role'];
$request_id = $_POST['request_id'] ?? 0;

if (empty($request_id)) {
    http_response_code(400); die(json_encode(['error' => 'ID de solicitud inválido.']));
}

$conn = getDbConnection();

// Obtener detalles de la solicitud, incluyendo la unidad de negocio del solicitante
$stmt = $conn->prepare("
    SELECT r.id, r.user_id, r.amount, r.banco, u.business_unit_id
    FROM requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.id = ? AND r.status = 'Autorizado'
");
$stmt->bind_param("i", $request_id);
$stmt->execute();
$request = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$request) {
    http_response_code(404);
    die(json_encode(['error' => 'Solicitud no encontrada o no está en estado "Autorizado".']));
}

// Lógica de autorización de pago
$can_pay = false;
$unit_budget_check = true; // Por defecto no se revisa el presupuesto

if ($payer_role === 'Tesoreria') {
    $can_pay = true;
} elseif ($payer_role === 'Empleado' || $payer_role === 'Administrador') {
    // Regla: Solicitante (Empleado o Admin) puede pagar si es su propia solicitud,
    // el banco es 'Fiscal' y tiene presupuesto suficiente.
    if ($request['user_id'] == $payer_id && $request['banco'] === 'Fiscal') {
        $unit_budget_check = false; // Marcar que se necesita revisar el presupuesto
        
        $budget_stmt = $conn->prepare("SELECT budget_remaining FROM business_units WHERE id = ?");
        $budget_stmt->bind_param("i", $request['business_unit_id']);
        $budget_stmt->execute();
        $budget_data = $budget_stmt->get_result()->fetch_assoc();
        $budget_stmt->close();

        if ($budget_data && $budget_data['budget_remaining'] >= $request['amount']) {
            $can_pay = true;
        } else {
            // No tiene presupuesto suficiente, pero no es un error, simplemente no puede pagar.
            http_response_code(403);
            die(json_encode(['error' => 'Presupuesto diario insuficiente para realizar este pago.']));
        }
    }
}

if (!$can_pay) {
    http_response_code(403);
    die(json_encode(['error' => 'No tienes permiso para pagar esta solicitud.']));
}

// Si se llegó hasta aquí, el pago es válido. Proceder a guardar.

$payment_proof_path = null;
if (isset($_FILES['payment_proof']) && $_FILES['payment_proof']['error'] === UPLOAD_ERR_OK) {
    // ... (código de subida de archivo sin cambios)
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

$conn->begin_transaction();
try {
    // Actualizar la solicitud a 'Pagado'
    $stmt_update = $conn->prepare("UPDATE requests SET status = 'Pagado', payment_proof_path = ?, updated_by = ? WHERE id = ?");
    $stmt_update->bind_param("sii", $payment_proof_path, $payer_id, $request_id);
    $stmt_update->execute();
    $stmt_update->close();

    // Si el pago lo hizo un solicitante, actualizar su presupuesto
    if ($unit_budget_check === false) {
        $stmt_budget = $conn->prepare("UPDATE business_units SET budget_remaining = budget_remaining - ? WHERE id = ?");
        $stmt_budget->bind_param("di", $request['amount'], $request['business_unit_id']);
        $stmt_budget->execute();
        $stmt_budget->close();
    }
    
    // Registrar en el historial
    $stmt_history = $conn->prepare("INSERT INTO request_history (request_id, user_id, action) VALUES (?, ?, 'Solicitud Pagada')");
    $stmt_history->bind_param("ii", $request_id, $payer_id);
    $stmt_history->execute();
    $stmt_history->close();

    $conn->commit();
    
    // --- INICIO: NOTIFICAR AL SOLICITANTE ---
    require_once __DIR__ . '/../notifications/send_notification.php';
    $solicitante_id = $request['user_id'];
    $title = "Tu Solicitud #{$request_id} ha sido Pagada";
    $body = "La solicitud ha sido marcada como 'Pagado'.";
    $url = "/dashboard";
    sendNotificationToUsers([$solicitante_id], $title, $body, $url);
    // --- FIN: NOTIFICAR AL SOLICITANTE ---
    echo json_encode(['message' => 'Solicitud pagada exitosamente.']);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Error al procesar el pago: ' . $e->getMessage()]);
}

$conn->close();