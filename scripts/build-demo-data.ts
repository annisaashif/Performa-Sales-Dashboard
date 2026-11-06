// Membaca file di demo-data/ memakai pembaca dan normalisasi yang sama dengan aplikasi, lalu menulis demo/demo-data.json
// (dipakai oleh build demo statis). Pemakaian: npx tsx scripts/build-demo-data.ts
import fs from 'node:fs';
import path from 'node:path';
import { readXlsx } from '../src/lib/xlsx';
import { parseCsv } from '../src/lib/csv';
import { normalize } from '../src/lib/normalize';
import { monthsOf } from '../src/lib/kpi';
import type { FileMeta, Item } from '../src/lib/types';

const dir = path.resolve(import.meta.dirname, '../demo-data');
const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|csv)$/.test(f)).sort();
const metas: FileMeta[] = [];
const items: Item[] = [];
(async () => {
  let t = 1_762_000_000_000; // waktu impor tetap supaya hasil selalu sama
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const rows = f.endsWith('.csv') ? parseCsv(buf.toString('utf8')) : await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const res = normalize(rows, f);
    metas.push({ name: f, platform: res.platform, importedAt: (t += 1000), rows: res.rows, items: res.items.length, orders: new Set(res.items.map((i) => i.o)).size, months: monthsOf(res.items), warnings: res.warnings });
    items.push(...res.items);
    console.log(f.padEnd(24), res.platform.padEnd(8), String(res.items.length).padStart(5), res.warnings.length ? '⚠ ' + res.warnings.join(' | ').slice(0, 110) : '');
  }
  fs.writeFileSync(path.resolve(import.meta.dirname, '../demo/demo-data.json'), JSON.stringify({ files: metas, items }));
  console.log('\nTotal baris:', items.length, 'ukuran JSON', (fs.statSync(path.resolve(import.meta.dirname, '../demo/demo-data.json')).size / 1024).toFixed(0) + ' KB');
})();
