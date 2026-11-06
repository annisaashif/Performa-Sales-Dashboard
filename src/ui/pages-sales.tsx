import { useMemo, useState } from 'react';
import { PLATFORMS, TIER_LABEL, TIER_ORDER } from '../lib/types';
import type { Item, Platform } from '../lib/types';
import {
  aov,
  completed,
  groupAgg,
  isActive,
  lastDate,
  monthRange,
  monthsOf,
  netAfter,
  productTable,
  tierSummary,
  totalAgg,
  weekStart,
  weekday,
} from '../lib/kpi';
import { buildInsights } from '../lib/insights';
import { WEEKDAYS, dateLabel, dateLong, fmtInt, monthLabel, monthShort, pct, rp, rpC, signedPct } from '../lib/format';
import { Card, Col, DataTable, NeedData, PLATFORM_COLOR, PageHead, Pill, Segmented, Tile, useData } from './common';
import { Columns, HBars, Legend, LineChart, ShareBar, StackedColumns } from './charts';
import type { Series } from './charts';
import type { Agg } from '../lib/kpi';
import { stripBrand } from '../lib/env';

const PSERIES: Series[] = PLATFORMS.map((p) => ({ key: p, label: p, color: PLATFORM_COLOR[p] }));
const TIER_COLOR: Record<string, string> = {
  completed: 'var(--t-completed)',
  delivered: 'var(--t-delivered)',
  shipping: 'var(--t-shipping)',
  toShip: 'var(--t-toship)',
  cancelled: 'var(--t-cancelled)',
  unpaid: 'var(--t-unpaid)',
  unknown: 'var(--t-unknown)',
};

type TotalBasis = 'after' | 'before';

/** Total Net Sales semua platform per bulan (pesanan Completed), sebelum atau setelah refund. */
function MonthlyTotalCard({ months, byM, lastMonth }: { months: string[]; byM: Map<string, Agg>; lastMonth?: string }) {
  const [basis, setBasis] = useState<TotalBasis>('after');
  const value = (a?: Agg) => (a ? (basis === 'after' ? netAfter(a) : a.ha) : 0);
  const rows = months.map((m, i) => {
    const a = byM.get(m);
    const cur = value(a);
    const prev = i > 0 ? value(byM.get(months[i - 1])) : 0;
    return { m, a, cur, delta: i > 0 && prev > 0 ? (cur - prev) / prev : null };
  });
  const sum = rows.reduce((t, r) => t + r.cur, 0);
  const orders = rows.reduce((t, r) => t + (r.a?.orders ?? 0), 0);
  const withSales = rows.filter((r) => r.cur > 0);
  const avg = withSales.length ? sum / withSales.length : 0;
  const best = withSales.length ? withSales.reduce((b, r) => (r.cur > b.cur ? r : b)) : null;

  return (
    <Card
      title="Total penjualan semua platform per bulan"
      note="Gabungan TikTok Shop, Shopee, dan Website. Pesanan Completed, tanggal pesanan dibuat."
      right={
        <Segmented<TotalBasis>
          label="Basis Net Sales"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'after', label: 'Setelah refund' },
            { value: 'before', label: 'Sebelum refund' },
          ]}
        />
      }
    >
      <div className="tiles mini">
        <Tile label={`Total Net Sales ${basis === 'after' ? 'setelah' : 'sebelum'} refund`} value={rpC(sum)} sub={`${fmtInt(orders)} pesanan Completed`} />
        <Tile label="Rata-rata per bulan" value={rpC(avg)} sub={`${withSales.length} bulan berpenjualan`} />
        <Tile label="Bulan tertinggi" value={best ? rpC(best.cur) : '–'} sub={best ? monthLabel(best.m) : 'Belum ada data'} />
      </div>
      <Columns
        ariaLabel="Total Net Sales semua platform per bulan"
        color="var(--accent)"
        fmt={rp}
        fmtAxis={rpC}
        height={230}
        data={rows.map((r) => ({ label: monthShort(r.m), title: monthLabel(r.m), value: r.cur }))}
      />
      {lastMonth && (
        <p className="note">
          {monthLabel(lastMonth)} masih berjalan: pesanan yang belum Selesai belum masuk angka ini, jadi perubahan terhadap bulan sebelumnya belum sebanding.
        </p>
      )}
      <DataTable
        caption="Total penjualan semua platform per bulan"
        rows={[...rows].reverse()}
        rowKey={(r) => r.m}
        pageSize={24}
        cols={[
          { key: 'm', label: 'Bulan', render: (r) => monthLabel(r.m) },
          { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.a?.orders ?? 0) },
          { key: 'b', label: 'Net Sales sebelum refund', align: 'right', render: (r) => rpC(r.a?.ha ?? 0) },
          { key: 'f', label: 'Refund', align: 'right', render: (r) => rpC(r.a?.rf ?? 0) },
          { key: 'a', label: 'Net Sales setelah refund', align: 'right', render: (r) => <strong>{rpC(r.a ? netAfter(r.a) : 0)}</strong> },
          { key: 'd', label: 'vs bulan lalu', align: 'right', render: (r) => (r.delta === null ? <span className="muted">–</span> : <span className={r.delta < 0 ? 'neg' : 'pos'}>{signedPct(r.delta)}</span>) },
          { key: 'v', label: 'Rata-rata per pesanan', align: 'right', render: (r) => (r.a?.orders ? rpC(aov(r.a)) : '–') },
        ]}
      />
    </Card>
  );
}

type MonthView = 'facet' | 'group' | 'stack' | 'share';

/** Net Sales per bulan per platform, dengan beberapa tata letak supaya platform kecil tetap terbaca. */
function MonthlyPlatformCard({ months, byMP, lastMonth }: { months: string[]; byMP: Map<string, Agg>; lastMonth?: string }) {
  const [view, setView] = useState<MonthView>('facet');
  const val = (m: string, p: Platform) => (byMP.get(`${m}|${p}`) ? netAfter(byMP.get(`${m}|${p}`)!) : 0);
  const totals = useMemo(() => Object.fromEntries(PLATFORMS.map((p) => [p, months.reduce((a, m) => a + val(m, p), 0)])) as Record<Platform, number>, [months, byMP]);
  const grand = PLATFORMS.reduce((a, p) => a + totals[p], 0);
  const negatives = months.flatMap((m) => PLATFORMS.map((p) => ({ m, p, v: val(m, p) })).filter((x) => x.v < 0));
  const shown = PLATFORMS.filter((p) => totals[p] > 0);
  const data = months.map((m) => ({ label: monthShort(m), title: monthLabel(m), values: Object.fromEntries(PLATFORMS.map((p) => [p, val(m, p)])) }));
  const rows = [...months.map((m) => ({ key: m, label: monthLabel(m), v: Object.fromEntries(PLATFORMS.map((p) => [p, val(m, p)])) as Record<Platform, number> })), { key: 'total', label: 'Total', v: totals }];
  const sum = (v: Record<Platform, number>) => PLATFORMS.reduce((a, p) => a + v[p], 0);

  return (
    <Card
      title="Net Sales per bulan"
      note="Setelah refund, pesanan Completed, per platform."
      right={
        <Segmented<MonthView>
          label="Tampilan grafik"
          value={view}
          onChange={setView}
          options={[
            { value: 'facet', label: 'Per platform' },
            { value: 'group', label: 'Berdampingan' },
            { value: 'stack', label: 'Bertumpuk' },
            { value: 'share', label: 'Porsi %' },
          ]}
        />
      }
    >
      {negatives.length > 0 && (
        <div className="alert crit" role="alert">
          <strong>Net Sales negatif</strong> pada {negatives.slice(0, 6).map((n) => `${n.p} ${monthLabel(n.m)} (${rp(n.v)})`).join(', ')}
          {negatives.length > 6 ? `, dan ${negatives.length - 6} lainnya` : ''}. Artinya diskon seller lebih besar dari harga di file sumber, biasanya karena angka di file rusak. Bar negatif tidak digambar; periksa file di menu <a href="#data">Data</a>.
        </div>
      )}
      {view === 'facet' ? (
        <div className="facets">
          {shown.map((p) => (
            <div key={p} className="facet">
              <div className="facet-head">
                <span className="plat">
                  <i style={{ background: PLATFORM_COLOR[p] }} />
                  <strong>{p}</strong>
                </span>
                <span>
                  {rpC(totals[p])} <span className="muted">· {pct(grand ? totals[p] / grand : 0, 1)} dari total</span>
                </span>
              </div>
              <Columns
                ariaLabel={`Net Sales per bulan ${p}`}
                color={PLATFORM_COLOR[p]}
                fmt={rp}
                fmtAxis={rpC}
                height={150}
                highlightMax={false}
                data={months.map((m) => ({ label: monthShort(m), title: monthLabel(m), value: val(m, p) }))}
              />
            </div>
          ))}
          <p className="note">Sumbu tiap platform berbeda supaya tren platform kecil terlihat. Untuk membandingkan besarannya, pakai tampilan Berdampingan atau lihat tabel di bawah.</p>
        </div>
      ) : (
        <>
          <Legend series={PSERIES} />
          <StackedColumns ariaLabel="Net Sales per bulan per platform" series={PSERIES} fmt={rp} fmtAxis={rpC} mode={view === 'group' ? 'group' : view === 'share' ? 'share' : 'stack'} data={data} />
        </>
      )}
      {lastMonth && (
        <p className="note">
          {monthLabel(lastMonth)} masih berjalan: pesanan yang belum Selesai belum masuk angka ini (lihat kartu Belum berstatus Selesai di atas).
        </p>
      )}
      <details className="month-table" open>
        <summary>Angka per bulan</summary>
        <DataTable
          caption="Net Sales per bulan per platform"
          rows={rows}
          rowKey={(r) => r.key}
          pageSize={24}
          cols={[
            { key: 'm', label: 'Bulan', render: (r) => (r.key === 'total' ? <strong>{r.label}</strong> : r.label) },
            ...PLATFORMS.filter((p) => totals[p] > 0).map((p) => ({
              key: p,
              label: p,
              align: 'right' as const,
              render: (r: (typeof rows)[number]) => (
                <>
                  {rpC(r.v[p])} <span className="muted">({pct(sum(r.v) ? r.v[p] / sum(r.v) : 0, 1)})</span>
                </>
              ),
            })),
            { key: 't', label: 'Total', align: 'right', render: (r) => <strong>{rpC(sum(r.v))}</strong> },
          ]}
        />
      </details>
    </Card>
  );
}

export function Ringkasan() {
  const { items, filter, files, own, go } = useData();
  const done = useMemo(() => completed(items), [items]);
  const tot = useMemo(() => totalAgg(done), [done]);
  const orders = useMemo(() => new Set(items.map((i) => i.o)).size, [items]);
  const cancelled = useMemo(() => new Set(items.filter((i) => i.t === 'cancelled').map((i) => i.o)).size, [items]);
  const waiting = useMemo(() => totalAgg(items.filter((i) => i.t === 'delivered' || i.t === 'shipping' || i.t === 'toShip')), [items]);
  const months = useMemo(() => {
    const ms = monthsOf(items);
    return ms.length ? monthRange(ms[0], ms[ms.length - 1]) : [];
  }, [items]);
  const byMP = useMemo(() => groupAgg(done, (i) => `${i.m}|${i.p}`), [done]);
  const byM = useMemo(() => groupAgg(done, (i) => i.m), [done]);
  const tiers = useMemo(() => {
    const g = groupAgg(items, (i) => i.t);
    return TIER_ORDER.filter((t) => g.has(t)).map((t) => ({ label: TIER_LABEL[t], value: g.get(t)!.orders, color: TIER_COLOR[t] }));
  }, [items]);
  const top = useMemo(() => productTable(done, 'model').slice(0, 6), [done]);
  const insights = useMemo(() => buildInsights(items, own).slice(0, 3), [items, own]);
  const perPlatform = useMemo(() => groupAgg(done, (i) => i.p), [done]);

  if (!files.length) return (
    <>
      <PageHead title="Ringkasan Eksekutif" lead="Angka utama penjualan, tren bulanan, dan hal yang perlu diperhatikan." />
      <NeedData />
    </>
  );

  const lastMonth = months[months.length - 1];
  return (
    <>
      <PageHead
        title="Ringkasan Eksekutif"
        lead="Angka utama penjualan, tren bulanan, dan hal yang perlu diperhatikan."
        basis={`Completed = status Selesai · tanggal pesanan dibuat · data sampai ${dateLong(lastDate(items))}`}
      />
      <div className="tiles">
        <Tile lead label="Net Sales setelah refund" value={rpC(netAfter(tot))} sub={`${rp(netAfter(tot))} dari ${fmtInt(tot.orders)} pesanan Completed`} />
        <Tile label="Net Sales sebelum refund" value={rpC(tot.ha)} sub="Harga Akhir = (harga awal − diskon seller) × jumlah" />
        <Tile label="Rata-rata nilai pesanan" value={rpC(aov(tot))} sub="Net Sales setelah refund ÷ pesanan" />
        <Tile label="Unit terjual" value={fmtInt(tot.qty)} sub={`${fmtInt(tot.rq)} unit diretur`} />
        <Tile label="Refund" value={rpC(tot.rf)} sub={`${pct(tot.ha ? tot.rf / tot.ha : 0)} dari Net Sales sebelum refund`} />
        <Tile
          label="Pesanan batal"
          value={pct(orders ? cancelled / orders : 0)}
          sub={`${fmtInt(cancelled)} dari ${fmtInt(orders)} pesanan`}
          tone={orders && cancelled / orders >= 0.3 ? 'warn' : undefined}
        />
        <Tile label="Belum berstatus Selesai" value={rpC(waiting.ha)} sub={`${fmtInt(waiting.orders)} pesanan sudah dibayar, belum Completed`} />
      </div>

      <MonthlyTotalCard months={months} byM={byM} lastMonth={lastMonth} />

      <MonthlyPlatformCard months={months} byMP={byMP} lastMonth={lastMonth} />

      <div className="grid two">
        <Card title="Platform" note="Net Sales setelah refund, pesanan Completed.">
          <DataTable
            caption="Ringkasan per platform"
            rows={PLATFORMS.filter((p) => perPlatform.has(p)).map((p) => ({ p, a: perPlatform.get(p)! }))}
            rowKey={(r) => r.p}
            pageSize={5}
            cols={[
              { key: 'p', label: 'Platform', render: (r) => <span className="plat"><i style={{ background: PLATFORM_COLOR[r.p] }} />{r.p}</span> },
              { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.a.orders) },
              { key: 'n', label: 'Net Sales', align: 'right', render: (r) => rpC(netAfter(r.a)) },
              { key: 's', label: 'Porsi', align: 'right', render: (r) => pct(tot.ha ? netAfter(r.a) / netAfter(tot) : 0, 0) },
            ]}
          />
        </Card>
        <Card title="Status pesanan" note="Jumlah pesanan menurut status standar lintas platform.">
          <ShareBar parts={tiers} fmt={fmtInt} unit="pesanan" />
        </Card>
      </div>

      <Card title="Produk teratas" note="Model produk menurut Net Sales setelah refund.">
        <HBars items={top.map((r) => ({ label: stripBrand(r.name), value: r.net, sub: `${fmtInt(r.qty)} unit` }))} fmt={rpC} />
      </Card>

      <Card
        title="Perlu diperhatikan"
        note="Rekomendasi berbasis aturan, dihitung dari data yang sedang dipilih."
        right={<button className="btn ghost" onClick={() => go('rekomendasi')}>Lihat semua</button>}
      >
        {insights.length ? (
          <ul className="insight-list">
            {insights.map((i) => (
              <li key={i.id}>
                <Pill tone={i.level === 'penting' ? 'crit' : i.level === 'perhatian' ? 'warn' : 'info'}>{i.level}</Pill>
                <div>
                  <strong>{i.title}</strong>
                  <p>{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tidak ada temuan yang melewati ambang aturan.</p>
        )}
      </Card>
    </>
  );
}

/* ================================================================== */

type Basis = 'completed' | 'active';
type Gran = 'day' | 'week' | 'month';
type Measure = 'net' | 'orders';

export function Penjualan() {
  const { items, files } = useData();
  const [basis, setBasis] = useState<Basis>('completed');
  const [gran, setGran] = useState<Gran>('week');
  const [measure, setMeasure] = useState<Measure>('net');

  const base = useMemo(() => items.filter(basis === 'completed' ? (i: Item) => i.t === 'completed' : isActive), [items, basis]);
  const keyOf = (i: Item) => (gran === 'day' ? i.d : gran === 'week' ? weekStart(i.d) : i.m + '-01');
  const grouped = useMemo(() => groupAgg(base, (i) => `${keyOf(i)}|${i.p}`), [base, gran]);
  const periods = useMemo(() => [...new Set([...grouped.keys()].map((k) => k.split('|')[0]))].sort(), [grouped]);
  const val = (a: { orders: number; ha: number; rf: number } | undefined) => (a ? (measure === 'net' ? a.ha - a.rf : a.orders) : 0);
  const plats = PLATFORMS.filter((p) => items.some((i) => i.p === p));

  const lineSeries = plats.map((p) => ({
    key: p,
    label: p,
    color: PLATFORM_COLOR[p],
    points: periods.filter((x) => grouped.has(`${x}|${p}`)).map((x) => ({ x, y: val(grouped.get(`${x}|${p}`)) })),
  }));

  const totals = useMemo(() => {
    const g = groupAgg(base, keyOf);
    return periods.map((x) => ({ x, a: g.get(x)! }));
  }, [base, gran, periods]);

  const rows = useMemo(() => {
    const byX = new Map(totals.map((r) => [r.x, r.a]));
    const prevKey = (x: string) => {
      const [y, m, d] = x.split('-').map(Number);
      if (gran === 'month') return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      return new Date(Date.UTC(y, m - 1, d - (gran === 'week' ? 7 : 1))).toISOString().slice(0, 10);
    };
    return totals
      .map((r) => {
        const prev = byX.get(prevKey(r.x));
        const pv = prev ? val(prev) : 0;
        return { ...r, delta: prev && pv > 0 ? val(r.a) / pv - 1 : NaN };
      })
      .reverse();
  }, [totals, measure, gran]);

  // Pola hari dan jam, memakai data yang sama dengan filter di atas.
  const wd = useMemo(() => {
    const sum = Array(7).fill(0);
    const days: Set<string>[] = Array.from({ length: 7 }, () => new Set());
    for (const i of base) {
      const w = weekday(i.d);
      sum[w] += measure === 'net' ? i.ha - i.rf : 0;
      days[w].add(i.d);
    }
    if (measure === 'orders') {
      const per = Array.from({ length: 7 }, () => new Set<string>());
      for (const i of base) per[weekday(i.d)].add(i.o);
      return WEEKDAYS.map((n, w) => ({ label: n.slice(0, 3), title: n, value: days[w].size ? per[w].size / days[w].size : 0 }));
    }
    return WEEKDAYS.map((n, w) => ({ label: n.slice(0, 3), title: n, value: days[w].size ? sum[w] / days[w].size : 0 }));
  }, [base, measure]);

  const hours = useMemo(() => {
    const sum = Array(24).fill(0);
    const ord: Set<string>[] = Array.from({ length: 24 }, () => new Set());
    for (const i of base) {
      sum[i.h] += i.ha - i.rf;
      ord[i.h].add(i.o);
    }
    return sum.map((v, h) => ({ label: String(h).padStart(2, '0'), title: `Jam ${String(h).padStart(2, '0')}.00`, value: measure === 'net' ? v : ord[h].size }));
  }, [base, measure]);

  if (!files.length) return (
    <>
      <PageHead title="Kinerja Penjualan" lead="Tren penjualan harian, mingguan, dan bulanan." />
      <NeedData />
    </>
  );

  const fmt = measure === 'net' ? rp : fmtInt;
  const fmtAxis = measure === 'net' ? rpC : fmtInt;
  const xLabel = (x: string) => (gran === 'month' ? `${monthShort(x)} ${x.slice(2, 4)}` : dateLabel(x));
  const xTitle = (x: string) => (gran === 'month' ? monthLabel(x) : gran === 'week' ? `Minggu ${dateLong(x)}` : dateLong(x));

  return (
    <>
      <PageHead
        title="Kinerja Penjualan"
        lead="Tren penjualan dan pola waktu. Basis Completed cocok untuk laporan final; basis pesanan aktif menunjukkan hari-hari terbaru lebih awal."
        basis={basis === 'completed' ? 'Basis: Completed (status Selesai)' : 'Basis: semua pesanan aktif (tidak batal, termasuk yang belum Selesai)'}
      />
      <div className="controls">
        <Segmented<Basis> label="Basis pesanan" value={basis} onChange={setBasis} options={[{ value: 'completed', label: 'Completed' }, { value: 'active', label: 'Semua pesanan aktif' }]} />
        <Segmented<Gran> label="Rentang waktu" value={gran} onChange={setGran} options={[{ value: 'day', label: 'Harian' }, { value: 'week', label: 'Mingguan' }, { value: 'month', label: 'Bulanan' }]} />
        <Segmented<Measure> label="Ukuran" value={measure} onChange={setMeasure} options={[{ value: 'net', label: 'Net Sales' }, { value: 'orders', label: 'Jumlah pesanan' }]} />
      </div>

      <Card title={measure === 'net' ? 'Net Sales setelah refund' : 'Jumlah pesanan'} note={basis === 'completed' ? 'Garis per platform. Pesanan terbaru belum berstatus Selesai, jadi periode terakhir tampak turun; pilih "Semua pesanan aktif" untuk melihat tren terbaru.' : 'Garis per platform, semua pesanan yang tidak batal. Arahkan kursor atau sentuh grafik untuk melihat angka.'} right={<Legend series={PSERIES.filter((s) => plats.includes(s.key as Platform))} />}>
        <LineChart
          ariaLabel="Tren penjualan per platform"
          series={lineSeries}
          fmt={fmt}
          fmtAxis={fmtAxis}
          xLabel={xLabel}
          xTitle={xTitle}
        />
      </Card>

      <div className="grid two">
        <Card title="Rata-rata per hari dalam minggu" note={measure === 'net' ? 'Net Sales per hari kalender.' : 'Pesanan per hari kalender.'}>
          <Columns ariaLabel="Rata-rata per hari dalam minggu" data={wd} color="var(--s1)" fmt={fmt} fmtAxis={fmtAxis} />
        </Card>
        <Card title="Per jam pesanan dibuat" note="Jumlah seluruh periode terpilih, waktu sesuai export.">
          <Columns ariaLabel="Penjualan per jam" data={hours} color="var(--s1)" fmt={fmt} fmtAxis={fmtAxis} />
        </Card>
      </div>

      <Card title="Tabel periode" note={gran === 'day' ? '31 hari terbaru ditampilkan; urutkan atau tampilkan semua.' : 'Perubahan dihitung terhadap periode sebelumnya.'}>
        <DataTable
          caption="Penjualan per periode"
          rows={rows}
          rowKey={(r) => r.x}
          pageSize={gran === 'day' ? 31 : 20}
          cols={[
            { key: 'x', label: 'Periode', render: (r) => xTitle(r.x), sort: (r) => r.x },
            { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.a.orders), sort: (r) => r.a.orders },
            { key: 'h', label: 'Sebelum refund', align: 'right', render: (r) => rp(r.a.ha), sort: (r) => r.a.ha },
            { key: 'r', label: 'Refund', align: 'right', render: (r) => rp(r.a.rf), sort: (r) => r.a.rf },
            { key: 'n', label: 'Net Sales', align: 'right', render: (r) => rp(netAfter(r.a)), sort: (r) => netAfter(r.a) },
            { key: 'v', label: 'Rata-rata pesanan', align: 'right', render: (r) => rp(aov(r.a)), sort: (r) => aov(r.a) },
            { key: 'd', label: 'Perubahan', align: 'right', render: (r) => <span className={r.delta < 0 ? 'neg' : r.delta > 0 ? 'pos' : ''}>{signedPct(r.delta, 0)}</span>, sort: (r) => (Number.isFinite(r.delta) ? r.delta : -9) },
          ]}
        />
      </Card>
    </>
  );
}
export { tierSummary };
