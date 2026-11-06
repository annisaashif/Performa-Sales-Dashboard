export type Platform = 'TikTok' | 'Shopee' | 'Website';
export const PLATFORMS: Platform[] = ['TikTok', 'Shopee', 'Website'];

/** Status pesanan yang sudah distandarkan lintas platform. */
export type Tier = 'completed' | 'delivered' | 'shipping' | 'toShip' | 'cancelled' | 'unpaid' | 'unknown';

export const TIER_ORDER: Tier[] = ['completed', 'delivered', 'shipping', 'toShip', 'cancelled', 'unpaid', 'unknown'];

export const TIER_LABEL: Record<Tier, string> = {
  completed: 'Selesai (Completed)',
  delivered: 'Diterima / terkirim',
  shipping: 'Dalam pengiriman',
  toShip: 'Perlu dikirim / dikemas',
  cancelled: 'Batal',
  unpaid: 'Belum dibayar',
  unknown: 'Status tidak dikenal',
};

/**
 * Satu baris = satu SKU dalam satu pesanan (fact_order_items).
 * Kolom tingkat pesanan (ongkir, total bayar) sengaja tidak dibawa agar tidak terhitung ganda.
 */
export interface Item {
  k: string; // kunci unik: platform|order|sku|variasi
  p: Platform;
  o: string; // order id
  d: string; // tanggal pesanan dibuat, yyyy-mm-dd
  h: number; // jam pesanan dibuat
  m: string; // yyyy-mm
  st: string; // status mentah
  t: Tier;
  sku: string;
  name: string;
  v: string; // variasi
  cat: string; // kategori produk (hanya TikTok)
  q: number; // jumlah
  rq: number; // jumlah diretur
  unit: number; // harga awal per unit
  gross: number; // penjualan kotor = unit x q
  sd: number; // diskon seller (total baris)
  pd: number; // diskon platform (total baris, informasi saja)
  ha: number; // Harga Akhir = (unit - sd/q) x q
  rf: number; // refund = rq x (unit - sd/q)
  cr: string; // creator handle (TikTok)
  ch: string; // order channel (TikTok: LIVE / Videos / Product cards)
  flag: string; // penanda kualitas data, '' bila tidak ada
  src: string; // nama file asal
}

export interface FileMeta {
  name: string;
  platform: Platform;
  importedAt: number;
  rows: number;
  items: number;
  orders: number;
  months: string[];
  warnings: string[];
}

export interface FileRecord {
  meta: FileMeta;
  items: Item[];
}

export interface Filter {
  from: string; // yyyy-mm
  to: string; // yyyy-mm
  platforms: Platform[];
}
