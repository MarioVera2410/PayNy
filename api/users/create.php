<?php
// /api/users/create.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Método no permitido']));
}

if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'Administrador') {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$input = json_decode(file_get_contents('php://input'), true);
$name = $input['name'] ?? '';
$email = $input['email'] ?? '';
$password = $input['password'] ?? '';
$role_id = $input['role_id'] ?? 0;
$business_units_id = $input['business_unit_id'] ?? null;
$team = $input['team'] ?? null;

if (empty($name) || empty($email) || empty($password) || empty($role_id)) {
    http_response_code(400);
    die(json_encode(['error' => 'Nombre, email, contraseña y rol son requeridos']));
}

// --- SE ELIMINÓ LA VALIDACIÓN OBSOLETA DE UNIDAD DE NEGOCIO DE AQUÍ ---

$hashed_password = password_hash($password, PASSWORD_DEFAULT);

$conn = getDbConnection();
$stmt = $conn->prepare("INSERT INTO users (name, email, password, role_id, business_unit_id, team) VALUES (?, ?, ?, ?, ?, ?)");
$stmt->bind_param("sssiss", $name, $email, $hashed_password, $role_id, $business_units_id, $team);

if ($stmt->execute()) {
    echo json_encode(['message' => 'Usuario creado exitosamente']);
} else {
    http_response_code(500);
    if ($conn->errno === 1062) {
        echo json_encode(['error' => 'El correo electrónico ya existe']);
    } else {
        echo json_encode(['error' => 'Error al crear el usuario']);
    }
}

$stmt->close();
$conn->close();