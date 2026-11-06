import fs from 'node:fs';
import { readXlsx } from '../src/lib/xlsx';
import { parseCsv } from '../src/lib/csv';
import { normalize } from '../src/lib/normalize';
const A = (process.env.DATA_DIR ?? '.') + '/';
const files = process.argv.slice(2); // contoh: TikTok_Okt_2026.xlsx Shopee_Okt_2026.xlsx Website_Okt_2026.csv (dengan DATA_DIR=demo-data)
(async () => {
  for (const f of files) {
    const t0 = Date.now();
    const buf = fs.readFileSync(A + f);
    const rows = f.endsWith('.csv') ? parseCsv(buf.toString('utf8')) : await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const t1 = Date.now();
    const r = normalize(rows, f);
    const comp = r.items.filter((i) => i.t === 'completed');
    const orders = new Set(comp.map((i) => i.o)).size;
    const sum = (k: 'gross' | 'sd' | 'pd' | 'ha' | 'rf' | 'q') => comp.reduce((a, i) => a + i[k], 0);
    const tiers: Record<string, Set<string>> = {};
    for (const i of r.items) (tiers[i.t] ??= new Set()).add(i.o);
    console.log(`\n== ${f}  platform=${r.platform} rawRows=${rows.length} dataRows=${r.rows} items=${r.items.length}  read=${t1 - t0}ms normalize=${Date.now() - t1}ms`);
    console.log('warnings:', r.warnings);
    console.log('completed orders', orders, 'qty', sum('q'), 'gross', sum('gross'), 'sd', sum('sd'), 'pd', sum('pd'), 'ha', Math.round(sum('ha')), 'rf', Math.round(sum('rf')), 'net', Math.round(sum('ha') - sum('rf')));
    console.log('tiers (orders):', Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.size])));
    console.log('flags:', r.items.filter((i) => i.flag).length, 'months', [...new Set(r.items.map((i) => i.m))]);
  }
})();
