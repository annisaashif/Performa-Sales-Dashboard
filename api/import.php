<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/items_lib.php';

/**
 * Impor bertahap, supaya file besar tidak melewati batas ukuran permintaan PHP.
 *   action=batch  : simpan sekumpulan baris (REPLACE: baris yang sama ditimpa, bukan digandakan)
 *   action=finish : hapus baris lama milik file ini yang tidak ada lagi di impor terbaru, catat riwayat impor
 */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Gunakan metode POST.', 405);
}
$body = read_json_body();
$action = (string) ($body['action'] ?? '');
$file = $body['file'] ?? [];
$name = cut($file['name'] ?? '', 255);
$platform = (string) ($file['platform'] ?? '');
$importId = (int) ($body['importId'] ?? 0);
if ($name === '' || !in_array($platform, PLATFORMS, true) || $importId <= 0) {
    fail('Data file tidak lengkap.');
}

$pdo = db();

if ($action === 'batch') {
    $items = $body['items'] ?? null;
    if (!is_array($items) || count($items) === 0) {
        fail('Tidak ada baris untuk disimpan.');
    }
    if (count($items) > 5000) {
        fail('Satu permintaan maksimal 5.000 baris.');
    }
    $cols = array_values(ITEM_COLUMNS);
    $cols[] = 'import_id';
    $one = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->beginTransaction();
    try {
        foreach (array_chunk($items, 400) as $chunk) {
            $params = [];
            foreach ($chunk as $it) {
                if (!is_array($it)) {
                    throw new InvalidArgumentException('Baris data tidak valid.');
                }
                foreach (prepare_item($it, $name, $importId) as $v) {
                    $params[] = $v;
                }
            }
            $sql = 'REPLACE INTO order_items (' . implode(',', $cols) . ') VALUES ' . implode(',', array_fill(0, count($chunk), $one));
            $pdo->prepare($sql)->execute($params);
        }
        $pdo->commit();
    } catch (InvalidArgumentException $e) {
        $pdo->rollBack();
        fail($e->getMessage(), 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    json_out(['ok' => true, 'saved' => count($items)]);
}

if ($action === 'finish') {
    $warnings = $file['warnings'] ?? [];
    $pdo->beginTransaction();
    try {
        $del = $pdo->prepare('DELETE FROM order_items WHERE src_file = ? AND import_id <> ?');
        $del->execute([$name, $importId]);
        $removed = $del->rowCount();
        $pdo->prepare('REPLACE INTO import_files (name, platform, imported_at, src_rows, warnings) VALUES (?,?,?,?,?)')
            ->execute([
                $name, $platform, (int) ($file['importedAt'] ?? round(microtime(true) * 1000)),
                (int) ($file['rows'] ?? 0), json_encode(is_array($warnings) ? $warnings : [], JSON_UNESCAPED_UNICODE),
            ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    json_out(['ok' => true, 'removedOld' => $removed]);
}

fail('Aksi tidak dikenal.');
