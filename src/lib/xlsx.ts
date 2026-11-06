import JSZip from 'jszip';

/**
 * Pembaca .xlsx minimal: membuka zip, membaca sharedStrings dan sheet pertama,
 * lalu mengembalikan semua sel sebagai teks (angka tetap string agar ID panjang
 * seperti nomor pesanan TikTok tidak kehilangan digit).
 */

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_m, g: string) => {
    if (g[0] === '#') {
      const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return String.fromCodePoint(n);
    }
    return ENT[g];
  });
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n - 1;
}

const T_RE = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;

function textOf(xml: string): string {
  if (xml.indexOf('<rPh') >= 0) xml = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
  let out = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(xml))) out += m[1];
  return decode(out);
}

function parseShared(xml: string): string[] {
  const out: string[] = [];
  let pos = 0;
  for (;;) {
    const a = xml.indexOf('<si', pos);
    if (a < 0) break;
    const c = xml.charCodeAt(a + 3);
    if (c === 47) {
      // <si/>
      out.push('');
      pos = a + 5;
      continue;
    }
    const b = xml.indexOf('</si>', a);
    const end = b < 0 ? xml.length : b;
    out.push(textOf(xml.slice(a, end)));
    pos = end + 5;
  }
  return out;
}

async function pickSheetPath(zip: JSZip): Promise<string> {
  try {
    const wb = await zip.file('xl/workbook.xml')?.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
    if (wb && rels) {
      const first = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb);
      if (first) {
        const re = new RegExp('<Relationship\\b[^>]*\\bId="' + first[1] + '"[^>]*>');
        const rel = re.exec(rels);
        const target = rel && /\bTarget="([^"]+)"/.exec(rel[0]);
        if (target) {
          const t = target[1].replace(/^\//, '');
          return t.startsWith('xl/') ? t : 'xl/' + t;
        }
      }
    }
  } catch {
    /* jatuh ke pencarian nama */
  }
  const names = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  if (!names.length) throw new Error('Tidak ada sheet di file Excel ini.');
  return names[0];
}

const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const V_RE = /<v>([\s\S]*?)<\/v>/;

export async function readXlsx(
  buf: ArrayBuffer,
  onProgress?: (done: number) => void,
): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buf);
  const sstFile = zip.file('xl/sharedStrings.xml');
  const shared = sstFile ? parseShared(await sstFile.async('string')) : [];
  const sheetPath = await pickSheetPath(zip);
  const xml = await zip.file(sheetPath)!.async('string');

  const rows: string[][] = [];
  let pos = xml.indexOf('<sheetData');
  if (pos < 0) return rows;
  for (;;) {
    const a = xml.indexOf('<row', pos);
    if (a < 0) break;
    const tagEnd = xml.indexOf('>', a);
    if (xml.charCodeAt(tagEnd - 1) === 47) {
      pos = tagEnd + 1;
      continue;
    }
    const b = xml.indexOf('</row>', tagEnd);
    const body = xml.slice(tagEnd + 1, b);
    pos = b + 6;

    const row: string[] = [];
    CELL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CELL_RE.exec(body))) {
      const attrs = m[1];
      const inner = m[2];
      if (inner === undefined) continue;
      const rm = /\br="([A-Za-z]+)\d+"/.exec(attrs);
      const col = rm ? colIndex(rm[1]) : row.length;
      const tm = /\bt="(\w+)"/.exec(attrs);
      const t = tm ? tm[1] : 'n';
      let val = '';
      if (t === 'inlineStr') {
        val = textOf(inner);
      } else {
        const vm = V_RE.exec(inner);
        if (vm) val = t === 's' ? (shared[parseInt(vm[1], 10)] ?? '') : decode(vm[1]);
      }
      while (row.length < col) row.push('');
      row[col] = val;
    }
    if (row.length) rows.push(row);
    if ((rows.length & 2047) === 0) {
      onProgress?.(rows.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return rows;
}
