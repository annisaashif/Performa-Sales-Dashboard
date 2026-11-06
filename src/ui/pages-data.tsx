import { IS_DEMO } from '../lib/env';
import { useMemo, useRef, useState } from 'react';
import { PLATFORMS, TIER_LABEL } from '../lib/types';
import type { FileMeta } from '../lib/types';
import { dailyAnomalies, groupAgg, isActive, monthRange, monthsOf, tierSummary } from '../lib/kpi';
import { buildInsights } from '../lib/insights';
import { dateLong, fmtInt, monthLabel, rp, rpC } from '../lib/format';
import { Card, DataTable, Empty, NeedData, PLATFORM_COLOR, PageHead, Pill, useData } from './common';

/* ================================================================== */
/* Rekomendasi                                                         */
/* ================================================================== */

export function Rekomendasi() {
  const { items, files, own } = useData();
  const insights = useMemo(() => buildInsights(items, own), [items, own]);
  const anomalies = useMemo(() => {
    const out: { p: string; date: string; value: number; expected: number; z: number }[] = [];
    for (const p of PLATFORMS) {
      const g = groupAgg(items.filter((i) => i.p === p && isActive(i)), (i) => i.d);
      const daily = [...g.entries()].map(([date, a]) => ({ date, value: a.ha })).sort((a, b) => (a.date < b.date ? -1 : 1));
      for (const a of dailyAnomalies(daily, 10)) out.push({ p, ...a });
    }
    return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  }, [items]);

  if (!files.length)
    return (
      <>
        <PageHead title="Rekomendasi" lead="Temuan otomatis dari data penjualan." />
        <NeedData />
      </>
    );

  const tone = (l: string) => (l === 'penting' ? 'crit' : l === 'perhatian' ? 'warn' : 'info');
  return (
    <>
      <PageHead
        title="Rekomendasi"
        lead="Temuan otomatis berbasis aturan. Setiap aturan hanya memakai angka dari data yang sedang dipilih dan menyebutkan ambangnya; tidak ada AI generatif dan tidak ada angka karangan."
      />
      <Card title="Temuan" note="Urut dari paling penting.">
        {insights.length ? (
          <ul className="insight-list big">
            {insights.map((i) => (
              <li key={i.id}>
                <Pill tone={tone(i.level) as 'crit' | 'warn' | 'info'}>{i.level}</Pill>
                <div>
                  <strong>{i.title}</strong>
                  <p>{i.detail}</p>
                  <p className="action">
                    <b>Langkah:</b> {i.action}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tidak ada temuan yang melewati ambang aturan pada periode ini.</p>
        )}
      </Card>

      <Card title="Hari tidak biasa" note="Harga Akhir pesanan aktif per hari, dibandingkan dengan median harian platform yang sama. Skor robust (median dan MAD) minimal 3,5 ditandai; perlu minimal 14 hari data.">
        <DataTable
          caption="Hari tidak biasa"
          rows={anomalies}
          rowKey={(r) => r.p + r.date}
          pageSize={12}
          empty="Tidak ada hari yang melewati ambang."
          cols={[
            { key: 'd', label: 'Tanggal', render: (r) => dateLong(r.date), sort: (r) => r.date },
            { key: 'p', label: 'Platform', render: (r) => <span className="plat"><i style={{ background: PLATFORM_COLOR[r.p as 'TikTok'] }} />{r.p}</span> },
            { key: 'v', label: 'Harga Akhir hari itu', align: 'right', render: (r) => rp(r.value), sort: (r) => r.value },
            { key: 'e', label: 'Median harian', align: 'right', render: (r) => rp(r.expected), sort: (r) => r.expected },
            { key: 'z', label: 'Arah', render: (r) => <Pill tone={r.z > 0 ? 'good' : 'warn'}>{r.z > 0 ? 'lonjakan' : 'penurunan'}</Pill>, sort: (r) => r.z },
            { key: 'zz', label: 'Skor', align: 'right', render: (r) => r.z.toLocaleString('id-ID', { maximumFractionDigits: 1 }), sort: (r) => Math.abs(r.z) },
          ]}
        />
      </Card>
    </>
  );
}

/* ================================================================== */
/* Data                                                                */
/* ================================================================== */

/** Penghapusan dua langkah: data di database tidak bisa dikembalikan. */
function ConfirmDelete({ label, ariaLabel, onConfirm }: { label: string; ariaLabel: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  return ask ? (
    <span className="confirm" role="group" aria-label="Konfirmasi hapus">
      <button className="btn sm danger" onClick={() => { setAsk(false); onConfirm(); }}>
        Ya, hapus
      </button>
      <button className="btn ghost sm" onClick={() => setAsk(false)}>
        Batal
      </button>
    </span>
  ) : (
    <button className="btn ghost sm" onClick={() => setAsk(true)} aria-label={ariaLabel}>
      {label}
    </button>
  );
}

export function DataPage({
  onFiles,
  busy,
  progress,
  error,
  dbName,
  onRemove,
  onClear,
}: {
  onFiles: (f: File[]) => void;
  busy: boolean;
  progress: string;
  error: string;
  dbName: string;
  onRemove: (name: string) => void;
  onClear: () => void;
}) {
  const { all, files } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const tiers = useMemo(() => tierSummary(all), [all]);
  const flags = useMemo(() => all.filter((i) => i.flag === 'selesai_cancel'), [all]);
  const fixed = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) if (i.flag === 'skala_diperbaiki') m.set(i.src, (m.get(i.src) ?? 0) + 1);
    return [...m.entries()];
  }, [all]);
  const coverage = useMemo(() => {
    return PLATFORMS.map((p) => {
      const ms = monthsOf(all.filter((i) => i.p === p));
      if (!ms.length) return null;
      const range = monthRange(ms[0], ms[ms.length - 1]);
      const missing = range.filter((m) => !ms.includes(m));
      return { p, from: ms[0], to: ms[ms.length - 1], months: ms.length, missing };
    }).filter(Boolean) as { p: (typeof PLATFORMS)[number]; from: string; to: string; months: number; missing: string[] }[];
  }, [all]);
  // File yang sudah ada di database tetapi punya banyak baris Net Sales negatif (diskon > harga): angka harganya kemungkinan rusak.
  const suspect = useMemo(() => {
    const m = new Map<string, { n: number; neg: number }>();
    for (const i of all) {
      const e = m.get(i.src) ?? { n: 0, neg: 0 };
      e.n++;
      if (i.ha < -0.5) e.neg++;
      m.set(i.src, e);
    }
    return [...m.entries()].filter(([, e]) => e.neg / e.n > 0.01).map(([name, e]) => ({ name, ...e }));
  }, [all]);
  const recon = useMemo(() => {
    let bad = 0;
    for (const i of all) if (Math.abs(i.ha - (i.gross - i.sd)) > 0.5) bad++;
    return bad;
  }, [all]);

  return (
    <>
      <PageHead
        title="Data"
        lead={
          IS_DEMO
            ? 'Data demo fiktif sudah dimuat dari 35 file contoh (folder demo-data di repositori). Anda boleh menambah file export sendiri: file dibaca dan dihitung di peramban, tidak diunggah ke mana pun, dan hilang saat halaman dimuat ulang.'
            : `Impor file export per bulan. Beberapa file sekaligus boleh, platform dikenali dari nama kolomnya. File dibaca di peramban, lalu hasilnya disimpan ke database MySQL${dbName ? ` “${dbName}”` : ''} yang bisa dilihat di phpMyAdmin.`
        }
      />
      <div
        className={`drop ${drag ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const fs = [...e.dataTransfer.files];
          if (fs.length) onFiles(fs);
        }}
      >
        <div>
          <h2>{files.length ? 'Tambah atau perbarui file' : 'Impor file penjualan'}</h2>
          <p>
            Seret file ke sini atau pilih dari komputer. Format: .xlsx (TikTok Shop, Shopee) dan .csv (Website). Mengimpor ulang pesanan yang sama
            memperbarui statusnya, bukan menggandakan.
          </p>
          <input
            ref={input}
            id="file-impor"
            type="file"
            multiple
            accept=".xlsx,.csv"
            hidden
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              if (fs.length) onFiles(fs);
              e.target.value = '';
            }}
          />
          <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Memproses…' : 'Pilih file'}
          </button>
          {busy && <span className="progress" role="status">{progress}</span>}
        </div>
      </div>
      {error && (
        <div className="alert crit" role="alert">
          {error}
        </div>
      )}

      {!files.length ? (
        <NeedData />
      ) : (
        <>
          <Card
            title="File yang sudah diimpor"
            right={
              <ConfirmDelete label="Hapus semua data" ariaLabel="Hapus semua data dari database" onConfirm={onClear} />
            }
          >
            <DataTable<FileMeta>
              caption="File yang sudah diimpor"
              rows={files}
              rowKey={(r) => r.name}
              pageSize={30}
              cols={[
                { key: 'n', label: 'File', render: (r) => r.name, sort: (r) => r.name },
                { key: 'p', label: 'Platform', render: (r) => <span className="plat"><i style={{ background: PLATFORM_COLOR[r.platform] }} />{r.platform}</span>, sort: (r) => r.platform },
                { key: 'm', label: 'Bulan', render: (r) => r.months.map(monthLabel).join(', ') },
                { key: 'r', label: 'Baris', align: 'right', render: (r) => fmtInt(r.rows), sort: (r) => r.rows },
                { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.orders), sort: (r) => r.orders },
                { key: 'w', label: 'Catatan', render: (r) => (r.warnings.length ? <span className="warn-text">{r.warnings.join(' ')}</span> : <span className="muted">Tidak ada</span>) },
                { key: 'x', label: '', render: (r) => <ConfirmDelete label="Hapus" ariaLabel={`Hapus ${r.name}`} onConfirm={() => onRemove(r.name)} /> },
              ]}
            />
          </Card>

          <Card title="Cakupan bulan" note="Bulan yang belum diimpor membuat angka platform tidak sebanding.">
            <DataTable
              caption="Cakupan bulan per platform"
              rows={coverage}
              rowKey={(r) => r.p}
              pageSize={5}
              cols={[
                { key: 'p', label: 'Platform', render: (r) => r.p },
                { key: 'f', label: 'Dari', render: (r) => monthLabel(r.from) },
                { key: 't', label: 'Sampai', render: (r) => monthLabel(r.to) },
                { key: 'c', label: 'Bulan', align: 'right', render: (r) => r.months },
                { key: 'm', label: 'Bulan yang terlewat', render: (r) => (r.missing.length ? <span className="warn-text">{r.missing.map(monthLabel).join(', ')}</span> : <span className="muted">Tidak ada</span>) },
              ]}
            />
          </Card>

          <Card title="Pemeriksaan data">
            <ul className="checks">
              <li>
                <Pill tone={recon === 0 ? 'good' : 'crit'}>{recon === 0 ? 'lolos' : 'gagal'}</Pill>
                <span>
                  Harga Akhir = penjualan kotor − diskon seller pada {fmtInt(all.length)} baris
                  {recon ? ` (${fmtInt(recon)} baris tidak cocok)` : ''}.
                </span>
              </li>
              <li>
                <Pill tone={suspect.length ? 'crit' : 'good'}>{suspect.length ? 'gagal' : 'lolos'}</Pill>
                <span>
                  {suspect.length
                    ? `Angka harga kemungkinan rusak (diskon seller melebihi harga, Net Sales negatif) pada: ${suspect.map((x) => `${x.name} (${fmtInt(x.neg)} dari ${fmtInt(x.n)} baris)`).join('; ')}. Hapus file tersebut dan impor ulang file asli dari marketplace.`
                    : 'Tidak ada file dengan Net Sales negatif yang mencurigakan.'}
                </span>
              </li>
              <li>
                <Pill tone="good">lolos</Pill>
                <span>Order ID unik per platform; kolom tingkat pesanan (ongkir, total bayar) tidak dijumlahkan.</span>
              </li>
              <li>
                <Pill tone={flags.length ? 'warn' : 'good'}>{flags.length ? 'perhatian' : 'lolos'}</Pill>
                <span>
                  {flags.length
                    ? `${fmtInt(new Set(flags.map((i) => i.o)).size)} pesanan TikTok berstatus Selesai tetapi bertipe Cancel (${rpC(flags.reduce((s, i) => s + i.ha, 0))}); dikeluarkan dari Completed.`
                    : 'Tidak ada pesanan TikTok berstatus Selesai bertipe Cancel.'}
                </span>
              </li>
              {fixed.length > 0 && (
                <li>
                  <Pill tone="warn">perhatian</Pill>
                  <span>
                    Angka harga pada {fixed.length} file Shopee rusak dan diperbaiki otomatis (Harga Awal × 100, diskon dicocokkan per baris dengan Subtotal Pesanan):{' '}
                    {fixed.map(([name, n]) => `${name} (${fmtInt(n)} baris)`).join('; ')}. Sebaiknya ganti dengan file asli dari Seller Centre bila ada.
                  </span>
                </li>
              )}
              <li>
                <Pill tone="info">catatan</Pill>
                <span>Refund Shopee adalah estimasi (jumlah retur × Harga Barang) karena export Shopee tidak memuat nominal refund.</span>
              </li>
              <li>
                <Pill tone="info">catatan</Pill>
                <span>Diskon Website tercatat per pesanan, jadi dibagi proporsional ke tiap item menurut nilai kotornya.</span>
              </li>
            </ul>
          </Card>

          <Card title="Status per platform" note="Semua pesanan yang diimpor, tanpa filter periode.">
            <DataTable
              caption="Status per platform"
              rows={[...tiers.entries()].flatMap(([p, list]) => list.map((t) => ({ p, ...t })))}
              rowKey={(r) => r.p + r.tier}
              pageSize={30}
              cols={[
                { key: 'p', label: 'Platform', render: (r) => r.p },
                { key: 't', label: 'Status standar', render: (r) => TIER_LABEL[r.tier] },
                { key: 'o', label: 'Pesanan', align: 'right', render: (r) => fmtInt(r.orders) },
                { key: 'h', label: 'Harga Akhir', align: 'right', render: (r) => rp(r.ha) },
              ]}
            />
          </Card>

          <Card title="Definisi KPI">
            <dl className="defs">
              <dt>Completed</dt>
              <dd>Hanya pesanan berstatus Selesai (TikTok: Selesai; Shopee: Selesai; Website: Selesai). Status diterima atau terkirim belum dihitung.</dd>
              <dt>Harga Barang</dt>
              <dd>Harga awal per unit − diskon seller per unit. Diskon platform tidak dikurangkan.</dd>
              <dt>Harga Akhir</dt>
              <dd>Harga Barang × jumlah. Ini Net Sales sebelum refund.</dd>
              <dt>Refund</dt>
              <dd>Jumlah unit diretur × Harga Barang, dikurangkan satu kali.</dd>
              <dt>Net Sales setelah refund</dt>
              <dd>Harga Akhir − refund. Ongkir, asuransi, dan biaya layanan tidak termasuk.</dd>
              <dt>Tanggal</dt>
              <dd>Tanggal pesanan dibuat, bukan tanggal selesai.</dd>
            </dl>
          </Card>
        </>
      )}
    </>
  );
}

export { Empty };
