<?php
require_once __DIR__ . '/../app/Models/Database.php';

$db = Database::getInstance()->getConnection();

$stmt = $db->query("SELECT MAX(id) FROM cases");
$caseId = $stmt->fetchColumn();

echo $caseId ?: 0;
?>
