<?php
// /api/users/read.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

session_start(); // Asegúrate de que la sesión esté iniciada

if (!isset($_SESSION['user_id']) || $_SESSION['user_role'] !== 'Administrador') {
    http_response_code(403);
    die(json_encode(['error' => 'Acceso no autorizado']));
}

$conn = getDbConnection();

$action = $_GET['action'] ?? 'get_users';

if ($action === 'get_form_data') {
    // Esta parte no cambia
    $roles_result = $conn->query("SELECT id, name FROM roles");
    $roles = $roles_result->fetch_all(MYSQLI_ASSOC);

    $units_result = $conn->query("SELECT id, name FROM business_units");
    $units = $units_result->fetch_all(MYSQLI_ASSOC);

    echo json_encode(['roles' => $roles, 'business_units' => $units]);

} else { // 'get_users' por defecto
    
    // 1. Recibimos el término de búsqueda del frontend
    $searchTerm = $_GET['search'] ?? '';

    // 2. Construimos la consulta base
    $query = "
        SELECT u.id, u.name, u.email, r.name as role, bu.name as business_unit_name, u.created_at
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN business_units bu ON u.business_unit_id = bu.id
    ";

    $params = [];
    $types = '';

    // 3. Si hay un término de búsqueda, añadimos la cláusula WHERE
    if (!empty($searchTerm)) {
        $query .= " WHERE u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ?";
        $likeTerm = "%" . $searchTerm . "%";
        // Añadimos el término 3 veces, uno por cada '?' en la consulta
        array_push($params, $likeTerm, $likeTerm, $likeTerm);
        $types .= 'sss'; // 's' por cada parámetro de tipo string
    }

    $query .= " ORDER BY u.created_at DESC";

    // 4. Usamos sentencias preparadas para seguridad
    $stmt = $conn->prepare($query);

    if (!empty($params)) {
        // Enlaza los parámetros a la consulta
        $stmt->bind_param($types, ...$params);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $users = $result->fetch_all(MYSQLI_ASSOC);
    
    echo json_encode($users);

    $stmt->close();
}

$conn->close();