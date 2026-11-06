import type { Filter, Item, Platform, Tier } from './types';
import { PLATFORMS, TIER_ORDER } from './types';

/** Agregat penjualan. Net Sales sebelum refund = ha (Harga Akhir); setelah refund = ha - rf. */
export interface Agg {
  orders: number;
  qty: number;
  rq: number;
  gross: number;
  sd: number;
  pd: number;
  ha: number;
  rf: number;
}

export const netAfter = (a: Agg) => a.ha - a.rf;
export const aov = (a: Agg) => (a.orders ? netAfter(a) / a.orders : 0);
export const emptyAgg = (): Agg => ({ orders: 0, qty: 0, rq: 0, gross: 0, sd: 0, pd: 0, ha: 0, rf: 0 });

class Acc {
  orders = new Set<string>();
  a = emptyAgg();
  add(it: Item) {
    this.orders.add(it.o);
    const a = this.a;
    a.qty += it.q;
    a.rq += it.rq;
    a.gross += it.gross;
    a.sd += it.sd;
    a.pd += it.pd;
    a.ha += it.ha;
    a.rf += it.rf;
  }
  done(): Agg {
    this.a.orders = this.orders.size;
    return this.a;
  }
}

export function groupAgg<K>(items: Item[], key: (it: Item) => K | null): Map<K, Agg> {
  const m = new Map<K, Acc>();
  for (const it of items) {
    const k = key(it);
    if (k === null) continue;
    let acc = m.get(k);
    if (!acc) m.set(k, (acc = new Acc()));
    acc.add(it);
  }
  const out = new Map<K, Agg>();
  for (const [k, acc] of m) out.set(k, acc.done());
  return out;
}

export function totalAgg(items: Item[]): Agg {
  const acc = new Acc();
  for (const it of items) acc.add(it);
  return acc.done();
}

/* ------------------------------ filter ------------------------------ */

export function applyFilter(items: Item[], f: Filter): Item[] {
  const set = new Set<Platform>(f.platforms);
  return items.filter((i) => i.m >= f.from && i.m <= f.to && set.has(i.p));
}

/** Definisi Completed: hanya status Selesai. */
export const isCompleted = (i: Item) => i.t === 'completed';
/** Pesanan aktif: semua yang tidak batal dan tidak menunggu pembayaran. */
export const isActive = (i: Item) => i.t !== 'cancelled' && i.t !== 'unpaid' && i.t !== 'unknown';

export const completed = (items: Item[]) => items.filter(isCompleted);

/* --------------------------- ringkasan status --------------------------- */

export interface TierRow {
  tier: Tier;
  orders: number;
  ha: number;
}

export function tierSummary(items: Item[]): Map<Platform, TierRow[]> {
  const out = new Map<Platform, TierRow[]>();
  for (const p of PLATFORMS) {
    const sub = items.filter((i) => i.p === p);
    if (!sub.length) continue;
    const g = groupAgg(sub, (i) => i.t);
    out.set(
      p,
      TIER_ORDER.filter((t) => g.has(t)).map((t) => ({ tier: t, orders: g.get(t)!.orders, ha: g.get(t)!.ha })),
    );
  }
  return out;
}

/* ------------------------------ periode ------------------------------ */

export function monthsOf(items: Item[]): string[] {
  return [...new Set(items.map((i) => i.m))].sort();
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${m < 10 ? '0' + m : m}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function weekStart(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  const wd = (dt.getUTCDay() + 6) % 7; // Senin = 0
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

export function weekday(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; // Senin = 0
}

export function lastDate(items: Item[]): string {
  let mx = '';
  for (const i of items) if (i.d > mx) mx = i.d;
  return mx;
}

/* ------------------------------- produk ------------------------------- */

export interface ProductRow extends Agg {
  key: string;
  name: string;
  platforms: Platform[];
  net: number;
  skus: number;
}

// Versi "(READY STOCK)" dan pre-order dari desain yang sama digabung pada tingkat Model.
export const normName = (s: string) => s.toUpperCase().replace(/\(\s*READY STOCK\s*\)/g, ' ').replace(/\s+/g, ' ').trim();

export function productTable(items: Item[], level: 'model' | 'sku'): ProductRow[] {
  const keyOf = (i: Item) => (level === 'sku' ? i.sku.toUpperCase().trim() : normName(i.name));
  const groups = new Map<string, { acc: Acc; names: Map<string, number>; plats: Set<Platform>; skus: Set<string> }>();
  for (const it of items) {
    const k = keyOf(it);
    if (!k) continue;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { acc: new Acc(), names: new Map(), plats: new Set(), skus: new Set() }));
    g.acc.add(it);
    g.plats.add(it.p);
    g.skus.add(it.sku);
    g.names.set(it.name, (g.names.get(it.name) ?? 0) + it.q);
  }
  const rows: ProductRow[] = [];
  for (const [key, g] of groups) {
    const a = g.acc.done();
    let name = key;
    let best = -1;
    for (const [n, c] of g.names) if (c > best) ((best = c), (name = n));
    rows.push({ ...a, key, name, platforms: PLATFORMS.filter((p) => g.plats.has(p)), net: netAfter(a), skus: g.skus.size });
  }
  rows.sort((x, y) => y.net - x.net);
  return rows;
}

/* ------------------------------ affiliate ------------------------------ */

export type CreatorClass = 'own' | 'affiliate' | 'none';

export function classifyCreator(handle: string, own: Set<string>): CreatorClass {
  const h = handle.trim().toLowerCase();
  if (!h) return 'none';
  return own.has(h) ? 'own' : 'affiliate';
}

/* ------------------------------ anomali ------------------------------ */

export interface Anomaly {
  date: string;
  value: number;
  expected: number;
  z: number;
}

/** Deteksi hari tak biasa memakai median dan MAD (robust terhadap lonjakan promo). */
export function dailyAnomalies(daily: { date: string; value: number }[], top = 6): Anomaly[] {
  if (daily.length < 14) return [];
  const vals = daily.map((d) => d.value).sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  const dev = vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev[Math.floor(dev.length / 2)] || 1;
  const out = daily.map((d) => ({ date: d.date, value: d.value, expected: med, z: (0.6745 * (d.value - med)) / mad }));
  return out
    .filter((x) => Math.abs(x.z) >= 3.5)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, top);
}
