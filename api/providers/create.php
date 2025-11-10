<?php
// /api/providers/create.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Método no permitido']));
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$input = json_decode(file_get_contents('php://input'), true);
$name = $input['name'] ?? '';
$account = $input['account'] ?? ''; // Cambiado de null a string vacío
$reference = $input['reference'] ?? ''; // Cambiado de null a string vacío
$business_unit_id = $input['business_unit_id'] ?? 0;

// --- VALIDACIÓN CORREGIDA ---
if (empty($name) || empty($account) || empty($reference) || empty($business_unit_id)) {
    http_response_code(400);
    die(json_encode(['error' => 'Nombre, cuenta, referencia y unidad de negocio son obligatorios.']));
}

$conn = getDbConnection();

try {
    $stmt = $conn->prepare(
        "INSERT INTO proveedores (name, account, reference, business_unit_id) VALUES (?, ?, ?, ?)"
    );
    $stmt->bind_param("sssi", $name, $account, $reference, $business_unit_id);
    $stmt->execute();
    
    $new_provider_id = $conn->insert_id;

    echo json_encode([
        'message' => 'Proveedor creado exitosamente.',
        'new_provider' => [
            'id' => $new_provider_id,
            'name' => $name,
            'account' => $account,
            'reference' => $reference,
            'business_unit_id' => (int)$business_unit_id
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al crear el proveedor: ' . $e->getMessage()]);
}

$stmt->close();
$conn->close();