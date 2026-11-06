// Uji logika forecast dengan seri sintetis yang jawabannya diketahui (hanya untuk pengujian, bukan data penjualan).
import { predictNext, prepare, forecast, nextMonth } from '../src/lib/forecast';
import type { Item } from '../src/lib/types';

let fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'LOLOS ' : 'GAGAL ') + name + (extra ? ' | ' + extra : ''));
  if (!cond) fail++;
};

ok('nextMonth Des -> Jan', nextMonth('2026-12') === '2027-01');
ok('seri konstan -> prakiraan konstan (semua metode)', (['naive', 'avg3', 'wma', 'trend'] as const).every((m) => Math.abs(predictNext([10, 10, 10, 10, 10, 10], m) - 10) < 1e-9));
const up = [10, 20, 30, 40, 50, 60];
ok('tren naik: metode tren > rata-rata berbobot', predictNext(up, 'trend') > predictNext(up, 'wma'), `trend=${predictNext(up, 'trend')} wma=${predictNext(up, 'wma')}`);
ok('tak pernah negatif', predictNext([50, 30, 10, 0, 0, 0], 'trend') >= 0);
ok('riwayat 1 bulan = bulan itu', predictNext([7], 'wma') === 7);

// dataset sintetis: 3 produk, 8 bulan, 1 platform, tanggal lengkap sampai akhir bulan
const mk = (name: string, m: string, q: number, d = m === '2026-08' ? '31' : '15', p: 'TikTok' | 'Shopee' = 'TikTok', t: Item['t'] = 'completed'): Item => ({
  k: `${p}|${name}|${m}`, p, o: `${name}-${m}-${p}`, d: `${m}-${d}`, h: 1, m, st: 's', t, sku: name, name, v: '', cat: '', q, rq: 0, unit: 100, gross: 100 * q, sd: 0, pd: 0, ha: 100 * q, rf: 0, cr: '', ch: '', flag: '', src: 'x',
});
const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const items: Item[] = [];
months.forEach((m, i) => {
  items.push(mk('STABIL', m, 100));
  items.push(mk('NAIK', m, 10 * (i + 1)));
  if (i >= 5) items.push(mk('BARU', m, 40)); // muncul bulan ke-6
  items.push(mk('BATAL', m, 999, '16', 'TikTok', 'cancelled')); // tidak boleh dihitung
  items.push(mk('TUTUP', m, i < 3 ? 50 : 0 + (i < 3 ? 0 : 0))); // berhenti terjual setelah bulan ke-3
});
items.push(mk('SHOPEEONLY', '2026-03', 20, '15', 'Shopee')); // Shopee berhenti di Maret: harus dikeluarkan
const prep = prepare(items.filter((i) => i.q > 0), 'sku')!;
ok('platform dengan data berhenti dikeluarkan', prep.excluded.some((e) => e.p === 'Shopee') && prep.included.join() === 'TikTok');
ok('bulan target = bulan setelah data terakhir', prep.target === '2026-09');
ok('bulan terakhir lengkap (sampai tanggal 31) => tidak diproyeksikan', prep.partial === null);
const res = forecast(prep);
const by = Object.fromEntries(res.rows.map((r) => [r.key, r]));
ok('produk batal tidak dihitung', !by['BATAL']);
ok('produk berhenti 3 bulan tidak diprakirakan', !by['TUTUP']);
ok('produk stabil ~ 100', Math.abs(by['STABIL'].f - 100) < 1, `f=${by['STABIL']?.f.toFixed(1)}`);
ok('produk baru berkepercayaan rendah/sedang', by['BARU'].confidence !== 'tinggi', by['BARU']?.confidence);
ok('ranking: urut menurun', res.rows.every((r, i) => i === 0 || res.rows[i - 1].f >= r.f));
ok('porsi jumlahnya 1', Math.abs(res.rows.reduce((x, r) => x + r.share, 0) - 1) < 1e-9);
ok('backtest ada', res.backtest.length >= 2, `bulan uji=${res.backtest.length} metode=${res.method} WAPE=${res.avgWape?.toFixed(3)}`);
// bulan terakhir baru terisi sampai tanggal 15 -> diproyeksikan x 31/15 dan tidak dipakai sebagai bulan uji
const half = items.filter((i) => i.q > 0).map((i) => (i.m === '2026-08' ? { ...i, d: '2026-08-15', q: Math.round(i.q / 2) } : i));
const prepHalf = prepare(half, 'sku')!;
ok('bulan berjalan terdeteksi', prepHalf.partial !== null && prepHalf.lastComplete === prepHalf.months.length - 2);
const stab = prepHalf.series.find((s) => s.key === 'STABIL')!;
ok('unit bulan berjalan diproyeksikan ke sebulan penuh', Math.abs(stab.units[stab.units.length - 1] - 50 * (31 / 15)) < 1e-6, `unit=${stab.units[stab.units.length - 1].toFixed(2)}`);
console.log(JSON.stringify(res.rows.map((r) => [r.name, Math.round(r.f), r.trend, r.confidence, r.cls])));
process.exit(fail ? 1 : 0);
