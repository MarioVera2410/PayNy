<?php
// /api/requests/create.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); die(json_encode(['error' => 'Método no permitido']));
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado']));
}
$user_role = $_SESSION['user_role'] ?? '';
if ($user_role !== 'Empleado' && $user_role !== 'Administrador') {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado. Tu rol no permite crear solicitudes.']));
}

// Recopilar datos del formulario
$user_id = $_SESSION['user_id'];
$business_unit_id = $_POST['business_unit_id'] ?? 0;
$proveedor_id = $_POST['proveedor_id'] ?? 0;
$razon_social_id = $_POST['razon_social_id'] ?? 0;
$tipo_gasto_id = $_POST['tipo_gasto_id'] ?? 0;
$concepto_id = $_POST['concepto_id'] ?? 0;
$concepto_pago = $_POST['concepto_pago'] ?? ''; // Nuevo campo
$banco = $_POST['banco'] ?? ''; // Nuevo campo
$amount = $_POST['amount'] ?? 0;
$concept = $_POST['concept'] ?? ''; // Descripción adicional
$deadline = $_POST['deadline'] ?? '';

if (empty($business_unit_id) || empty($proveedor_id) || empty($razon_social_id) || empty($tipo_gasto_id) || empty($concepto_id) || empty($concepto_pago) || empty($banco) || !isset($amount) || empty($deadline)) {
    http_response_code(400); die(json_encode(['error' => 'Todos los campos marcados son requeridos']));
}

$quote_file_path = null;
if (isset($_FILES['quote_file']) && $_FILES['quote_file']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['quote_file'];
    if ($file['size'] > 20 * 1024 * 1024) { // 20 MB
        http_response_code(400); die(json_encode(['error' => 'El archivo es demasiado grande (máx 20MB)']));
    }
    $upload_dir = __DIR__ . '/../../uploads/';
    $filename = 'cotizacion-' . uniqid() . '-' . basename($file['name']);
    $quote_file_path = '/uploads/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
        http_response_code(500); die(json_encode(['error' => 'Error al guardar el archivo de cotización']));
    }
} else {
    http_response_code(400); die(json_encode(['error' => 'El archivo de cotización/ticket es obligatorio']));
}

$conn = getDbConnection();
$conn->begin_transaction();

try {
    $stmt = $conn->prepare(
        "INSERT INTO requests (user_id, business_unit_id, razon_social_id, proveedor_id, tipo_gasto_id, concepto_id, concepto_pago, banco, amount, concept, deadline, quote_file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param("iiiiisssdsss", $user_id, $business_unit_id, $razon_social_id, $proveedor_id, $tipo_gasto_id, $concepto_id, $concepto_pago, $banco, $amount, $concept, $deadline, $quote_file_path);
    $stmt->execute();
    
    $request_id = $conn->insert_id;

    $stmt_history = $conn->prepare("INSERT INTO request_history (request_id, user_id, action) VALUES (?, ?, 'Solicitud Creada')");
    $stmt_history->bind_param("ii", $request_id, $user_id);
    $stmt_history->execute();

    $conn->commit();
    // ... (código para guardar en la BD y en el historial) ...
    $stmt_history->execute();

    $conn->commit();

    // --- INICIO: ENVIAR NOTIFICACIÓN A AUTORIZADORES ---
    require_once __DIR__ . '/../notifications/send_notification.php';
    
    $conn_notify = getDbConnection();
    // Buscar los IDs de todos los usuarios con el rol 'Autorizador'
    $autorizadores_result = $conn_notify->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'Autorizador')");
    $autorizador_ids = [];
    while ($row = $autorizadores_result->fetch_assoc()) {
        $autorizador_ids[] = $row['id'];
    }
    $conn_notify->close();

    if (!empty($autorizador_ids)) {
        $title = "Nueva Solicitud Pendiente";
        $body = "Se ha creado la solicitud #{$request_id}. Por favor, revísala.";
        $url = "/dashboard"; // URL a la que irá el usuario
        sendNotificationToUsers($autorizador_ids, $title, $body, $url);
    }
    // --- FIN: ENVIAR NOTIFICACIÓN ---
    echo json_encode(['message' => 'Solicitud creada exitosamente', 'request_id' => $request_id]);

} catch (Exception $e) {
    $conn->rollback();
    if ($quote_file_path && file_exists(__DIR__ . '/../../' . $quote_file_path)) {
        unlink(__DIR__ . '/../../' . $quote_file_path);
    }
    http_response_code(500);
    
    echo json_encode(['error' => 'Error al crear la solicitud: ' . $e->getMessage()]);
}

$stmt->close();
$stmt_history->close();
$conn->close();