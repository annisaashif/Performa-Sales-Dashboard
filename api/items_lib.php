<?php
declare(strict_types=1);

/** Pemetaan antara kunci ringkas di JavaScript dan kolom di tabel order_items. */

const ITEM_COLUMNS = [
    'k' => 'item_key', 'p' => 'platform', 'o' => 'order_id', 'd' => 'order_date', 'h' => 'order_hour',
    'm' => 'order_month', 'st' => 'status_raw', 't' => 'tier', 'sku' => 'sku', 'name' => 'product_name',
    'v' => 'variant', 'cat' => 'category', 'q' => 'qty', 'rq' => 'return_qty', 'unit' => 'unit_price',
    'gross' => 'gross_sales', 'sd' => 'seller_discount', 'pd' => 'platform_discount', 'ha' => 'net_sales',
    'rf' => 'refund_amount', 'cr' => 'creator_handle', 'ch' => 'order_channel', 'flag' => 'flag',
    'src' => 'src_file',
];

const PLATFORMS = ['TikTok', 'Shopee', 'Website'];
const TIERS = ['completed', 'delivered', 'shipping', 'toShip', 'cancelled', 'unpaid', 'unknown'];

function cut(mixed $v, int $max): string
{
    return mb_substr(trim((string) $v), 0, $max, 'UTF-8');
}

function money(mixed $v): float
{
    $f = is_numeric($v) ? (float) $v : 0.0;
    return is_finite($f) ? round($f, 6) : 0.0;
}

/**
 * Memeriksa satu baris dari browser dan mengubahnya menjadi nilai kolom (urutan = ITEM_COLUMNS).
 * Melempar InvalidArgumentException bila data tidak layak disimpan.
 */
function prepare_item(array $it, string $srcFile, int $importId): array
{
    $p = (string) ($it['p'] ?? '');
    if (!in_array($p, PLATFORMS, true)) {
        throw new InvalidArgumentException('Platform tidak dikenal: ' . $p);
    }
    $t = (string) ($it['t'] ?? '');
    if (!in_array($t, TIERS, true)) {
        throw new InvalidArgumentException('Status standar tidak dikenal: ' . $t);
    }
    $d = (string) ($it['d'] ?? '');
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $mm) || !checkdate((int) $mm[2], (int) $mm[3], (int) $mm[1])) {
        throw new InvalidArgumentException('Tanggal pesanan tidak valid: ' . $d);
    }
    $o = cut($it['o'] ?? '', 100);
    if ($o === '') {
        throw new InvalidArgumentException('Nomor pesanan kosong.');
    }
    $key = (string) ($it['k'] ?? '');
    if ($key === '') {
        throw new InvalidArgumentException('Kunci baris kosong.');
    }
    if (mb_strlen($key, 'UTF-8') > 255) {
        $key = mb_substr($key, 0, 200, 'UTF-8') . '#' . md5($key);
    }
    $h = (int) ($it['h'] ?? 0);
    return [
        $key, $p, $o, $d, max(0, min(23, $h)), substr($d, 0, 7),
        cut($it['st'] ?? '', 150), $t, cut($it['sku'] ?? '', 150), cut($it['name'] ?? '', 500),
        cut($it['v'] ?? '', 255), cut($it['cat'] ?? '', 255), (int) ($it['q'] ?? 0), (int) ($it['rq'] ?? 0),
        money($it['unit'] ?? 0), money($it['gross'] ?? 0), money($it['sd'] ?? 0), money($it['pd'] ?? 0),
        money($it['ha'] ?? 0), money($it['rf'] ?? 0),
        cut($it['cr'] ?? '', 150), cut($it['ch'] ?? '', 100), cut($it['flag'] ?? '', 50),
        $srcFile, $importId,
    ];
}

/** Mengubah satu baris hasil query menjadi bentuk Item yang dipakai dashboard. */
function row_to_item(array $r): array
{
    return [
        'k' => $r['item_key'], 'p' => $r['platform'], 'o' => $r['order_id'], 'd' => $r['order_date'],
        'h' => (int) $r['order_hour'], 'm' => $r['order_month'], 'st' => $r['status_raw'], 't' => $r['tier'],
        'sku' => $r['sku'], 'name' => $r['product_name'], 'v' => $r['variant'], 'cat' => $r['category'],
        'q' => (int) $r['qty'], 'rq' => (int) $r['return_qty'], 'unit' => (float) $r['unit_price'],
        'gross' => (float) $r['gross_sales'], 'sd' => (float) $r['seller_discount'],
        'pd' => (float) $r['platform_discount'], 'ha' => (float) $r['net_sales'], 'rf' => (float) $r['refund_amount'],
        'cr' => $r['creator_handle'], 'ch' => $r['order_channel'], 'flag' => $r['flag'], 'src' => $r['src_file'],
    ];
}
