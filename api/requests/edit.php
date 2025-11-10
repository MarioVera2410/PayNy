<?php
// /api/requests/edit.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); die(json_encode(['error' => 'Método no permitido']));
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado']));
}

// Recopilar todos los datos del formulario
$user_id = $_SESSION['user_id'];
$request_id = $_POST['request_id'] ?? 0;
$business_unit_id = $_POST['business_unit_id'] ?? 0;
$proveedor_id = $_POST['proveedor_id'] ?? 0;
$razon_social_id = $_POST['razon_social_id'] ?? 0;
$tipo_gasto_id = $_POST['tipo_gasto_id'] ?? 0;
$concepto_id = $_POST['concepto_id'] ?? 0;
$concepto_pago = $_POST['concepto_pago'] ?? '';
$banco = $_POST['banco'] ?? '';
$amount = $_POST['amount'] ?? 0;
$concept = $_POST['concept'] ?? '';
$deadline = $_POST['deadline'] ?? '';

if (empty($request_id) || empty($business_unit_id) || empty($proveedor_id) || empty($razon_social_id) || empty($tipo_gasto_id) || empty($concepto_id) || empty($concepto_pago) || empty($banco) || !isset($amount) || empty($deadline)) {
    http_response_code(400); die(json_encode(['error' => 'Todos los campos son requeridos']));
}

$conn = getDbConnection();

// Verificación de seguridad: solo el creador puede editar y solo si está Pendiente o en Corrección
$stmt_check = $conn->prepare("SELECT user_id, status, quote_file_path FROM requests WHERE id = ?");
$stmt_check->bind_param("i", $request_id);
$stmt_check->execute();
$result = $stmt_check->get_result();
$request = $result->fetch_assoc();

if (!$request) {
    http_response_code(404); die(json_encode(['error' => 'Solicitud no encontrada.']));
}
if ($request['user_id'] != $user_id) {
    http_response_code(403); die(json_encode(['error' => 'No tienes permiso para editar esta solicitud.']));
}
if (!in_array($request['status'], ['Pendiente', 'Correccion'])) {
    http_response_code(403); die(json_encode(['error' => 'Esta solicitud ya no puede ser editada.']));
}
$stmt_check->close();

// Manejo de archivo (si se sube uno nuevo)
$quote_file_path = $request['quote_file_path'];
if (isset($_FILES['quote_file']) && $_FILES['quote_file']['error'] === UPLOAD_ERR_OK) {
    $old_file_full_path = __DIR__ . '/../../' . $quote_file_path;
    if ($quote_file_path && file_exists($old_file_full_path)) {
        unlink($old_file_full_path);
    }
    $file = $_FILES['quote_file'];
    $upload_dir = __DIR__ . '/../../uploads/';
    $filename = 'cotizacion-' . uniqid() . '-' . basename($file['name']);
    $quote_file_path = '/uploads/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
        http_response_code(500); die(json_encode(['error' => 'Error al guardar el nuevo archivo de cotización']));
    }
}

$conn->begin_transaction();
try {
    // --- INICIO DE LA CORRECCIÓN ---
    // Se establece el nuevo estado a 'Pendiente' después de cualquier edición
    $new_status = 'Pendiente';
    
    $stmt = $conn->prepare(
        "UPDATE requests SET 
            business_unit_id=?, razon_social_id=?, proveedor_id=?, 
            tipo_gasto_id=?, concepto_id=?, concepto_pago=?, banco=?, 
            amount=?, concept=?, deadline=?, quote_file_path=?, status=? 
        WHERE id=?"
    );
    $stmt->bind_param("iiiiisssdsssi", 
        $business_unit_id, $razon_social_id, $proveedor_id, 
        $tipo_gasto_id, $concepto_id, $concepto_pago, $banco, 
        $amount, $concept, $deadline, $quote_file_path, 
        $new_status, $request_id
    );
    // --- FIN DE LA CORRECCIÓN ---
    
    $stmt->execute();
    
    // No se registra en el historial, como se solicitó
    
    $conn->commit();
    echo json_encode(['message' => 'Solicitud actualizada exitosamente']);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Error al actualizar la solicitud: ' . $e->getMessage()]);
}

$stmt->close();
$conn->close();