<?php
// /api/data/get_form_data_v3.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$conn = getDbConnection();
$data = [];

// Obtener Unidades de Negocio
$units_result = $conn->query("SELECT id, name FROM business_units ORDER BY name");
$data['business_units'] = $units_result->fetch_all(MYSQLI_ASSOC);

// Obtener Proveedores
$providers_result = $conn->query("SELECT id, name, account, reference, business_unit_id FROM proveedores ORDER BY name");
$data['providers'] = $providers_result->fetch_all(MYSQLI_ASSOC);

// --- INICIO DE LA CORRECCIÓN ---
// La consulta ahora incluye la columna business_unit_id
$reasons_result = $conn->query("SELECT id, name, business_unit_id FROM razones_sociales ORDER BY name");
// --- FIN DE LA CORRECCIÓN ---
$data['razones_sociales'] = $reasons_result->fetch_all(MYSQLI_ASSOC);

// Obtener Tipos de Gasto
$tipos_gasto_result = $conn->query("SELECT id, name FROM tipos_gasto ORDER BY name");
$data['tipos_gasto'] = $tipos_gasto_result->fetch_all(MYSQLI_ASSOC);

// Obtener Conceptos
$conceptos_result = $conn->query("SELECT id, name, tipo_gasto_id FROM conceptos ORDER BY name");
$data['conceptos'] = $conceptos_result->fetch_all(MYSQLI_ASSOC);

echo json_encode($data);

$conn->close();