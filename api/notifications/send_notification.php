<?php
// /api/notifications/send_notification.php
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../config/database.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

function sendNotificationToUsers(array $user_ids, string $title, string $body, string $url) {
    if (empty($user_ids)) {
        return; // No hay a quién notificar
    }

    $conn = getDbConnection();
    
    // Preparar la consulta para obtener las suscripciones de los usuarios
    $in_clause = implode(',', array_fill(0, count($user_ids), '?'));
    $types = str_repeat('i', count($user_ids));
    
    $stmt = $conn->prepare("SELECT endpoint, p256dh, auth FROM subscriptions WHERE user_id IN ($in_clause)");
    $stmt->bind_param($types, ...$user_ids);
    $stmt->execute();
    $subscriptions_result = $stmt->get_result();
    
    $subscriptions = [];
    while ($row = $subscriptions_result->fetch_assoc()) {
        $subscriptions[] = Subscription::create([
            'endpoint' => $row['endpoint'],
            'publicKey' => $row['p256dh'],
            'authToken' => $row['auth'],
        ]);
    }
    $stmt->close();
    $conn->close();

    if (empty($subscriptions)) {
        return; // No hay dispositivos registrados para notificar
    }

    // Preparar el envío
    $auth = [
        'VAPID' => [
            'subject' => 'mailto:tu_email_de_contacto@tudominio.com', // Opcional
            'publicKey' => VAPID_PUBLIC_KEY,
            'privateKey' => VAPID_PRIVATE_KEY,
        ],
    ];

    $webPush = new WebPush($auth);
    
    $payload = json_encode([
        'title' => $title,
        'body' => $body,
        'url' => $url, // URL a la que se irá al hacer clic
    ]);

    foreach ($subscriptions as $subscription) {
        $webPush->queueNotification($subscription, $payload);
    }

    // Enviar todas las notificaciones en cola
    foreach ($webPush->flush() as $report) {
        $endpoint = $report->getRequest()->getUri()->__toString();
        if (!$report->isSuccess()) {
            // Opcional: registrar los errores, por ejemplo, para limpiar suscripciones expiradas
            // error_log("Error al enviar a {$endpoint}: {$report->getReason()}");
        }
    }
}
?>