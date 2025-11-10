<?php
// /api/data/get_budget.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

// Iniciar sesión para acceder a las variables de sesión
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

// Obtener el ID de la unidad de negocio del usuario actual desde la sesión
$user_id = $_SESSION['user_id'];
$conn = getDbConnection();

// Primero, obtenemos el business_unit_id del usuario logueado
$user_stmt = $conn->prepare("SELECT business_unit_id FROM users WHERE id = ?");
$user_stmt->bind_param("i", $user_id);
$user_stmt->execute();
$user_result = $user_stmt->get_result()->fetch_assoc();
$user_stmt->close();

if (!$user_result || empty($user_result['business_unit_id'])) {
    // Si el usuario no tiene una unidad de negocio asignada, devolver 0.
    echo json_encode(['budget_remaining' => '0.00']);
    $conn->close();
    exit();
}

$unit_id = $user_result['business_unit_id'];

// Ahora, con el unit_id, obtenemos el presupuesto
$budget_stmt = $conn->prepare("SELECT budget_remaining FROM business_units WHERE id = ?");
$budget_stmt->bind_param("i", $unit_id);
$budget_stmt->execute();
$budget_data = $budget_stmt->get_result()->fetch_assoc();
$budget_stmt->close();

$conn->close();

if ($budget_data) {
    echo json_encode($budget_data);
} else {
    // Devuelve 0 si la unidad no se encuentra (caso raro)
    echo json_encode(['budget_remaining' => '0.00']);
}
?>