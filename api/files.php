<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = read_json_body();
    $action = (string) ($body['action'] ?? '');
    $pdo->beginTransaction();
    try {
        if ($action === 'delete') {
            $name = (string) ($body['name'] ?? '');
            if ($name === '') {
                throw new InvalidArgumentException('Nama file kosong.');
            }
            $pdo->prepare('DELETE FROM order_items WHERE src_file = ?')->execute([$name]);
            $pdo->prepare('DELETE FROM import_files WHERE name = ?')->execute([$name]);
        } elseif ($action === 'clear') {
            $pdo->exec('DELETE FROM order_items');
            $pdo->exec('DELETE FROM import_files');
        } else {
            throw new InvalidArgumentException('Aksi tidak dikenal.');
        }
        $pdo->commit();
    } catch (InvalidArgumentException $e) {
        $pdo->rollBack();
        fail($e->getMessage());
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    json_out(['ok' => true]);
}

// Daftar file beserta jumlah baris yang SAAT INI tersimpan (sudah memperhitungkan penimpaan oleh file yang lebih baru).
$counts = [];
foreach ($pdo->query('SELECT src_file, COUNT(*) AS n, COUNT(DISTINCT order_id) AS o FROM order_items GROUP BY src_file') as $r) {
    $counts[$r['src_file']] = $r;
}
$months = [];
foreach ($pdo->query('SELECT src_file, order_month FROM order_items GROUP BY src_file, order_month ORDER BY order_month') as $r) {
    $months[$r['src_file']][] = $r['order_month'];
}
$files = [];
foreach ($pdo->query('SELECT name, platform, imported_at, src_rows, warnings FROM import_files ORDER BY name') as $r) {
    $c = $counts[$r['name']] ?? ['n' => 0, 'o' => 0];
    $files[] = [
        'name' => $r['name'],
        'platform' => $r['platform'],
        'importedAt' => (int) $r['imported_at'],
        'rows' => (int) $r['src_rows'],
        'items' => (int) $c['n'],
        'orders' => (int) $c['o'],
        'months' => $months[$r['name']] ?? [],
        'warnings' => json_decode((string) $r['warnings'], true) ?: [],
    ];
}
json_out(['ok' => true, 'files' => $files]);
