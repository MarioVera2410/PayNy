<?php
// /api/requests/update.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Método no permitido']));
}

if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'Tesoreria') {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$user_id = $_SESSION['user_id'];
$request_id = $_POST['request_id'] ?? 0;
$status = $_POST['status'] ?? ''; // 'Aprobado' o 'Rechazado'
$rejection_reason = $_POST['rejection_reason'] ?? null;

if (empty($request_id) || empty($status) || !in_array($status, ['Aprobado', 'Rechazado'])) {
    http_response_code(400);
    die(json_encode(['error' => 'Datos inválidos']));
}

$conn = getDbConnection();
$payment_proof_path = null;
$action_history = '';

// Lógica de subida de archivo si se aprueba
if ($status === 'Aprobado') {
    if (isset($_FILES['payment_proof']) && $_FILES['payment_proof']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['payment_proof'];
        
        // Validar tamaño y tipo
        if ($file['size'] > 20 * 1024 * 1024) { // 20 MB
            http_response_code(400);
            die(json_encode(['error' => 'El archivo es demasiado grande (máx 20MB)']));
        }
        $allowed_types = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!in_array($file['type'], $allowed_types)) {
            http_response_code(400);
            die(json_encode(['error' => 'Tipo de archivo no permitido (solo JPG, PNG, PDF)']));
        }

        $upload_dir = __DIR__ . '/../../uploads/';
        $filename = uniqid() . '-' . basename($file['name']);
        $payment_proof_path = '/uploads/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
            http_response_code(500);
            die(json_encode(['error' => 'Error al mover el archivo subido']));
        }
        $action_history = "Solicitud Aprobada";
    } else {
        http_response_code(400);
        die(json_encode(['error' => 'El comprobante de pago es requerido para aprobar']));
    }
} else { // Si es Rechazado
    if (empty($rejection_reason)) {
        http_response_code(400);
        die(json_encode(['error' => 'El motivo de rechazo es requerido']));
    }
    $action_history = "Solicitud Rechazada";
}

// Actualizar la base de datos
$conn->begin_transaction();
try {
    $stmt = $conn->prepare(
        "UPDATE requests SET status = ?, rejection_reason = ?, payment_proof_path = ?, updated_by = ? WHERE id = ?"
    );
    $stmt->bind_param("sssii", $status, $rejection_reason, $payment_proof_path, $user_id, $request_id);
    $stmt->execute();

    $stmt_history = $conn->prepare("INSERT INTO request_history (request_id, user_id, action) VALUES (?, ?, ?)");
    $stmt_history->bind_param("iis", $request_id, $user_id, $action_history);
    $stmt_history->execute();

    $conn->commit();
    
    // Aquí iría la lógica para enviar el correo de notificación a la unidad de negocio
    
    echo json_encode(['message' => 'Solicitud actualizada exitosamente']);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Error al actualizar la solicitud: ' . $e->getMessage()]);
}

$stmt->close();
$stmt_history->close();
$conn->close();