<?php
// /api/jobs/reset_budgets.php
// Este script está diseñado para ser ejecutado por un CRON job, no por un usuario.

// Cargar la configuración de la base de datos
require_once __DIR__ . '/../../config/database.php';

// Establecer la zona horaria a la Ciudad de México
date_default_timezone_set('America/Mexico_City');

$conn = getDbConnection();

// Actualizar la columna 'budget_remaining' para que sea igual a 'budget_daily_limit'
$sql = "UPDATE business_units SET budget_remaining = budget_daily_limit";

if ($conn->query($sql) === TRUE) {
    // Éxito: registrar en un log o simplemente terminar
    $log_message = date('Y-m-d H:i:s') . " - Presupuestos reiniciados exitosamente.\n";
    // Opcional: guardar en un archivo de log para auditoría
    // file_put_contents(__DIR__ . '/reset_log.txt', $log_message, FILE_APPEND);
    echo "Presupuestos reiniciados.";
} else {
    // Error: registrar en un log
    $log_message = date('Y-m-d H:i:s') . " - ERROR al reiniciar presupuestos: " . $conn->error . "\n";
    // Opcional: guardar en un archivo de log
    // file_put_contents(__DIR__ . '/reset_log.txt', $log_message, FILE_APPEND);
    echo "Error al reiniciar presupuestos.";
}

$conn->close();
?>