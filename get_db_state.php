<?php
require_once __DIR__ . '/wp-config.json';
$config = json_decode(file_get_contents(__DIR__ . '/wp-config.json'), true);

$host = $config['DB_HOST'];
$db   = $config['DB_NAME'];
$user = $config['DB_USER'];
$pass = $config['DB_PASSWORD'];
$port = isset($config['DB_PORT']) ? $config['DB_PORT'] : 3306;

try {
    $dsn = "mysql:host=$host;dbname=$db;port=$port;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $stmt = $pdo->prepare("SELECT * FROM app_state WHERE state_key = 'commission_tags_list'");
    $stmt->execute();
    $row = $stmt->fetch();
    if ($row) {
        echo "FOUND: " . $row['state_key'] . " -> " . $row['state_value'] . "\n";
    } else {
        echo "NOT FOUND!\n";
    }

    $stmt2 = $pdo->prepare("SELECT state_key FROM app_state");
    $stmt2->execute();
    echo "ALL KEYS IN DB:\n";
    foreach ($stmt2->fetchAll() as $r) {
        echo "- " . $r['state_key'] . "\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
