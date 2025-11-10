<?php
// /api/auth/check_session.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if (isset($_SESSION['user_id'])) {
    echo json_encode([
        'loggedIn' => true,
        'user' => [
            'id' => $_SESSION['user_id'],
            'name' => $_SESSION['user_name'],
            'role' => $_SESSION['user_role'],
            'business_unit_id' => $_SESSION['business_unit_id'],
            'business_unit_name' => $_SESSION['business_unit_name']
        ],
        'config' => [ // <-- Añadimos una sección de configuración
            'paymentThreshold' => PAYMENT_THRESHOLD
        ]
    ]);
} else {
    echo json_encode(['loggedIn' => false]);
}