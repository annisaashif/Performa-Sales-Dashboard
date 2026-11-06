# Panduan memasang di komputer sendiri (PHP + MySQL)

Dashboard penjualan TikTok Shop, Shopee, dan Website. File export dibaca di browser, lalu data
yang sudah dirapikan disimpan di database MySQL, sehingga bisa dilihat dan di-query lewat phpMyAdmin.

## 1. Pasang di komputer (XAMPP atau Laragon)

1. Buka **XAMPP Control Panel**, klik **Start** pada **Apache** dan **MySQL**.
2. Salin folder `dashboard-penjualan` ini ke `C:\xampp\htdocs\`
   sehingga jalurnya `C:\xampp\htdocs\dashboard-penjualan\index.php`.
   **Laragon:** salin ke `C:\laragon\www\` lalu buka `http://localhost/dashboard-penjualan/`. Pastikan foldernya langsung berisi `index.php`, bukan folder di dalam folder.
3. Buka folder itu di VS Code: **File > Open Folder...** lalu pilih `C:\xampp\htdocs\dashboard-penjualan`.
4. Buka browser: **http://localhost/dashboard-penjualan/**
   (jangan klik dua kali file `index.php`; harus lewat alamat `http://localhost/...`).
5. Database `dashboard_penjualan` dan tabelnya **dibuat otomatis** saat halaman pertama dibuka.
6. Buka menu **Data**, pilih file export (.xlsx TikTok/Shopee, .csv Website), tunggu sampai selesai.

Cek hasilnya di phpMyAdmin (`http://localhost/phpmyadmin`): database `dashboard_penjualan`, tabel `order_items`
dan `import_files`.

Bila lebih suka membuat tabel manual: phpMyAdmin > tab **Import** > pilih `database/schema.sql` > **Go**.

## 2. Bila MySQL punya password atau port lain

Ubah `api/config.php` (`user`, `pass`, `port`, `name`). Bawaan XAMPP: user `root`, tanpa password, port 3306.

## 3. Struktur folder

```
dashboard-penjualan/
  index.php            halaman utama (memuat assets/app.js dan app.css)
  api/                 backend PHP (hanya bisa dibuka dari komputer ini)
    config.php         pengaturan koneksi database
    status.php         membuat database/tabel bila belum ada
    import.php         menyimpan baris pesanan (bertahap, tidak menggandakan)
    items.php          mengirim baris pesanan ke dashboard (JSON)
    files.php          daftar file diimpor, hapus file, hapus semua
  database/schema.sql  skema tabel (bisa diimpor lewat phpMyAdmin)
  assets/              hasil build (JavaScript dan CSS), sudah jadi
  src/                 kode sumber React + TypeScript (rumus KPI ada di src/lib/kpi.ts)
  scripts/build.mjs    perintah build
  tests/               skema pengujian otomatis (boleh diabaikan)
```

## 4. Tabel di database

- `order_items`: satu baris = satu SKU dalam satu pesanan. Kunci unik `item_key` = `platform|nomor pesanan|SKU|variasi`.
  Kolom penting: `order_date` (tanggal pesanan dibuat), `tier` (status standar), `net_sales` (Harga Akhir),
  `refund_amount`, `seller_discount`, `platform_discount`, `creator_handle`, `src_file`.
- `import_files`: riwayat file yang pernah diimpor.

Contoh query di phpMyAdmin (Net Sales Completed sebelum refund per platform per bulan):

```sql
SELECT platform, order_month, COUNT(DISTINCT order_id) AS pesanan,
       SUM(net_sales) AS net_sebelum_refund, SUM(net_sales - refund_amount) AS net_setelah_refund
FROM order_items
WHERE tier = 'completed'
GROUP BY platform, order_month
ORDER BY order_month, platform;
```

## 5. Aturan data

- **Completed** hanya status Selesai. **Net Sales** = Harga Akhir = Harga Barang x jumlah, dengan
  Harga Barang = harga awal - diskon penjual. Diskon platform tidak dikurangkan.
- Net Sales ditampilkan sebelum dan setelah refund. Tanggal memakai tanggal pesanan dibuat.
- Mengimpor ulang pesanan yang sama **menimpa** barisnya (status terbaru), bukan menggandakan.
  Bila dua file memuat pesanan yang sama, isi dari file yang paling baru diimpor yang dipakai.
- Menghapus sebuah file menghapus baris yang saat ini dimiliki file itu.
- Refund Shopee adalah estimasi (jumlah retur x Harga Barang) karena export Shopee tidak memuat nominal refund.

## 6. Mengubah tampilan atau rumus (opsional)

Hasil build sudah disertakan, jadi Node.js **tidak wajib**. Bila ingin mengubah kode di `src/`:

```
npm install
npm run build
```
lalu muat ulang browser (Ctrl+F5).

## 7. Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| "MySQL belum berjalan" | Start MySQL di XAMPP Control Panel |
| "User atau password MySQL salah" | Sesuaikan `user` dan `pass` di `api/config.php` |
| "Server tidak bisa dihubungi" / halaman kosong | Buka lewat `http://localhost/dashboard-penjualan/`, pastikan Apache Start |
| Impor gagal pada file besar | Di `C:\xampp\php\php.ini` naikkan `post_max_size` ke 64M, lalu restart Apache |
| Port 80 dipakai aplikasi lain | Pakai alamat dengan port Apache kamu, misalnya `http://localhost:8080/dashboard-penjualan/` |

## 8. Mencoba tanpa server

Tanpa PHP dan MySQL, buka versi demo dengan data fiktif: folder `docs/` (lihat README utama). Cukup buka `docs/index.html`
lewat server statis apa pun, misalnya `npx serve docs`, atau lewat GitHub Pages.
