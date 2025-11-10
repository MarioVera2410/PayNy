<?php
// /api/requests/read.php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(403); die(json_encode(['error' => 'Acceso no autorizado']));
}

$conn = getDbConnection();
$role = $_SESSION['user_role'];
$user_id = $_SESSION['user_id'];

// Obtener parámetros de búsqueda y fecha
$search_term = $_GET['search'] ?? '';
$start_date = $_GET['startDate'] ?? '';
$end_date = $_GET['endDate'] ?? '';
$status_filter = $_GET['status'] ?? null; // Usar null para saber si el parámetro fue enviado

// ... (código para obtener el team del usuario sin cambios)
$user_team_query = $conn->prepare("SELECT team FROM users WHERE id = ?");
$user_team_query->bind_param("i", $user_id);
$user_team_query->execute();
$user_team_result = $user_team_query->get_result()->fetch_assoc();
$user_team = $user_team_result['team'] ?? null;
$user_team_query->close();

$query = "
    SELECT 
        r.id, r.user_id, r.business_unit_id, r.proveedor_id, r.razon_social_id,
        r.tipo_gasto_id, r.concepto_id, r.concepto_pago,
        r.banco, r.amount, r.concept, r.deadline, r.status, r.rejection_reason,
        r.payment_proof_path, r.quote_file_path, r.created_at,
        bu.name as business_unit_name, 
        u.name as creator_name,
        creator_role.name as creator_role, 
        creator_bu.budget_remaining as user_budget_remaining,
        p.name as provider_name,
        p.account as provider_account, p.reference as provider_reference,
        rs.name as razon_social_name,
        c.name as concepto_name,
        r.approver_comments,
        approver.name as approver_name,
        payer.name as payer_name
    FROM requests r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN business_units creator_bu ON u.business_unit_id = creator_bu.id
    JOIN roles creator_role ON u.role_id = creator_role.id
    JOIN business_units bu ON r.business_unit_id = bu.id
    LEFT JOIN proveedores p ON r.proveedor_id = p.id
    LEFT JOIN razones_sociales rs ON r.razon_social_id = rs.id
    LEFT JOIN conceptos c ON r.concepto_id = c.id
    LEFT JOIN users approver ON r.approver_id = approver.id
    LEFT JOIN users payer ON r.updated_by = payer.id
";

$where_clauses = [];
$params = [];
$types = '';

// Lógica de visibilidad por equipo
if ($role === 'Empleado' || ($role === 'Administrador' && !isset($_GET['view_all']))) {
    if (!empty($user_team)) {
        $where_clauses[] = "(r.user_id = ? OR u.team = ?)";
        $params = [$user_id, $user_team];
        $types = 'is';
    } else {
        $where_clauses[] = "r.user_id = ?";
        $params = [$user_id];
        $types = 'i';
    }
}

// Lógica de búsqueda de texto
if (!empty($search_term)) {
    $like_term = "%{$search_term}%";
    $where_clauses[] = "(r.id LIKE ? OR u.name LIKE ? OR p.name LIKE ? OR r.concept LIKE ? OR r.amount LIKE ? OR bu.name LIKE ? OR c.name LIKE ?)";
    array_push($params, $like_term, $like_term, $like_term, $like_term, $like_term, $like_term, $like_term);
    $types .= 'sssssss';
}

// Lógica de búsqueda por fecha
if (!empty($start_date)) { $where_clauses[] = "r.deadline >= ?"; $params[] = $start_date; $types .= 's'; }
if (!empty($end_date)) { $where_clauses[] = "r.deadline <= ?"; $params[] = $end_date; $types .= 's'; }

// --- LÓGICA DE FILTRO DE ESTADO CORREGIDA ---
if ($status_filter !== null && $status_filter !== '') {
    // Si se envió un estado específico (Pendiente, Correccion, etc.), se aplica.
    $where_clauses[] = "r.status = ?";
    $params[] = $status_filter;
    $types .= 's';
}
// Si $status_filter es "" (pestaña "Todas"), no se añade ninguna condición de estado, mostrando todas.
// Se eliminó el caso especial que forzaba a 'Pendiente' para el Autorizador.

if (!empty($where_clauses)) {
    $query .= " WHERE " . implode(' AND ', $where_clauses);
}

$query .= " ORDER BY r.created_at DESC";

$stmt = $conn->prepare($query);
if (!empty($params)) {
    $stmt->bind_param($types, ...$params);
}
$stmt->execute();
$result = $stmt->get_result();

$requests = [];
while ($row = $result->fetch_assoc()) {
    $requests[] = $row;
}

echo json_encode($requests);
$stmt->close();
$conn->close();