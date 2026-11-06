import { z } from 'zod';
import type { Item, Platform, Tier } from './types';
import { PLATFORMS } from './types';

/* ------------------------------------------------------------------ */
/* Pembantu                                                            */
/* ------------------------------------------------------------------ */

const hn = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function num(s: string | undefined): number {
  if (s === undefined) return 0;
  const t = s.trim();
  if (t === '') return 0;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+,\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
  const f = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(f) ? f : 0;
}

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

export function parseDate(s: string | undefined): { d: string; h: number } | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return { d: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, h: m[4] ? +m[4] : 0 };
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return { d: `${m[1]}-${m[2]}-${m[3]}`, h: m[4] ? +m[4] : 0 };
  if (/^\d+(\.\d+)?$/.test(t)) {
    const v = parseFloat(t);
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400000);
      const dt = new Date(ms);
      return {
        d: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
        h: dt.getUTCHours(),
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Skema kolom per platform                                            */
/* ------------------------------------------------------------------ */

const REQUIRED: Record<Platform, string[]> = {
  TikTok: [
    'Order ID',
    'Order Status',
    'Order Substatus',
    'Seller SKU',
    'Product Name',
    'Quantity',
    'SKU Unit Original Price',
    'SKU Seller Discount',
    'SKU Platform Discount',
    'Created Time',
  ],
  Shopee: [
    'No. Pesanan',
    'Status Pesanan',
    'Nomor Referensi SKU',
    'Nama Produk',
    'Harga Awal',
    'Jumlah',
    'Diskon Dari Penjual',
    'Diskon Dari Shopee',
    'Waktu Pesanan Dibuat',
  ],
  Website: [
    'Status Order',
    'Nomor Order',
    'Tanggal Order',
    'Nama Produk',
    'Kode Varian',
    'Harga Produk',
    'Jumlah',
    'Nilai Diskon Produk',
  ],
};

const OPTIONAL: Record<Platform, string[]> = {
  TikTok: ['Cancelation/Return Type', 'Sku Quantity of return', 'Creator Handle', 'Order Channel', 'Product Category', 'Variation'],
  Shopee: ['Returned quantity', 'Nama Variasi', 'Harga Setelah Diskon', 'Subtotal Pesanan'],
  Website: ['Variasi'],
};

export function detectPlatform(headers: string[]): Platform | null {
  const set = new Set(headers.map(hn));
  let best: Platform | null = null;
  let bestScore = 0;
  for (const p of PLATFORMS) {
    const req = REQUIRED[p];
    const score = req.filter((h) => set.has(hn(h))).length / req.length;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.8 ? best : null;
}

/** Cari baris header (10 baris pertama) dan platformnya. */
export function findHeader(rows: string[][]): { index: number; platform: Platform } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const p = detectPlatform(rows[i]);
    if (p) return { index: i, platform: p };
  }
  return null;
}

/* Zod: validasi sampel hasil normalisasi agar salah petakan kolom terdeteksi cepat. */
const ItemSchema = z.object({
  k: z.string().min(3),
  o: z.string().min(1),
  m: z.string().regex(/^\d{4}-\d{2}$/),
  q: z.number().int().positive(),
  rq: z.number().int().nonnegative(),
  unit: z.number().nonnegative().finite(),
  gross: z.number().nonnegative().finite(),
  sd: z.number().nonnegative().finite(),
  ha: z.number().finite(),
  rf: z.number().finite(),
});

/* ------------------------------------------------------------------ */
/* Normalisasi                                                         */
/* ------------------------------------------------------------------ */

export interface NormalizeResult {
  platform: Platform;
  items: Item[];
  rows: number;
  warnings: string[];
}

class Cols {
  private map = new Map<string, number>();
  constructor(header: string[]) {
    header.forEach((h, i) => {
      const k = hn(h);
      if (!this.map.has(k)) this.map.set(k, i);
    });
  }
  has(name: string) {
    return this.map.has(hn(name));
  }
  get(row: string[], name: string): string {
    const i = this.map.get(hn(name));
    return i === undefined ? '' : (row[i] ?? '').toString();
  }
}

function base(p: Platform, src: string) {
  return { p, src };
}

function build(
  p: Platform,
  src: string,
  o: string,
  date: { d: string; h: number },
  st: string,
  t: Tier,
  sku: string,
  name: string,
  v: string,
  cat: string,
  q: number,
  rq: number,
  unit: number,
  sd: number,
  pd: number,
  cr: string,
  ch: string,
  flag: string,
): Item {
  const gross = unit * q;
  // Rumus Harga Akhir: Harga Barang = harga awal - diskon seller per unit; Harga Akhir = Harga Barang x jumlah.
  const hargaBarang = q > 0 ? unit - sd / q : unit;
  return {
    k: `${p}|${o}|${sku}|${v}`,
    ...base(p, src),
    o,
    d: date.d,
    h: date.h,
    m: date.d.slice(0, 7),
    st,
    t,
    sku,
    name,
    v,
    cat,
    q,
    rq,
    unit,
    gross,
    sd,
    pd,
    ha: hargaBarang * q,
    rf: hargaBarang * rq,
    cr,
    ch,
    flag,
  };
}

function tiktok(rows: string[][], header: string[], src: string, warnings: string[]): Item[] {
  const c = new Cols(header);
  const out: Item[] = [];
  let noDate = 0;
  for (const r of rows) {
    const o = c.get(r, 'Order ID').trim();
    if (!o) continue;
    const date = parseDate(c.get(r, 'Created Time'));
    if (!date) {
      noDate++;
      continue;
    }
    const st = c.get(r, 'Order Status').trim();
    const sub = c.get(r, 'Order Substatus').trim();
    const ctype = hn(c.get(r, 'Cancelation/Return Type'));
    const s = hn(st);
    let t: Tier;
    let flag = '';
    if (s === 'selesai') {
      if (ctype === 'cancel') {
        t = 'cancelled';
        flag = 'selesai_cancel';
      } else t = 'completed';
    } else if (s === 'dikirim') t = hn(sub) === 'terkirim' ? 'delivered' : 'shipping';
    else if (s === 'perlu dikirim') t = 'toShip';
    else if (s === 'dibatalkan') t = 'cancelled';
    else if (s === 'belum dibayar') t = 'unpaid';
    else t = 'unknown';

    const q = Math.round(num(c.get(r, 'Quantity')));
    if (q <= 0) continue;
    const creator = c.get(r, 'Creator Handle').trim();
    out.push(
      build(
        'TikTok',
        src,
        o,
        date,
        sub ? `${st} / ${sub}` : st,
        t,
        c.get(r, 'Seller SKU').trim(),
        c.get(r, 'Product Name').trim(),
        c.get(r, 'Variation').trim(),
        c.get(r, 'Product Category').trim(),
        q,
        Math.round(num(c.get(r, 'Sku Quantity of return'))),
        num(c.get(r, 'SKU Unit Original Price')),
        num(c.get(r, 'SKU Seller Discount')),
        num(c.get(r, 'SKU Platform Discount')),
        creator,
        c.get(r, 'Order Channel').trim(),
        flag,
      ),
    );
  }
  if (noDate) warnings.push(`${noDate} baris dilewati karena tanggal pesanan tidak terbaca.`);
  return out;
}

/**
 * Subtotal Pesanan pada file Shopee yang rusak tersimpan dalam ribuan (211.090 dibaca 211,09; 1.556.000 tetap teks).
 */
function parseBrokenSubtotal(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  if ((t.match(/\./g) ?? []).length >= 2) return parseFloat(t.replace(/\./g, '')) || 0;
  const v = parseFloat(t.replace(',', '.'));
  return Number.isFinite(v) ? v * 1000 : 0;
}

const SCALES = [1, 10, 100];

/**
 * Memperbaiki satu baris Shopee yang skala angkanya rusak. Aturan: Harga Awal x 100. Skala kolom diskon bervariasi per baris
 * (x1, x10, x100), jadi dipilih skala yang membuat harga awal x jumlah - diskon penjual - diskon Shopee = Subtotal Pesanan.
 * Bila tidak ada skala yang cocok, atau lebih dari satu nilai diskon penjual cocok, baris tidak dipakai (null).
 */
function repairShopeeRow(aw: number, q: number, sd: number, pd: number, subRaw: string): { unit: number; sd: number; pd: number } | null {
  const unit = aw * 100;
  const sub = parseBrokenSubtotal(subRaw);
  const hits = new Map<number, number>(); // nilai diskon penjual -> nilai diskon Shopee
  for (const s1 of SCALES) {
    for (const s2 of SCALES) {
      if (Math.abs(unit * q - sd * s1 - pd * s2 - sub) <= 1.5 && !hits.has(sd * s1)) hits.set(sd * s1, pd * s2);
    }
  }
  if (hits.size !== 1) return null;
  const [[sdTrue, pdTrue]] = [...hits.entries()];
  return { unit, sd: sdTrue, pd: pdTrue };
}

function shopee(rows: string[][], header: string[], src: string, warnings: string[]): Item[] {
  const c = new Cols(header);
  const out: Item[] = [];
  let noDate = 0;
  // Pemeriksaan konsistensi harga. Pada export asli Shopee: Harga Setelah Diskon x Jumlah = Subtotal Pesanan.
  const canCheck = c.has('Harga Setelah Diskon') && c.has('Subtotal Pesanan');
  let checked = 0;
  let mismatch = 0;
  if (canCheck) {
    for (const r of rows) {
      const q0 = Math.round(num(c.get(r, 'Jumlah')));
      if (q0 <= 0 || !c.get(r, 'No. Pesanan').trim()) continue;
      checked++;
      const a = num(c.get(r, 'Harga Setelah Diskon')) * q0;
      const b = num(c.get(r, 'Subtotal Pesanan'));
      if (Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.001)) mismatch++;
    }
  }
  const scaled = checked >= 20 && mismatch / checked > 0.05;
  let repaired = 0;
  let skipped = 0;
  for (const r of rows) {
    const o = c.get(r, 'No. Pesanan').trim();
    if (!o) continue;
    const date = parseDate(c.get(r, 'Waktu Pesanan Dibuat'));
    if (!date) {
      noDate++;
      continue;
    }
    const st = c.get(r, 'Status Pesanan').trim();
    const s = hn(st);
    let t: Tier;
    if (s === 'selesai') t = 'completed';
    else if (s === 'pesanan diterima' || s.startsWith('pesanan diterima, namun')) t = 'delivered';
    else if (s === 'telah dikirim' || s === 'sedang dikirim') t = 'shipping';
    else if (s === 'perlu dikirim') t = 'toShip';
    else if (s === 'batal' || s === 'pembatalan diajukan') t = 'cancelled';
    else if (s === 'belum bayar') t = 'unpaid';
    else t = 'unknown';
    const q = Math.round(num(c.get(r, 'Jumlah')));
    if (q <= 0) continue;
    let unit = num(c.get(r, 'Harga Awal'));
    let sd = num(c.get(r, 'Diskon Dari Penjual'));
    let pd = num(c.get(r, 'Diskon Dari Shopee'));
    let flag = '';
    if (scaled) {
      const fix = repairShopeeRow(unit, q, sd, pd, c.get(r, 'Subtotal Pesanan'));
      if (!fix) {
        skipped++;
        continue;
      }
      ({ unit, sd, pd } = fix);
      flag = 'skala_diperbaiki';
      repaired++;
    }
    out.push(
      build(
        'Shopee',
        src,
        o,
        date,
        s.startsWith('pesanan diterima, namun') ? 'Pesanan diterima (masa retur)' : st,
        t,
        c.get(r, 'Nomor Referensi SKU').trim(),
        c.get(r, 'Nama Produk').trim(),
        c.get(r, 'Nama Variasi').trim(),
        '',
        q,
        Math.round(num(c.get(r, 'Returned quantity'))),
        unit,
        sd,
        pd,
        '',
        '',
        flag,
      ),
    );
  }
  if (noDate) warnings.push(`${noDate} baris dilewati karena tanggal pesanan tidak terbaca.`);
  if (scaled) {
    const total = repaired + skipped;
    if (total === 0 || repaired / total < 0.98) {
      throw new Error(
        `Angka harga di file ini rusak (skala berubah saat file diolah) dan tidak bisa diperbaiki dengan aman: hanya ${repaired.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} baris yang cocok dengan Subtotal Pesanan. Gunakan file asli hasil export Seller Centre.`,
      );
    }
    warnings.push(
      `Angka harga file ini rusak dan diperbaiki otomatis (Harga Awal × 100, diskon disesuaikan per baris, dicocokkan dengan Subtotal Pesanan): ${repaired.toLocaleString('id-ID')} baris diperbaiki` +
        (skipped ? `, ${skipped.toLocaleString('id-ID')} baris dilewati karena tidak bisa dicocokkan.` : '.') +
        ' Sebaiknya tetap gunakan file asli dari Seller Centre bila ada.',
    );
  }
  return out;
}

function website(rows: string[][], header: string[], src: string, warnings: string[]): Item[] {
  const c = new Cols(header);
  // Diskon produk di Website hanya terisi pada baris pertama tiap pesanan (tingkat pesanan).
  const orderGross = new Map<string, number>();
  const orderDisc = new Map<string, number>();
  for (const r of rows) {
    const o = c.get(r, 'Nomor Order').trim();
    if (!o) continue;
    orderGross.set(o, (orderGross.get(o) ?? 0) + num(c.get(r, 'Harga Produk')) * num(c.get(r, 'Jumlah')));
    orderDisc.set(o, (orderDisc.get(o) ?? 0) + num(c.get(r, 'Nilai Diskon Produk')));
  }
  const out: Item[] = [];
  let noDate = 0;
  for (const r of rows) {
    const o = c.get(r, 'Nomor Order').trim();
    if (!o) continue;
    const date = parseDate(c.get(r, 'Tanggal Order'));
    if (!date) {
      noDate++;
      continue;
    }
    const st = c.get(r, 'Status Order').trim();
    const s = hn(st);
    let t: Tier;
    if (s === 'selesai') t = 'completed';
    else if (s === 'terkirim') t = 'delivered';
    else if (s === 'dikirim') t = 'shipping';
    else if (s === 'lunas' || s === 'dikemas') t = 'toShip';
    else if (s === 'batal' || s === 'dibatalkan') t = 'cancelled';
    else if (s === 'belum dibayar') t = 'unpaid';
    else t = 'unknown';
    const q = Math.round(num(c.get(r, 'Jumlah')));
    if (q <= 0) continue;
    const unit = num(c.get(r, 'Harga Produk'));
    const og = orderGross.get(o) ?? 0;
    const sd = og > 0 ? ((orderDisc.get(o) ?? 0) * (unit * q)) / og : 0;
    out.push(
      build(
        'Website',
        src,
        o,
        date,
        st,
        t,
        c.get(r, 'Kode Varian').trim(),
        c.get(r, 'Nama Produk').trim(),
        c.get(r, 'Variasi').trim(),
        '',
        q,
        0,
        unit,
        sd,
        0,
        '',
        '',
        '',
      ),
    );
  }
  if (noDate) warnings.push(`${noDate} baris dilewati karena tanggal pesanan tidak terbaca.`);
  return out;
}

export function normalize(allRows: string[][], src: string): NormalizeResult {
  const found = findHeader(allRows);
  if (!found) {
    throw new Error(
      'Struktur kolom tidak dikenali. Pastikan file adalah export pesanan TikTok Shop, Shopee, atau Website.',
    );
  }
  const header = allRows[found.index];
  const rows = allRows.slice(found.index + 1);
  const warnings: string[] = [];
  const c = new Cols(header);
  for (const opt of OPTIONAL[found.platform]) {
    if (!c.has(opt)) warnings.push(`Kolom "${opt}" tidak ada; analisis yang memakainya dilewati.`);
  }

  let items: Item[];
  if (found.platform === 'TikTok') items = tiktok(rows, header, src, warnings);
  else if (found.platform === 'Shopee') items = shopee(rows, header, src, warnings);
  else items = website(rows, header, src, warnings);

  // Validasi sampel + pemeriksaan NaN di seluruh baris.
  let bad = 0;
  for (const it of items) {
    if (!Number.isFinite(it.ha) || !Number.isFinite(it.rf) || !Number.isFinite(it.gross)) bad++;
  }
  if (bad) throw new Error(`${bad} baris menghasilkan angka tidak valid. Periksa format angka di file.`);
  const sample = items.slice(0, 500);
  const res = z.array(ItemSchema).safeParse(sample);
  if (!res.success) {
    const first = res.error.issues[0];
    throw new Error(`Validasi data gagal pada kolom ${first.path.join('.')}: ${first.message}`);
  }
  if (!items.length) throw new Error('Tidak ada baris pesanan yang bisa dibaca dari file ini.');
  // Pengaman umum: diskon seller yang melebihi harga pada banyak baris menandakan skala angka rusak.
  const negative = items.filter((i) => i.ha < -0.5).length;
  if (negative / items.length > 0.01) {
    throw new Error(
      `${negative.toLocaleString('id-ID')} dari ${items.length.toLocaleString('id-ID')} baris punya diskon penjual lebih besar dari harga barang, sehingga Net Sales negatif. File tidak diimpor karena angka harga kemungkinan rusak. Gunakan file asli dari ${found.platform}.`,
    );
  }
  return { platform: found.platform, items, rows: rows.length, warnings };
}
