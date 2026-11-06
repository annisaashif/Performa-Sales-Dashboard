/** Parser CSV kecil: mendeteksi pemisah (; , tab) dan mendukung tanda kutip. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.search(/\r?\n/) >= 0 ? text.search(/\r?\n/) : text.length);
  const cands = [';', ',', '\t'];
  let delim = ';';
  let best = -1;
  for (const c of cands) {
    const n = firstLine.split(c).length;
    if (n > best) {
      best = n;
      delim = c;
    }
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}
