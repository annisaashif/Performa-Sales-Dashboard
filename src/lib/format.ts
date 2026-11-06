const ID = 'id-ID';
const nf0 = new Intl.NumberFormat(ID, { maximumFractionDigits: 0 });

export const fmtInt = (n: number) => nf0.format(Math.round(n));
export const rp = (n: number) => (n < 0 ? '-Rp' : 'Rp') + nf0.format(Math.abs(Math.round(n)));

export function rpC(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  const f = (v: number, d: number) => v.toLocaleString(ID, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (a >= 1e12) return `${s}Rp${f(a / 1e12, 2)} T`;
  if (a >= 1e9) return `${s}Rp${f(a / 1e9, 2)} M`;
  if (a >= 1e6) return `${s}Rp${f(a / 1e6, 1)} jt`;
  if (a >= 1e3) return `${s}Rp${f(a / 1e3, 0)} rb`;
  return `${s}Rp${f(a, 0)}`;
}

export function pct(x: number, d = 1): string {
  if (!Number.isFinite(x)) return '–';
  return (x * 100).toLocaleString(ID, { maximumFractionDigits: d, minimumFractionDigits: 0 }) + '%';
}

export function signedPct(x: number, d = 1): string {
  if (!Number.isFinite(x)) return '–';
  return (x > 0 ? '+' : '') + pct(x, d);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const monthShort = (m: string) => MON[+m.slice(5, 7) - 1];
export const monthLabel = (m: string) => `${monthShort(m)} ${m.slice(0, 4)}`;
export function dateLabel(d: string): string {
  return `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
}
export function dateLong(d: string): string {
  return `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}
export const WEEKDAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
