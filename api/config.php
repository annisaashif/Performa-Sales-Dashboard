<?php
/**
 * Pengaturan koneksi database.
 * Nilai bawaan cocok untuk XAMPP: MySQL di port 3306, user root, tanpa password.
 * Ubah di sini bila MySQL kamu memakai password atau port lain.
 */
return [
    'driver'  => 'mysql',               // 'sqlite' hanya dipakai untuk pengujian otomatis
    'host'    => '127.0.0.1',
    'port'    => 3306,
    'name'    => 'dashboard_penjualan', // dibuat otomatis bila belum ada
    'user'    => 'root',
    'pass'    => '',
    'sqlite'  => '',                    // path file untuk driver sqlite (pengujian)
];
