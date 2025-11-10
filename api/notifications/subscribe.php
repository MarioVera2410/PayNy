<?php
// /api/notifications/subscribe.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); die(json_encode(['error' => 'Método no permitido']));
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado']));
}

$user_id = $_SESSION['user_id'];
$subscription = json_decode(file_get_contents('php://input'), true);

if (!isset($subscription['endpoint']) || !isset($subscription['keys']['p256dh']) || !isset($subscription['keys']['auth'])) {
    http_response_code(400);
    die(json_encode(['error' => 'Suscripción inválida.']));
}

$endpoint = $subscription['endpoint'];
$p256dh = $subscription['keys']['p256dh'];
$auth = $subscription['keys']['auth'];

$conn = getDbConnection();

// Usar INSERT ... ON DUPLICATE KEY UPDATE para evitar duplicados y actualizar si es necesario
$stmt = $conn->prepare(
    "INSERT INTO subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = ?, p256dh = ?, auth = ?"
);
$stmt->bind_param("isssiss", $user_id, $endpoint, $p256dh, $auth, $user_id, $p256dh, $auth);

if ($stmt->execute()) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo guardar la suscripción.']);
}

$stmt->close();
$conn->close();