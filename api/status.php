<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

/** Dipanggil saat aplikasi dibuka: memastikan database dan tabel ada, lalu melaporkan isinya. */
$pdo = db();
ensure_schema($pdo);
$c = db_config();
$items = (int) $pdo->query('SELECT COUNT(*) FROM order_items')->fetchColumn();
$files = (int) $pdo->query('SELECT COUNT(*) FROM import_files')->fetchColumn();
json_out([
    'ok' => true,
    'driver' => $c['driver'],
    'database' => $c['driver'] === 'sqlite' ? 'sqlite' : $c['name'],
    'items' => $items,
    'files' => $files,
]);
