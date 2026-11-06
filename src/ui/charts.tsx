import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';

/* ------------------------------------------------------------------ */
/* Pembantu                                                            */
/* ------------------------------------------------------------------ */

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** Rounded top, flat bottom (data-end 4px, anchored to the baseline). */
function topRound(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceTicks(max: number, n = 4): number[] {
  if (max <= 0) return [0];
  const s = scaleLinear().domain([0, max]).nice(n);
  return s.ticks(n);
}

export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tw, setTw] = useState(180);
  useLayoutEffect(() => {
    if (ref.current) setTw(ref.current.offsetWidth);
  });
  let left = x + 14;
  if (left + tw > width - 4) left = Math.max(4, x - tw - 14);
  return (
    <div ref={ref} className="tip" style={{ left, top: Math.max(0, y) }} role="presentation">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kolom bertumpuk (per bulan x platform)                              */
/* ------------------------------------------------------------------ */

export interface StackDatum {
  label: string;
  title: string;
  values: Record<string, number>;
}

export type ColumnMode = 'stack' | 'group' | 'share';

/**
 * Kolom per kategori (bulan) dengan tiga tata letak:
 *  stack = bertumpuk (total terlihat), group = berdampingan (skala sama, mudah dibandingkan),
 *  share = porsi 100% (komposisi, bukan besaran).
 */
export function StackedColumns({
  data,
  series,
  fmt,
  fmtAxis,
  height = 270,
  ariaLabel,
  mode = 'stack',
}: {
  data: StackDatum[];
  series: Series[];
  fmt: (n: number) => string;
  fmtAxis: (n: number) => string;
  height?: number;
  ariaLabel: string;
  mode?: ColumnMode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const m = { t: 10, r: 8, b: 26, l: 56 };
  const iw = Math.max(0, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const totals = data.map((d) => series.reduce((s, k) => s + (d.values[k.key] ?? 0), 0));
  const biggest = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const ticks = useMemo(
    () => (mode === 'share' ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(mode === 'group' ? biggest : Math.max(...totals, 1))),
    [mode, biggest, totals.join(',')],
  );
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(64, band * 0.6);
  const axisText = (t: number) => (mode === 'share' ? `${Math.round(t * 100)}%` : fmtAxis(t));
  const pctOf = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '–');
  const gbw = Math.min(26, (band * 0.84) / Math.max(1, series.length) - 2);

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'gl'} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {axisText(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.l + band * i + band / 2;
            let acc = 0;
            const segs = series.filter((s) => (d.values[s.key] ?? 0) > 0);
            const rowTotal = totals[i];
            const groupW = series.length * gbw + (series.length - 1) * 2;
            return (
              <g key={d.title} opacity={hover === null || hover === i ? 1 : 0.55}>
                {mode === 'group' &&
                  series.map((s, k) => {
                    const v = d.values[s.key] ?? 0;
                    if (v <= 0) return null;
                    const h = Math.max(2, y(0) - y(v)); // nilai kecil tetap terlihat (minimal 2px)
                    return <path key={s.key} d={topRound(cx - groupW / 2 + k * (gbw + 2), y(0) - h, gbw, h, 3)} fill={s.color} />;
                  })}
                {mode !== 'group' && segs.map((s, si) => {
                  const raw = d.values[s.key] ?? 0;
                  const v = mode === 'share' ? (rowTotal > 0 ? raw / rowTotal : 0) : raw;
                  const y0 = y(acc + v);
                  const h = y(acc) - y0;
                  acc += v;
                  const isTop = si === segs.length - 1;
                  const gap = si === 0 ? 0 : 2;
                  const hh = Math.max(0, h - gap);
                  return isTop ? (
                    <path key={s.key} d={topRound(cx - bw / 2, y0, bw, hh, 4)} fill={s.color} />
                  ) : (
                    <rect key={s.key} x={cx - bw / 2} y={y0} width={bw} height={hh} fill={s.color} />
                  );
                })}
                <text x={cx} y={height - 8} textAnchor="middle" className="tick">
                  {d.label}
                </text>
                <rect
                  x={m.l + band * i}
                  y={m.t}
                  width={band}
                  height={ih + m.b}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover(i);
                    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tip x={pos.x} y={pos.y} width={width}>
          <strong>{data[hover].title}</strong>
          {series.map((s) => (
            <div className="tip-row" key={s.key}>
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <b>
                {fmt(data[hover!].values[s.key] ?? 0)}
                <span className="tip-pct"> · {pctOf(data[hover!].values[s.key] ?? 0, totals[hover!])}</span>
              </b>
            </div>
          ))}
          <div className="tip-row total">
            <span>Total</span>
            <b>{fmt(totals[hover])}</b>
          </div>
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Garis (tren harian / mingguan / bulanan)                            */
/* ------------------------------------------------------------------ */

export interface LineSeries extends Series {
  points: { x: string; y: number }[];
}

const dayMs = (d: string) => {
  const [yy, mm, dd] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(yy, mm - 1, dd || 1);
};

export function LineChart({
  series,
  fmt,
  fmtAxis,
  xLabel,
  xTitle,
  height = 280,
  ariaLabel,
}: {
  series: LineSeries[];
  fmt: (n: number) => string;
  fmtAxis: (n: number) => string;
  xLabel: (x: string) => string;
  xTitle: (x: string) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 12, r: 14, b: 26, l: 56 };
  const iw = Math.max(0, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const x0 = xs.length ? dayMs(xs[0]) : 0;
  const x1 = xs.length ? dayMs(xs[xs.length - 1]) : 1;
  const X = (x: string) => m.l + (x1 === x0 ? iw / 2 : ((dayMs(x) - x0) / (x1 - x0)) * iw);
  const Y = (v: number) => m.t + ih - (v / top) * ih;
  const tickXs = useMemo(() => {
    if (xs.length <= 7) return xs;
    const n = Math.max(2, Math.min(7, Math.floor(iw / 90)));
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
    return [...new Set(out)];
  }, [xs, iw]);

  const lookup = useMemo(
    () => series.map((s) => new Map(s.points.map((p) => [p.x, p.y]))),
    [series],
  );

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    let bd = Infinity;
    xs.forEach((x, i) => {
      const dd = Math.abs(X(x) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  }

  const hx = hover !== null ? xs[hover] : null;
  const single = series.length === 1;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'axis' : 'gl'} />
              <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" className="tick">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {tickXs.map((x) => (
            <text key={x} x={X(x)} y={height - 8} textAnchor="middle" className="tick">
              {xLabel(x)}
            </text>
          ))}
          {series.map((s) => {
            const pts = s.points.slice().sort((a, b) => (a.x < b.x ? -1 : 1));
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
            const last = pts[pts.length - 1];
            return (
              <g key={s.key}>
                {single && (
                  <path
                    d={`${d}L${X(last.x)},${Y(0)}L${X(pts[0].x)},${Y(0)}Z`}
                    fill={s.color}
                    opacity={0.12}
                  />
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.length <= 40 &&
                  pts.map((p) => <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={3} fill={s.color} className="dot" />)}
                <circle cx={X(last.x)} cy={Y(last.y)} r={4} fill={s.color} className="dot" />
              </g>
            );
          })}
          {hx && (
            <g>
              <line x1={X(hx)} x2={X(hx)} y1={m.t} y2={m.t + ih} className="cross" />
              {series.map((s, i) => {
                const v = lookup[i].get(hx);
                return v === undefined ? null : (
                  <circle key={s.key} cx={X(hx)} cy={Y(v)} r={5} fill={s.color} className="dot hot" />
                );
              })}
            </g>
          )}
          <rect
            x={m.l}
            y={m.t}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hx && (
        <Tip x={X(hx)} y={m.t + 4} width={width}>
          <strong>{xTitle(hx)}</strong>
          {series.map((s, i) => (
            <div className="tip-row" key={s.key}>
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <b>{fmt(lookup[i].get(hx) ?? 0)}</b>
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kolom tunggal (hari dalam minggu, jam)                              */
/* ------------------------------------------------------------------ */

export function Columns({
  data,
  color,
  fmt,
  fmtAxis,
  height = 200,
  ariaLabel,
  highlightMax = true,
}: {
  data: { label: string; title: string; value: number }[];
  color: string;
  fmt: (n: number) => string;
  fmtAxis: (n: number) => string;
  height?: number;
  ariaLabel: string;
  highlightMax?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const m = { t: 8, r: 6, b: 24, l: 50 };
  const iw = Math.max(0, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = useMemo(() => niceTicks(max, 3), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.max(3, Math.min(40, band * 0.66));
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const every = band < 22 ? 2 : 1;
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'gl'} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.l + band * i + band / 2;
            const isMax = highlightMax && d.value === max && max > 0;
            return (
              <g key={d.title} opacity={hover === null || hover === i ? 1 : 0.6}>
                <path d={topRound(cx - bw / 2, y(d.value), bw, y(0) - y(d.value), 3)} fill={color} opacity={isMax ? 1 : 0.62} />
                {i % every === 0 && (
                  <text x={cx} y={height - 7} textAnchor="middle" className="tick">
                    {d.label}
                  </text>
                )}
                <rect
                  x={m.l + band * i}
                  y={m.t}
                  width={band}
                  height={ih + m.b}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover(i);
                    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tip x={pos.x} y={pos.y} width={width}>
          <strong>{data[hover].title}</strong>
          <div className="tip-row">
            <span>Nilai</span>
            <b>{fmt(data[hover].value)}</b>
          </div>
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batang horizontal (peringkat)                                       */
/* ------------------------------------------------------------------ */

export function HBars({
  items,
  color = 'var(--s1)',
  fmt,
  max,
}: {
  items: { label: string; value: number; sub?: string; color?: string }[];
  color?: string;
  fmt: (n: number) => string;
  max?: number;
}) {
  const mx = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="hbars">
      {items.map((it) => (
        <li key={it.label} title={`${it.label}: ${fmt(it.value)}${it.sub ? ' · ' + it.sub : ''}`}>
          <div className="hb-label">
            <span className="hb-name">{it.label}</span>
            {it.sub && <span className="hb-sub">{it.sub}</span>}
          </div>
          <div className="hb-track">
            <div className="hb-fill" style={{ width: `${Math.max(0.5, (it.value / mx) * 100)}%`, background: it.color ?? color }} />
          </div>
          <b className="hb-val">{fmt(it.value)}</b>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Bar komposisi 100%                                                  */
/* ------------------------------------------------------------------ */

export function ShareBar({
  parts,
  fmt,
  unit,
}: {
  parts: { label: string; value: number; color: string }[];
  fmt: (n: number) => string;
  unit?: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  if (total <= 0) return <p className="muted">Belum ada data.</p>;
  return (
    <div className="share">
      <div className="share-bar" role="img" aria-label={parts.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(1)}%`).join(', ')}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.label}
              style={{ flex: p.value, background: p.color, opacity: hover === null || hover === p.label ? 1 : 0.5 }}
              onMouseEnter={() => setHover(p.label)}
              onMouseLeave={() => setHover(null)}
              title={`${p.label}: ${fmt(p.value)} (${((p.value / total) * 100).toFixed(1)}%)`}
            />
          ))}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label} onMouseEnter={() => setHover(p.label)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{fmt(p.value)}</b>
            <em>{((p.value / total) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="legend inline" aria-label="Legenda">
      {series.map((s) => (
        <li key={s.key}>
          <i style={{ background: s.color }} />
          <span>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}
