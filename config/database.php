<?php
// /config/database.php

define('DB_HOST', 'localhost');
define('DB_USER', 'mariover_admin');
define('DB_PASS', 'eEBC&MOD?[e=');
define('DB_NAME', 'mariover_payny');
define('VAPID_PUBLIC_KEY', 'BHJZ3UZ0v9ZPcczVEm2KTP8r4BIk07zx97APHse7n-nLz-L7UbQZqRXU0gvDfmIUIb8QLku1wpeaMwtLrw9rm6o');
define('VAPID_PRIVATE_KEY', 'Na3KOfiGrrOvE1cZMEjMnw5f_lMlN4-RHqeEIBCvkIc');
function getDbConnection() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

    if ($conn->connect_error) {
        http_response_code(500);
        die(json_encode(['error' => 'Error de conexión a la base de datos: ' . $conn->connect_error]));
    }
    
    $conn->set_charset("utf8mb4");

    return $conn;
}

// Iniciar sesión segura
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
define('PAYMENT_THRESHOLD', 10001);