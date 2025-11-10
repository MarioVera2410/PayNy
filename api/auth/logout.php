<?php
// /api/auth/logout.php
require_once __DIR__ . '/../../config/database.php';

$_SESSION = array();

if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

session_destroy();

header('Content-Type: application/json');
echo json_encode(['message' => 'Sesión cerrada exitosamente']);