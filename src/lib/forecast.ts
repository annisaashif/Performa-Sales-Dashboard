import type { Item, Platform } from './types';
import { PLATFORMS } from './types';
import { isActive, monthRange, normName } from './kpi';

/**
 * Forecast unit per produk untuk bulan berikutnya.
 *
 * Prinsip: hanya memakai data yang diimpor (tanpa angka karangan), metode dipilih otomatis lewat backtest pada riwayat sendiri,
 * dan semua batasan ditampilkan. Dasar hitung adalah pesanan aktif (tidak batal, sudah dibayar), bukan hanya Selesai,
 * karena pesanan bulan-bulan terakhir belum sempat berstatus Selesai dan akan membuat prakiraan terlalu rendah.
 */

export type Method = 'naive' | 'avg3' | 'wma' | 'trend';

export const METHOD_LABEL: Record<Method, string> = {
  naive: 'Sama dengan bulan terakhir',
  avg3: 'Rata-rata 3 bulan terakhir',
  wma: 'Rata-rata berbobot 3 bulan (50/30/20)',
  trend: 'Rata-rata berbobot + tren teredam',
};
export const METHODS: Method[] = ['naive', 'avg3', 'wma', 'trend'];

export const nextMonth = (m: string): string => {
  let y = +m.slice(0, 4);
  let mm = +m.slice(5, 7) + 1;
  if (mm > 12) {
    mm = 1;
    y++;
  }
  return `${y}-${mm < 10 ? '0' + mm : mm}`;
};

const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Kemiringan Theil–Sen (median dari semua pasangan): tahan terhadap satu bulan yang melonjak. */
function theilSen(y: number[]): number {
  const sl: number[] = [];
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) sl.push((y[j] - y[i]) / (j - i));
  return median(sl);
}

/** hist = unit per bulan sejak produk pertama terjual sampai bulan terakhir. Mengembalikan prakiraan bulan berikutnya. */
export function predictNext(hist: number[], method: Method): number {
  const n = hist.length;
  if (n === 0) return 0;
  const l1 = hist[n - 1];
  const l2 = n >= 2 ? hist[n - 2] : l1;
  const l3 = n >= 3 ? hist[n - 3] : l2;
  const avg3 = n >= 3 ? (l1 + l2 + l3) / 3 : n === 2 ? (l1 + l2) / 2 : l1;
  const wma = n >= 3 ? 0.5 * l1 + 0.3 * l2 + 0.2 * l3 : n === 2 ? 0.6 * l1 + 0.4 * l2 : l1;
  if (method === 'naive') return l1;
  if (method === 'avg3') return avg3;
  if (method === 'wma' || n < 4) return wma;
  const v = wma + 0.5 * theilSen(hist.slice(-6));
  return Math.max(0, Math.min(v, 2 * Math.max(l1, l2, l3)));
}

/* ------------------------------ menyiapkan seri ------------------------------ */

export interface ProdSeries {
  key: string;
  name: string;
  platforms: Platform[];
  units: number[]; // per bulan pada `months`
  value: number[]; // Harga Akhir per bulan
  launch: number; // indeks bulan pertama terjual
}

export interface Prepared {
  months: string[];
  target: string;
  included: Platform[];
  excluded: { p: Platform; last: string; missing: string[] }[];
  gaps: { p: Platform; months: string[] }[]; // bulan tanpa data di tengah riwayat platform yang ikut diprakirakan
  partial: { month: string; notes: string[] } | null;
  series: ProdSeries[];
  lastComplete: number; // indeks bulan terakhir yang lengkap
}

export function prepare(items: Item[], level: 'model' | 'sku'): Prepared | null {
  if (!items.length) return null;
  const present = PLATFORMS.filter((p) => items.some((i) => i.p === p));
  const cover = new Map<Platform, Set<string>>();
  for (const p of present) cover.set(p, new Set(items.filter((i) => i.p === p).map((i) => i.m)));
  const globalLast = [...new Set(items.map((i) => i.m))].sort().pop()!;
  const included: Platform[] = [];
  const excluded: { p: Platform; last: string; missing: string[] }[] = [];
  for (const p of present) {
    const cv = cover.get(p)!;
    const last = [...cv].sort().pop()!;
    // platform ikut bila punya data pada bulan terakhir dan dua bulan sebelumnya (atau semua bulan bila riwayatnya lebih pendek)
    const need = [globalLast];
    let m = globalLast;
    for (let k = 0; k < 2; k++) {
      m = prevMonth(m);
      if ([...cv].some((x) => x <= m)) need.push(m);
    }
    if (last === globalLast && need.every((x) => cv.has(x))) included.push(p);
    else excluded.push({ p, last, missing: need.filter((x) => !cv.has(x)).sort() });
  }
  if (!included.length) return null;

  const first = [...new Set(items.filter((i) => included.includes(i.p)).map((i) => i.m))].sort()[0];
  const months = monthRange(first, globalLast);
  const idx = new Map(months.map((m, i) => [m, i]));

  // Bulan terakhir yang belum penuh: diproyeksikan per platform menurut tanggal terakhir datanya.
  const factor = new Map<Platform, number>();
  const notes: string[] = [];
  const dim = daysIn(globalLast);
  for (const p of included) {
    let lastDay = 0;
    for (const i of items) if (i.p === p && i.m === globalLast) lastDay = Math.max(lastDay, +i.d.slice(8, 10));
    const f = lastDay > 0 && lastDay < dim ? dim / lastDay : 1;
    factor.set(p, f);
    if (f > 1) notes.push(`${p} sampai tanggal ${lastDay} (dikali ${f.toLocaleString('id-ID', { maximumFractionDigits: 2 })})`);
  }

  const groups = new Map<string, { names: Map<string, number>; plats: Set<Platform>; units: number[]; value: number[] }>();
  for (const it of items) {
    if (!included.includes(it.p) || !isActive(it)) continue;
    const key = level === 'sku' ? it.sku.toUpperCase().trim() : normName(it.name);
    if (!key) continue;
    const mi = idx.get(it.m);
    if (mi === undefined) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { names: new Map(), plats: new Set(), units: new Array(months.length).fill(0), value: new Array(months.length).fill(0) }));
    const f = it.m === globalLast ? factor.get(it.p) ?? 1 : 1;
    g.units[mi] += it.q * f;
    g.value[mi] += it.ha * f;
    g.plats.add(it.p);
    g.names.set(it.name, (g.names.get(it.name) ?? 0) + it.q);
  }
  const series: ProdSeries[] = [];
  for (const [key, g] of groups) {
    const launch = g.units.findIndex((u) => u > 0);
    if (launch < 0) continue;
    let name = key;
    let best = -1;
    for (const [n, c] of g.names) if (c > best) ((best = c), (name = n));
    series.push({ key, name, platforms: PLATFORMS.filter((p) => g.plats.has(p)), units: g.units, value: g.value, launch });
  }
  const gaps: { p: Platform; months: string[] }[] = [];
  for (const p of included) {
    const cv = cover.get(p)!;
    const start = [...cv].sort()[0];
    const miss = monthRange(start, globalLast).filter((m) => !cv.has(m));
    if (miss.length) gaps.push({ p, months: miss });
  }
  const partial = notes.length ? { month: globalLast, notes } : null;
  return { months, target: nextMonth(globalLast), included, excluded, gaps, partial, series, lastComplete: partial ? months.length - 2 : months.length - 1 };
}

function prevMonth(m: string): string {
  let y = +m.slice(0, 4);
  let mm = +m.slice(5, 7) - 1;
  if (mm < 1) {
    mm = 12;
    y--;
  }
  return `${y}-${mm < 10 ? '0' + mm : mm}`;
}

/* ---------------------------------- backtest ---------------------------------- */

export interface BacktestMonth {
  month: string;
  products: number;
  actual: number;
  predicted: number;
  wape: number; // jumlah |selisih| / jumlah aktual
  totalErr: number; // (prediksi - aktual) / aktual
  hit10: number; // dari 10 produk teratas prediksi, berapa yang memang masuk 10 teratas aktual
}

/** Menguji metode pada bulan-bulan lalu: memprediksi bulan t hanya dari data sebelum t, lalu membandingkan dengan kenyataan. */
export function backtest(p: Prepared, method: Method, minHistory = 3): { months: BacktestMonth[]; ratios: number[] } {
  const out: BacktestMonth[] = [];
  const ratios: number[] = [];
  for (let t = minHistory; t <= p.lastComplete; t++) {
    const rows: { f: number; a: number }[] = [];
    for (const s of p.series) {
      if (s.launch >= t) continue; // belum ada riwayat: tidak mungkin diprediksi
      const f = predictNext(s.units.slice(s.launch, t), method);
      rows.push({ f, a: s.units[t] });
      if (f >= 5) ratios.push(s.units[t] / f);
    }
    const A = rows.reduce((x, r) => x + r.a, 0);
    const F = rows.reduce((x, r) => x + r.f, 0);
    if (A <= 0) continue;
    const err = rows.reduce((x, r) => x + Math.abs(r.a - r.f), 0);
    const top = (k: 'f' | 'a') =>
      new Set(
        rows
          .map((r, i) => ({ i, v: r[k] }))
          .sort((x, y) => y.v - x.v)
          .slice(0, 10)
          .map((x) => x.i),
      );
    const tf = top('f');
    const ta = top('a');
    let hit = 0;
    for (const i of tf) if (ta.has(i)) hit++;
    out.push({ month: p.months[t], products: rows.length, actual: A, predicted: F, wape: err / A, totalErr: (F - A) / A, hit10: hit });
  }
  return { months: out, ratios };
}

function quantile(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/* ---------------------------------- prakiraan ---------------------------------- */

export type Trend = 'naik' | 'stabil' | 'turun' | 'baru';
export type Confidence = 'tinggi' | 'sedang' | 'rendah';

export interface ForecastRow {
  key: string;
  name: string;
  platforms: Platform[];
  f: number;
  low: number | null;
  high: number | null;
  value: number; // perkiraan Harga Akhir (unit x harga rata-rata 3 bulan terakhir)
  lastUnits: number;
  avg3: number;
  trend: Trend;
  trendPct: number | null;
  confidence: Confidence;
  months: number; // jumlah bulan sejak pertama terjual
  cls: 'A' | 'B' | 'C';
  share: number;
}

export interface ForecastResult {
  prepared: Prepared;
  method: Method;
  methodScores: { method: Method; wape: number | null; hit10: number | null }[];
  selectedByBacktest: boolean;
  backtest: BacktestMonth[];
  range: { lo: number; hi: number } | null;
  rows: ForecastRow[];
  totalUnits: number;
  totalValue: number;
  medianTotalErr: number | null;
  avgWape: number | null;
  avgHit10: number | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

export function forecast(prepared: Prepared): ForecastResult {
  const p = prepared;
  const scores = METHODS.map((m) => {
    const bt = backtest(p, m);
    return { method: m, wape: bt.months.length >= 2 ? mean(bt.months.map((x) => x.wape)) : null, hit10: bt.months.length >= 2 ? mean(bt.months.map((x) => x.hit10)) : null, bt };
  });
  const valid = scores.filter((s) => s.wape !== null);
  const selectedByBacktest = valid.length > 0;
  const chosen = selectedByBacktest ? valid.reduce((b, s) => (s.wape! < b.wape! ? s : b)) : scores.find((s) => s.method === 'wma')!;
  const bt = chosen.bt;
  const range =
    bt.ratios.length >= 30
      ? { lo: Math.max(0, quantile(bt.ratios, 0.2)), hi: quantile(bt.ratios, 0.8) }
      : null;

  const last = p.months.length - 1;
  const rows: ForecastRow[] = [];
  for (const s of p.series) {
    const recent = s.units.slice(Math.max(0, last - 2), last + 1);
    if (recent.reduce((x, y) => x + y, 0) <= 0) continue; // tidak terjual 3 bulan terakhir: dianggap tidak aktif
    const hist = s.units.slice(s.launch);
    const f = predictNext(hist, chosen.method);
    const n = hist.length;
    const avg3 = mean(recent);
    const v3 = s.value.slice(Math.max(0, last - 2), last + 1).reduce((x, y) => x + y, 0);
    const u3 = recent.reduce((x, y) => x + y, 0);
    let trend: Trend = 'baru';
    let trendPct: number | null = null;
    if (n >= 6) {
      const prev = mean(s.units.slice(last - 5, last - 2));
      if (prev > 0) {
        trendPct = (avg3 - prev) / prev;
        trend = trendPct > 0.15 ? 'naik' : trendPct < -0.15 ? 'turun' : 'stabil';
      }
    }
    const tail = hist.slice(-4);
    const cv = mean(tail) > 0 ? Math.sqrt(mean(tail.map((x) => (x - mean(tail)) ** 2))) / mean(tail) : 9;
    const confidence: Confidence = n >= 6 && cv < 0.4 ? 'tinggi' : n >= 3 && cv < 0.8 ? 'sedang' : 'rendah';
    rows.push({
      key: s.key,
      name: s.name,
      platforms: s.platforms,
      f,
      low: range ? f * range.lo : null,
      high: range ? f * range.hi : null,
      value: u3 > 0 ? f * (v3 / u3) : 0,
      lastUnits: s.units[last],
      avg3,
      trend,
      trendPct,
      confidence,
      months: n,
      cls: 'C',
      share: 0,
    });
  }
  rows.sort((a, b) => b.f - a.f);
  const total = rows.reduce((x, r) => x + r.f, 0);
  let acc = 0;
  for (const r of rows) {
    r.share = total ? r.f / total : 0;
    const before = total ? acc / total : 0;
    r.cls = before < 0.7 ? 'A' : before < 0.9 ? 'B' : 'C';
    acc += r.f;
  }
  return {
    prepared: p,
    method: chosen.method,
    methodScores: scores.map((s) => ({ method: s.method, wape: s.wape, hit10: s.hit10 })),
    selectedByBacktest,
    backtest: bt.months,
    range,
    rows,
    totalUnits: total,
    totalValue: rows.reduce((x, r) => x + r.value, 0),
    medianTotalErr: bt.months.length ? median(bt.months.map((x) => Math.abs(x.totalErr))) : null,
    avgWape: bt.months.length >= 2 ? mean(bt.months.map((x) => x.wape)) : null,
    avgHit10: bt.months.length >= 2 ? mean(bt.months.map((x) => x.hit10)) : null,
  };
}
