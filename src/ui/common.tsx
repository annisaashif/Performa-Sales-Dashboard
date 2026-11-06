import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FileMeta, Filter, Item, Platform } from '../lib/types';

export interface Ctx {
  all: Item[]; // semua data yang sudah diimpor
  items: Item[]; // setelah filter periode dan platform
  filter: Filter;
  setFilter: (f: Filter) => void;
  months: string[];
  files: FileMeta[];
  own: Set<string>;
  ownText: string;
  setOwnText: (s: string) => void;
  go: (page: string) => void;
}

export const DataCtx = createContext<Ctx>(null as unknown as Ctx);
export const useData = () => useContext(DataCtx);

export const PLATFORM_COLOR: Record<Platform, string> = {
  TikTok: 'var(--s1)',
  Shopee: 'var(--s2)',
  Website: 'var(--s3)',
};

export function PageHead({ title, lead, basis }: { title: string; lead: string; basis?: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p>{lead}</p>
      {basis && <span className="basis">{basis}</span>}
    </header>
  );
}

export function Card({
  title,
  note,
  children,
  className = '',
  right,
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {note && <p className="note">{note}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  sub,
  lead,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  lead?: boolean;
  tone?: 'warn';
}) {
  return (
    <div className={`tile ${lead ? 'lead' : ''} ${tone ?? ''}`}>
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'crit' | 'info' }) {
  return <span className={`pill ${tone ?? ''}`}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function NeedData() {
  const { go } = useData();
  return (
    <Empty
      title="Belum ada data penjualan"
      action={
        <button className="btn primary" onClick={() => go('data')}>
          Impor file penjualan
        </button>
      }
    >
      Impor file export TikTok Shop, Shopee, dan Website di halaman Data. File diproses di peramban ini dan tidak diunggah ke mana pun.
    </Empty>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- tabel ------------------------------- */

export interface Col<T> {
  key: string;
  label: string;
  align?: 'right' | 'left';
  render: (r: T) => ReactNode;
  sort?: (r: T) => number | string;
  title?: string;
}

export function DataTable<T>({
  cols,
  rows,
  rowKey,
  initialSort,
  pageSize = 15,
  caption,
  empty = 'Tidak ada data.',
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  caption: string;
  empty?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c?.sort) return rows;
    const f = c.sort;
    const out = [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y), 'id');
    });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, cols]);
  const shown = all ? sorted : sorted.slice(0, pageSize);
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>
            {cols.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.align === 'right' ? 'r' : ''}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  title={c.title}
                >
                  {c.sort ? (
                    <button
                      className="th-btn"
                      onClick={() => setSort({ key: c.key, dir: active && sort!.dir === 'desc' ? 'asc' : 'desc' })}
                    >
                      {c.label}
                      <span className="arrow" aria-hidden>
                        {active ? (sort!.dir === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)}>
              {cols.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'r' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={cols.length} className="muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > pageSize && (
        <button className="btn ghost more" onClick={() => setAll(!all)}>
          {all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${sorted.length.toLocaleString('id-ID')} baris)`}
        </button>
      )}
    </div>
  );
}
