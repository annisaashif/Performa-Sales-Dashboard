<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/items_lib.php';

/**
 * Mengirim seluruh baris pesanan sebagai JSON (dialirkan baris demi baris agar hemat memori).
 * Parameter opsional: from=yyyy-mm, to=yyyy-mm, platform=TikTok|Shopee|Website
 */
$pdo = db();
$where = [];
$args = [];
foreach (['from' => 'order_month >= ?', 'to' => 'order_month <= ?'] as $k => $cond) {
    $v = $_GET[$k] ?? '';
    if ($v !== '') {
        if (!preg_match('/^\d{4}-\d{2}$/', (string) $v)) {
            fail('Parameter ' . $k . ' harus berformat yyyy-mm.');
        }
        $where[] = $cond;
        $args[] = $v;
    }
}
if (($_GET['platform'] ?? '') !== '') {
    if (!in_array($_GET['platform'], PLATFORMS, true)) {
        fail('Platform tidak dikenal.');
    }
    $where[] = 'platform = ?';
    $args[] = $_GET['platform'];
}
if (db_config()['driver'] === 'mysql') {
    $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
}
$sql = 'SELECT ' . implode(',', ITEM_COLUMNS) . ' FROM order_items'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
    . ' ORDER BY order_date, item_key';
$stmt = $pdo->prepare($sql);
$stmt->execute($args);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo '{"ok":true,"items":[';
$first = true;
$n = 0;
while (($r = $stmt->fetch()) !== false) {
    echo ($first ? '' : ',') . json_encode(row_to_item($r), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    $first = false;
    if ((++$n % 2000) === 0) {
        flush();
    }
}
echo ']}';
