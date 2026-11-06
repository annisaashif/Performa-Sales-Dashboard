-- Skema setara untuk pengujian otomatis dengan SQLite (tidak dipakai saat berjalan di XAMPP).
CREATE TABLE IF NOT EXISTS import_files (
  name TEXT NOT NULL PRIMARY KEY, platform TEXT NOT NULL, imported_at INTEGER NOT NULL,
  src_rows INTEGER NOT NULL DEFAULT 0, warnings TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  item_key TEXT NOT NULL PRIMARY KEY, platform TEXT NOT NULL, order_id TEXT NOT NULL, order_date TEXT NOT NULL,
  order_hour INTEGER NOT NULL DEFAULT 0, order_month TEXT NOT NULL, status_raw TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', product_name TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL DEFAULT 0,
  return_qty INTEGER NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0, gross_sales REAL NOT NULL DEFAULT 0,
  seller_discount REAL NOT NULL DEFAULT 0, platform_discount REAL NOT NULL DEFAULT 0, net_sales REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0, creator_handle TEXT NOT NULL DEFAULT '', order_channel TEXT NOT NULL DEFAULT '',
  flag TEXT NOT NULL DEFAULT '', src_file TEXT NOT NULL, import_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_month_platform ON order_items (order_month, platform);
CREATE INDEX IF NOT EXISTS idx_src ON order_items (src_file);
