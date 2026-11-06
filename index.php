<?php
// Halaman utama dashboard. Seluruh tampilan dibangun oleh assets/app.js (React) dan memanggil API di folder api/.
$v = static fn (string $f): int => @filemtime(__DIR__ . '/assets/' . $f) ?: 0;
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Kinerja Penjualan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="assets/app.css?v=<?= $v('app.css') ?>">
</head>
<body>
  <div id="root"></div>
  <noscript>Dashboard ini membutuhkan JavaScript.</noscript>
  <script src="assets/app.js?v=<?= $v('app.js') ?>"></script>
</body>
</html>
