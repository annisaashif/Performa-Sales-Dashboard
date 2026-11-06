import { useMemo, useState } from 'react';
import { PLATFORMS, TIER_LABEL, TIER_ORDER } from '../lib/types';
import type { Item, Platform } from '../lib/types';
import { aov, classifyCreator, completed, groupAgg, netAfter, productTable, tierSummary, totalAgg } from '../lib/kpi';
import { fmtInt, pct, rp, rpC } from '../lib/format';
import { Card, DataTable, NeedData, PLATFORM_COLOR, PageHead, Pill, Segmented, Tile, useData } from './common';
import { HBars, ShareBar } from './charts';

/* ================================================================== */
/* Channel                                                             */
/* ================================================================== */

export function Channel() {
  const { items, files } = useData();
  const done = useMemo(() => completed(items), [items]);
  const perP = useMemo(() => groupAgg(done, (i) => i.p), [done]);
  const tiers = useMemo(() => tierSummary(items), [items]);
  const ttChan = useMemo(() => groupAgg(done.filter((i) => i.p === 'TikTok' && i.ch), (i) => i.ch), [done]);
  const tot = useMemo(() => totalAgg(done), [done]);

  if (!files.length)
    return (
      <>
        <PageHead title="Analisis Channel" lead="Perbandingan TikTok Shop, Shopee, dan Website." />
        <NeedData />
      </>
    );

  const rows = PLATFORMS.filter((p) => items.some((i) => i.p === p)).map((p) => {
    const a = perP.get(p);
    const all = items.filter((i) => i.p === p);
    const orders = new Set(all.map((i) => i.o)).size;
    const canc = new Set(all.filter((i) => i.t === 'cancelled').map((i) => i.o)).size;
    const wait = totalAgg(all.filter((i) => i.t === 'delivered' || i.t === 'shipping' || i.t === 'toShip'));
    return { p, a: a ?? totalAgg([]), orders, canc, wait };
  });

  return (
    <>
      <PageHead
        title="Analisis Channel"
        lead="Perbandingan TikTok Shop, Shopee, dan Website pada periode yang dipilih."
        basis="Penjualan: Completed (status Selesai) · batal dan proses: semua pesanan"
      />
      <Card title="Komposisi Net Sales" note="Setelah refund, pesanan Completed.">
        <ShareBar
          fmt={rpC}
          parts={rows.map((r) => ({ label: r.p, value: netAfter(r.a), color: PLATFORM_COLOR[r.p] }))}
        />
      </Card>

      <Card title="Perbandingan platform" note="Website hanya tersedia pada bulan yang sudah kamu impor; periksa kolom periode sebelum membandingkan.">
        <DataTable
          caption="Perbandingan platform"
          rows={rows}
          rowKey={(r) => r.p}
          pageSize={5}
          cols={[
            { key: 'p', label: 'Platform', render: (r) => <span className="plat"><i style={{ background: PLATFORM_COLOR[r.p] }} />{r.p}</span> },
            { key: 'o', label: 'Pesanan Completed', align: 'right', render: (r) => fmtInt(r.a.orders), sort: (r) => r.a.orders },
            { key: 'g', label: 'Penjualan kotor', align: 'right', render: (r) => rp(r.a.gross), sort: (r) => r.a.gross },
            { key: 'sd', label: 'Diskon seller', align: 'right', render: (r) => pct(r.a.gross ? r.a.sd / r.a.gross : 0), sort: (r) => (r.a.gross ? r.a.sd / r.a.gross : 0), title: 'Diskon seller ÷ penjualan kotor' },
            { key: 'pd', label: 'Diskon platform', align: 'right', render: (r) => pct(r.a.gross ? r.a.pd / r.a.gross : 0), sort: (r) => (r.a.gross ? r.a.pd / r.a.gross : 0), title: 'Hanya informasi; tidak mengurangi Net Sales' },
            { key: 'h', label: 'Sebelum refund', align: 'right', render: (r) => rp(r.a.ha), sort: (r) => r.a.ha },
            { key: 'rf', label: 'Refund', align: 'right', render: (r) => pct(r.a.ha ? r.a.rf / r.a.ha : 0), sort: (r) => (r.a.ha ? r.a.rf / r.a.ha : 0), title: 'Refund ÷ Net Sales sebelum refund' },
            { key: 'n', label: 'Net Sales', align: 'right', render: (r) => rp(netAfter(r.a)), sort: (r) => netAfter(r.a) },
            { key: 'v', label: 'Rata-rata pesanan', align: 'right', render: (r) => rp(aov(r.a)), sort: (r) => aov(r.a) },
            { key: 'c', label: 'Batal', align: 'right', render: (r) => pct(r.orders ? r.canc / r.orders : 0), sort: (r) => (r.orders ? r.canc / r.orders : 0), title: 'Pesanan batal ÷ semua pesanan' },
            { key: 'w', label: 'Belum Selesai', align: 'right', render: (r) => rpC(r.wait.ha), sort: (r) => r.wait.ha, title: 'Sudah dibayar, belum berstatus Selesai' },
          ]}
        />
      </Card>

      <Card title="Status pesanan per platform" note="Jumlah pesanan (bukan baris SKU) menurut status standar.">
        <DataTable
          caption="Status pesanan per platform"
          rows={[...tiers.entries()].flatMap(([p, list]) => list.map((t) => ({ p, ...t })))}
          rowKey={(r) => r.p + r.tier}
          pageSize={30}
          cols={[
            { key: 'p', label: 'Platform', render: (r) => r.p },
            { key: 't', label: 'Status', render: (r) => TIER_LABEL[r.tier] },
            { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.orders) },
            { key: 'h', label: 'Harga Akhir', align: 'right', render: (r) => rp(r.ha) },
          ]}
        />
      </Card>

      {ttChan.size > 0 && (
        <Card title="Sumber pesanan TikTok" note="Order Channel di export TikTok: dari LIVE, video, atau kartu produk.">
          <HBars
            fmt={rpC}
            items={[...ttChan.entries()]
              .sort((a, b) => netAfter(b[1]) - netAfter(a[1]))
              .map(([k, a]) => ({ label: k, value: netAfter(a), sub: `${fmtInt(a.orders)} pesanan · ${pct(tot.ha ? netAfter(a) / netAfter(tot) : 0, 0)} dari semua platform` }))}
          />
        </Card>
      )}
    </>
  );
}

/* ================================================================== */
/* Produk                                                              */
/* ================================================================== */

export function Produk() {
  const { items, files } = useData();
  const [level, setLevel] = useState<'model' | 'sku'>('model');
  const [q, setQ] = useState('');
  const done = useMemo(() => completed(items), [items]);
  const rows = useMemo(() => productTable(done, level), [done, level]);
  const total = useMemo(() => rows.reduce((s, r) => s + r.net, 0), [rows]);
  const cum = useMemo(() => {
    let acc = 0;
    return new Map(
      rows.map((r) => {
        const before = acc;
        acc += r.net;
        return [r.key, total ? before / total : 0] as const;
      }),
    );
  }, [rows, total]);
  const shown = useMemo(() => {
    const s = q.trim().toUpperCase();
    return s ? rows.filter((r) => r.name.toUpperCase().includes(s) || r.key.includes(s)) : rows;
  }, [rows, q]);
  const cats = useMemo(() => {
    const g = groupAgg(done.filter((i) => i.cat), (i) => i.cat);
    return [...g.entries()].map(([k, a]) => ({ k, a })).sort((x, y) => netAfter(y.a) - netAfter(x.a));
  }, [done]);

  if (!files.length)
    return (
      <>
        <PageHead title="Analisis Produk" lead="Produk terlaris, diskon, dan retur." />
        <NeedData />
      </>
    );

  const abc = (before: number) => (before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C');

  return (
    <>
      <PageHead
        title="Analisis Produk"
        lead={'Produk digabung lintas platform. Mode Model memakai nama produk (versi "READY STOCK" digabung dengan versi pre-order); mode SKU memakai kode SKU yang sama di ketiga platform.'}
        basis="Completed (status Selesai) · Net Sales setelah refund"
      />
      <div className="controls">
        <Segmented
          label="Tingkat produk"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'model', label: 'Model (nama produk)' },
            { value: 'sku', label: 'SKU' },
          ]}
        />
        <label className="search">
          <span className="sr">Cari produk</span>
          <input id="cari-produk" type="search" placeholder="Cari nama atau SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <Card title="10 teratas" note={`Dari ${fmtInt(rows.length)} ${level === 'model' ? 'model' : 'SKU'} dengan penjualan Completed.`}>
        <HBars
          fmt={rpC}
          items={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.net, sub: `${fmtInt(r.qty)} unit` }))}
        />
      </Card>

      <Card title="Semua produk" note="Kelas ABC dari kontribusi kumulatif: A sampai 80% Net Sales, B sampai 95%, C sisanya.">
        <DataTable
          caption="Tabel produk"
          rows={shown}
          rowKey={(r) => r.key}
          pageSize={25}
          initialSort={{ key: 'n', dir: 'desc' }}
          cols={[
            { key: 'name', label: 'Produk', render: (r) => <div className="pname"><span>{r.name}</span>{level === 'model' && r.skus > 1 && <small>{r.skus} SKU</small>}</div>, sort: (r) => r.name },
            { key: 'pl', label: 'Platform', render: (r) => <span className="plats">{r.platforms.map((p) => <i key={p} title={p} style={{ background: PLATFORM_COLOR[p] }} />)}</span> },
            { key: 'n', label: 'Net Sales', align: 'right', render: (r) => rp(r.net), sort: (r) => r.net },
            { key: 'sh', label: 'Porsi', align: 'right', render: (r) => pct(total ? r.net / total : 0), sort: (r) => r.net },
            { key: 'abc', label: 'Kelas', render: (r) => <Pill tone={abc(cum.get(r.key)!) === 'A' ? 'good' : abc(cum.get(r.key)!) === 'B' ? 'info' : undefined}>{abc(cum.get(r.key)!)}</Pill> },
            { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.orders), sort: (r) => r.orders },
            { key: 'q', label: 'Unit', align: 'right', render: (r) => fmtInt(r.qty), sort: (r) => r.qty },
            { key: 'd', label: 'Diskon seller', align: 'right', render: (r) => pct(r.gross ? r.sd / r.gross : 0, 0), sort: (r) => (r.gross ? r.sd / r.gross : 0) },
            { key: 'rt', label: 'Retur', align: 'right', render: (r) => <span className={r.qty >= 30 && r.rq / r.qty >= 0.08 ? 'neg' : ''}>{pct(r.qty ? r.rq / r.qty : 0)}</span>, sort: (r) => (r.qty ? r.rq / r.qty : 0), title: 'Unit diretur ÷ unit terjual' },
          ]}
        />
      </Card>

      {cats.length > 0 && (
        <Card title="Kategori (TikTok)" note="Kategori hanya ada di export TikTok.">
          <HBars fmt={rpC} items={cats.slice(0, 10).map(({ k, a }) => ({ label: k, value: netAfter(a), sub: `${fmtInt(a.qty)} unit` }))} />
        </Card>
      )}
    </>
  );
}

/* ================================================================== */
/* Affiliate                                                           */
/* ================================================================== */

export function Affiliate() {
  const { items, files, own, ownText, setOwnText } = useData();
  const tt = useMemo(() => completed(items).filter((i) => i.p === 'TikTok'), [items]);
  const cls = useMemo(() => groupAgg(tt, (i) => classifyCreator(i.cr, own)), [tt, own]);
  const creators = useMemo(() => {
    const g = groupAgg(
      tt.filter((i) => classifyCreator(i.cr, own) === 'affiliate'),
      (i) => i.cr.trim().toLowerCase(),
    );
    return [...g.entries()].map(([k, a]) => ({ k, a })).sort((x, y) => netAfter(y.a) - netAfter(x.a));
  }, [tt, own]);
  const channels = useMemo(() => groupAgg(tt.filter((i) => i.ch), (i) => i.ch), [tt]);

  if (!files.length)
    return (
      <>
        <PageHead title="Analisis Affiliate" lead="Penjualan TikTok menurut creator." />
        <NeedData />
      </>
    );

  const sum = (k: 'own' | 'affiliate' | 'none') => (cls.get(k) ? netAfter(cls.get(k)!) : 0);
  const total = sum('own') + sum('affiliate') + sum('none');
  const affTotal = sum('affiliate');
  const top10 = creators.slice(0, 10).reduce((s, c) => s + netAfter(c.a), 0);

  return (
    <>
      <PageHead
        title="Analisis Affiliate"
        lead="Penjualan TikTok menurut Creator Handle. Handle akun toko sendiri dipisahkan dari affiliate."
        basis="TikTok · Completed (status Selesai) · Net Sales setelah refund"
      />
      {!tt.length ? (
        <Card>
          <p className="muted">Tidak ada pesanan TikTok Completed pada periode ini.</p>
        </Card>
      ) : (
        <>
          <Card title="Akun toko sendiri" note="Pisahkan dengan koma, tanpa tanda @. Perubahan langsung dihitung ulang dan diingat di peramban ini.">
            <label className="field">
              <span>Handle milik sendiri</span>
              <input id="akun-sendiri" type="text" value={ownText} onChange={(e) => setOwnText(e.target.value)} />
            </label>
          </Card>
          <div className="tiles">
            <Tile lead label="Net Sales dari affiliate" value={rpC(affTotal)} sub={`${pct(total ? affTotal / total : 0, 0)} dari Net Sales TikTok · ${fmtInt(creators.length)} creator`} />
            <Tile label="Akun sendiri" value={rpC(sum('own'))} sub={`${pct(total ? sum('own') / total : 0, 0)} dari Net Sales TikTok`} />
            <Tile label="Tanpa creator" value={rpC(sum('none'))} sub={`${pct(total ? sum('none') / total : 0, 0)} dari Net Sales TikTok`} />
            <Tile label="10 affiliate teratas" value={pct(affTotal ? top10 / affTotal : 0, 0)} sub="dari penjualan affiliate" />
          </div>

          <div className="grid two">
            <Card title="Asal penjualan TikTok">
              <ShareBar
                fmt={rpC}
                parts={[
                  { label: 'Akun sendiri', value: sum('own'), color: 'var(--s1)' },
                  { label: 'Affiliate', value: sum('affiliate'), color: 'var(--s2)' },
                  { label: 'Tanpa creator', value: sum('none'), color: 'var(--t-cancelled)' },
                ]}
              />
            </Card>
            {channels.size > 0 && (
              <Card title="Sumber pesanan" note="LIVE, video, atau kartu produk.">
                <HBars
                  fmt={rpC}
                  items={[...channels.entries()].sort((a, b) => netAfter(b[1]) - netAfter(a[1])).map(([k, a]) => ({ label: k, value: netAfter(a), sub: `${fmtInt(a.orders)} pesanan` }))}
                />
              </Card>
            )}
          </div>

          <Card title="Creator affiliate teratas" note="Urut menurut Net Sales setelah refund.">
            <DataTable
              caption="Creator affiliate"
              rows={creators}
              rowKey={(r) => r.k}
              pageSize={20}
              cols={[
                { key: 'k', label: 'Creator', render: (r) => '@' + r.k, sort: (r) => r.k },
                { key: 'n', label: 'Net Sales', align: 'right', render: (r) => rp(netAfter(r.a)), sort: (r) => netAfter(r.a) },
                { key: 's', label: 'Porsi affiliate', align: 'right', render: (r) => pct(affTotal ? netAfter(r.a) / affTotal : 0), sort: (r) => netAfter(r.a) },
                { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.a.orders), sort: (r) => r.a.orders },
                { key: 'v', label: 'Rata-rata pesanan', align: 'right', render: (r) => rp(aov(r.a)), sort: (r) => aov(r.a) },
                { key: 'rt', label: 'Retur', align: 'right', render: (r) => pct(r.a.qty ? r.a.rq / r.a.qty : 0), sort: (r) => (r.a.qty ? r.a.rq / r.a.qty : 0) },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
export type { Item, Platform };
export { TIER_ORDER };
