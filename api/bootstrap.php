<?php
declare(strict_types=1);

/** Fungsi bersama untuk semua endpoint API. Semua respons berupa JSON. */

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('memory_limit', '512M');
set_time_limit(300);

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status = 400, string $hint = ''): void
{
    json_out(['ok' => false, 'error' => $message, 'hint' => $hint], $status);
}

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof PDOException) {
        $code = (int) ($e->errorInfo[1] ?? $e->getCode());
        $hint = 'Pastikan MySQL sudah dijalankan (tombol Start di XAMPP Control Panel) dan pengaturan di api/config.php benar.';
        if ($code === 1045) {
            $hint = 'User atau password MySQL salah. Sesuaikan "user" dan "pass" di api/config.php.';
        } elseif ($code === 2002 || $code === 2006) {
            $hint = 'MySQL belum berjalan. Buka XAMPP Control Panel lalu klik Start pada baris MySQL.';
        }
        error_log('[dashboard-penjualan] ' . $e->getMessage());
        fail('Tidak bisa terhubung ke database: ' . $e->getMessage(), 500, $hint);
    }
    error_log('[dashboard-penjualan] ' . $e->getMessage());
    fail($e->getMessage(), 500);
});

/** Tolak permintaan lintas-situs: aplikasi ini hanya untuk dipakai dari alamat yang sama. */
function guard_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    $oh = parse_url($origin, PHP_URL_HOST);
    $oport = parse_url($origin, PHP_URL_PORT);
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $originHost = $oh . ($oport ? ':' . $oport : '');
    if (strcasecmp($originHost, $host) !== 0) {
        fail('Permintaan dari alamat lain ditolak.', 403);
    }
}

function read_json_body(): array
{
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') === false) {
        fail('Content-Type harus application/json.', 415);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        fail('Isi permintaan kosong.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('JSON tidak valid.');
    }
    return $data;
}

guard_origin();
require_once __DIR__ . '/db.php';
