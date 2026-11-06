// Membandingkan hasil perbaikan otomatis file Shopee rusak dengan versi aslinya (hanya untuk data demo).
import fs from 'node:fs';
import { readXlsx } from '../src/lib/xlsx';
import { normalize } from '../src/lib/normalize';
const [a, b] = process.argv.slice(2);
const load = async (f: string) => { const buf = fs.readFileSync(f); return normalize(await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer), f); };
(async () => {
  const r = await load(a), t = await load(b);
  const sum = (x: typeof r.items, k: 'ha' | 'gross' | 'sd' | 'q') => x.reduce((s, i) => s + i[k], 0);
  for (const k of ['q', 'gross', 'sd', 'ha'] as const) console.log(k.padEnd(6), 'diperbaiki', Math.round(sum(r.items, k)), '| asli', Math.round(sum(t.items, k)));
  console.log('baris', r.items.length, 'vs', t.items.length, '| peringatan:', r.warnings.join(' ').slice(0, 200));
})();
