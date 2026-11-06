-- Skema database Dashboard Kinerja Penjualan
-- MySQL 8 / MariaDB 10.4+ (XAMPP). Aman dijalankan berulang kali (IF NOT EXISTS).
--
-- Cara pakai manual di phpMyAdmin: tab "Import" -> pilih file ini -> Go.
-- (Aplikasi juga membuat database dan tabel ini sendiri saat pertama kali dibuka.)

CREATE DATABASE IF NOT EXISTS dashboard_penjualan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dashboard_penjualan;

-- Satu baris per file export yang pernah diimpor (riwayat impor / data lineage).
CREATE TABLE IF NOT EXISTS import_files (
  name        VARCHAR(255) NOT NULL COMMENT 'Nama file asal',
  platform    VARCHAR(20)  NOT NULL COMMENT 'TikTok / Shopee / Website',
  imported_at BIGINT       NOT NULL COMMENT 'Waktu impor, milidetik sejak 1970',
  src_rows    INT          NOT NULL DEFAULT 0 COMMENT 'Jumlah baris data di file',
  warnings    TEXT         NULL     COMMENT 'Peringatan kualitas data (JSON)',
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- fact_order_items: satu baris = satu SKU dalam satu pesanan.
-- Kolom tingkat pesanan (ongkir, total bayar) sengaja tidak disimpan agar tidak terhitung ganda.
CREATE TABLE IF NOT EXISTS order_items (
  item_key          VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'platform|order|sku|variasi, unik',
  platform          VARCHAR(20)   NOT NULL,
  order_id          VARCHAR(100)  NOT NULL,
  order_date        DATE          NOT NULL COMMENT 'Tanggal pesanan dibuat',
  order_hour        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  order_month       CHAR(7)       NOT NULL COMMENT 'yyyy-mm',
  status_raw        VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'Status asli dari marketplace',
  tier              VARCHAR(20)   NOT NULL COMMENT 'completed, delivered, shipping, toShip, cancelled, unpaid, unknown',
  sku               VARCHAR(150)  NOT NULL DEFAULT '',
  product_name      VARCHAR(500)  NOT NULL DEFAULT '',
  variant           VARCHAR(255)  NOT NULL DEFAULT '',
  category          VARCHAR(255)  NOT NULL DEFAULT '',
  qty               INT           NOT NULL DEFAULT 0,
  return_qty        INT           NOT NULL DEFAULT 0,
  unit_price        DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Harga awal per unit',
  gross_sales       DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Harga awal x jumlah',
  seller_discount   DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Diskon penjual (total baris)',
  platform_discount DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Diskon platform, informasi saja',
  net_sales         DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Harga Akhir = (harga awal - diskon penjual per unit) x jumlah',
  refund_amount     DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Jumlah retur x harga barang per unit',
  creator_handle    VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'TikTok: akun kreator/affiliate',
  order_channel     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT 'TikTok: LIVE / Videos / Product cards',
  flag              VARCHAR(50)   NOT NULL DEFAULT '' COMMENT 'Penanda kualitas data',
  src_file          VARCHAR(255)  NOT NULL COMMENT 'File asal (lihat import_files.name)',
  import_id         BIGINT        NOT NULL DEFAULT 0 COMMENT 'Penanda sesi impor',
  PRIMARY KEY (item_key),
  KEY idx_month_platform (order_month, platform),
  KEY idx_order (platform, order_id),
  KEY idx_src (src_file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
