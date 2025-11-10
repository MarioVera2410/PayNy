<?php
// /api/auth/login.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Método no permitido']));
}

$input = json_decode(file_get_contents('php://input'), true);
$email = $input['email'] ?? '';
$password = $input['password'] ?? '';



if (empty($email) || empty($password)) {
    http_response_code(400);
    die(json_encode(['error' => 'Email y contraseña son requeridos']));
}

$conn = getDbConnection();
$stmt = $conn->prepare("
    SELECT u.id, u.name, u.email, u.password, u.team, r.name as role, bu.name as business_unit_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN business_units bu ON u.business_unit_id = bu.id
    WHERE u.email = ?
");
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($user = $result->fetch_assoc()) {
    if (password_verify($password, $user['password'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_name'] = $user['name'];
        $_SESSION['user_role'] = $user['role'];
        $_SESSION['business_unit_id'] = $user['business_unit_id'];
        $_SESSION['business_unit_name'] = $user['business_unit_name'];
        $_SESSION['user_team'] = $user['team'];
        echo json_encode([
            'message' => 'Login exitoso',
            'user' => [
                'name' => $user['name'],
                'role' => $user['role']
            ]
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales inválidas']);
    }
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Credenciales inválidas']);
}

$stmt->close();
$conn->close();