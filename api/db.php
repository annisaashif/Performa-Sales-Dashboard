<?php
declare(strict_types=1);

function db_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/config.php';
        // Variabel lingkungan dipakai hanya untuk pengujian otomatis.
        if (getenv('DKP_DRIVER')) {
            $cfg['driver'] = getenv('DKP_DRIVER');
            $cfg['sqlite'] = getenv('DKP_SQLITE') ?: '';
        }
    }
    return $cfg;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = db_config();
    if ($c['driver'] === 'sqlite') {
        $pdo = new PDO('sqlite:' . $c['sqlite'], null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA journal_mode=WAL');
        return $pdo;
    }
    if (!preg_match('/^[A-Za-z0-9_]+$/', (string) $c['name'])) {
        throw new RuntimeException('Nama database di api/config.php hanya boleh huruf, angka, dan garis bawah.');
    }
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['host'], (int) $c['port']);
    $pdo = new PDO($dsn, $c['user'], $c['pass'], $opts);
    $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . $c['name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE `' . $c['name'] . '`');
    $pdo->exec("SET NAMES utf8mb4");
    return $pdo;
}

/** Membuat tabel dari database/schema.sql bila belum ada (hanya MySQL). */
function ensure_schema(PDO $pdo): void
{
    $c = db_config();
    if ($c['driver'] === 'sqlite') {
        $sql = file_get_contents(__DIR__ . '/../tests/schema.sqlite.sql');
    } else {
        $sql = file_get_contents(__DIR__ . '/../database/schema.sql');
    }
    if ($sql === false) {
        throw new RuntimeException('File skema database tidak ditemukan.');
    }
    $lines = [];
    foreach (preg_split('/\R/', $sql) as $line) {
        if (preg_match('/^\s*--/', $line)) {
            continue;
        }
        $lines[] = $line;
    }
    foreach (explode(';', implode("\n", $lines)) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '' || preg_match('/^(CREATE DATABASE|USE)\b/i', $stmt)) {
            continue;
        }
        $pdo->exec($stmt);
    }
}
