import { useMemo, useState } from 'react';
import { forecast, prepare, METHOD_LABEL } from '../lib/forecast';
import type { ForecastRow } from '../lib/forecast';
import { fmtInt, monthLabel, monthShort, pct, rpC, signedPct } from '../lib/format';
import { Card, DataTable, Empty, NeedData, PLATFORM_COLOR, PageHead, Pill, Segmented, Tile, useData } from './common';
import { HBars, Legend, StackedColumns } from './charts';
import type { Series } from './charts';


const unit = (n: number) => `${fmtInt(n)} unit`;
const unitC = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb` : String(Math.round(n)));
const SERIES: Series[] = [
  { key: 'aktual', label: 'Aktual (pesanan aktif)', color: 'var(--ink-3)' },
  { key: 'prakiraan', label: 'Prakiraan', color: 'var(--fc)' },
];
const TREND_LABEL = { naik: 'Naik', stabil: 'Stabil', turun: 'Turun', baru: 'Baru / riwayat pendek' } as const;
const TREND_TONE = { naik: 'good', stabil: 'info', turun: 'warn', baru: 'info' } as const;
const CONF_TONE = { tinggi: 'good', sedang: 'info', rendah: 'warn' } as const;

export function Forecast() {
  const { all, files, filter, go } = useData();
  const [level, setLevel] = useState<'model' | 'sku'>('model');
  const [q, setQ] = useState('');
  const [mult, setMult] = useState(1);

  // Seluruh riwayat dipakai (filter periode tidak berlaku); filter platform tetap berlaku.
  const items = useMemo(() => all.filter((i) => filter.platforms.includes(i.p)), [all, filter.platforms]);
  const prepared = useMemo(() => prepare(items, level), [items, level]);
  const res = useMemo(() => (prepared ? forecast(prepared) : null), [prepared]);

  const shown = useMemo(() => {
    if (!res) return [];
    const s = q.trim().toUpperCase();
    return s ? res.rows.filter((r) => r.name.toUpperCase().includes(s) || r.key.includes(s)) : res.rows;
  }, [res, q]);

  if (!files.length)
    return (
      <>
        <PageHead title="Forecast Penjualan" lead="Perkiraan produk yang akan laku bulan depan." />
        <NeedData />
      </>
    );
  if (!prepared || !res)
    return (
      <>
        <PageHead title="Forecast Penjualan" lead="Perkiraan produk yang akan laku bulan depan." />
        <Empty title="Data belum cukup untuk prakiraan" action={<button className="btn primary" onClick={() => go('data')}>Buka halaman Data</button>}>
          Prakiraan membutuhkan data pesanan pada bulan terakhir. Impor file bulan terbaru lalu kembali ke halaman ini.
        </Empty>
      </>
    );

  const target = monthLabel(prepared.target);
  const m = Math.max(0.1, mult || 1);
  const top = res.rows.slice(0, 10);
  const classA = res.rows.filter((r) => r.cls === 'A');
  const rangeText = (r: ForecastRow) => (r.low !== null && r.high !== null ? `${fmtInt(r.low * m)}–${fmtInt(r.high * m)} unit` : 'rentang belum tersedia');
  const monthsCount = prepared.months.length;

  const history = prepared.months.map((mo, i) => ({
    label: monthShort(mo),
    title: monthLabel(mo) + (prepared.partial && i === monthsCount - 1 ? ' (diproyeksikan ke sebulan penuh)' : ''),
    values: { aktual: prepared.series.reduce((s, x) => s + x.units[i], 0), prakiraan: 0 },
  }));
  history.push({ label: monthShort(prepared.target), title: `${target} (prakiraan)`, values: { aktual: 0, prakiraan: res.totalUnits * m } });

  const rise = res.rows.filter((r) => r.cls === 'A' && r.trend === 'naik').slice(0, 5);
  const fall = res.rows.filter((r) => (r.cls === 'A' || r.cls === 'B') && r.trend === 'turun').slice(0, 5);

  return (
    <>
      <PageHead
        title="Forecast Penjualan Produk"
        lead={`Perkiraan produk yang paling laku pada ${target}, dihitung dari riwayat pesanan yang sudah diimpor.`}
        basis="Pesanan aktif (tidak batal, sudah dibayar) · satuan unit · seluruh riwayat dipakai, filter periode tidak berlaku"
      />

      {prepared.excluded.length > 0 && (
        <div className="alert warn" role="status">
          <strong>Tidak ikut diprakirakan:</strong>{' '}
          {prepared.excluded
            .map((e) => `${e.p} (data terakhir ${monthLabel(e.last)}; tidak ada data ${e.missing.map(monthLabel).join(', ')})`)
            .join('; ')}
          . Platform ini harus punya data pada bulan terakhir dan dua bulan sebelumnya agar tidak menyesatkan prakiraan; impor bulan yang kurang agar ikut dihitung.
        </div>
      )}
      {prepared.gaps.length > 0 && (
        <div className="alert warn" role="status">
          <strong>Ada bulan tanpa data:</strong> {prepared.gaps.map((g) => `${g.p} ${g.months.map(monthLabel).join(', ')}`).join('; ')}. Bulan kosong terhitung nol sehingga prakiraan bisa terlalu rendah.
        </div>
      )}
      {prepared.partial && (
        <div className="alert info" role="status">
          {monthLabel(prepared.partial.month)} belum penuh: {prepared.partial.notes.join('; ')}. Bulan itu diproyeksikan ke sebulan penuh dan tidak dipakai untuk uji akurasi.
        </div>
      )}
      <div className="alert info" role="status">
        {monthsCount < 13
          ? `Riwayat baru ${monthsCount} bulan, jadi pola musim dan kampanye (misalnya 11.11, 12.12, gajian) belum bisa dibaca.`
          : 'Metode ini belum membaca pola musim dan kampanye (misalnya 11.11, 12.12, gajian), walaupun riwayatnya sudah lebih dari setahun.'}{' '}
        Pakai kolom pengali kampanye di bawah bila tim punya perkiraan sendiri.
      </div>

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
          <input id="cari-forecast" type="search" placeholder="Cari nama atau SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="mult">
          <span>Pengali kampanye (asumsi)</span>
          <input id="pengali" type="number" min={0.5} max={3} step={0.05} value={mult} onChange={(e) => setMult(parseFloat(e.target.value))} />
        </label>
      </div>

      <div className="tiles">
        <Tile lead label={`Perkiraan unit ${target}`} value={fmtInt(res.totalUnits * m)} sub={res.medianTotalErr !== null ? `Pada uji ke masa lalu, total meleset sekitar ${pct(res.medianTotalErr, 0)} (median)` : 'Uji akurasi belum tersedia'} />
        <Tile label="Perkiraan Harga Akhir" value={rpC(res.totalValue * m)} sub="Unit × harga rata-rata 3 bulan terakhir, sebelum refund" />
        <Tile label="Produk diprakirakan" value={fmtInt(res.rows.length)} sub={`${fmtInt(classA.length)} produk kelas A menyumbang 70% unit`} />
        <Tile
          label="Ketepatan 10 teratas"
          value={res.avgHit10 !== null ? `${res.avgHit10.toLocaleString('id-ID', { maximumFractionDigits: 1 })} dari 10` : '–'}
          sub="Rata-rata pada uji ke masa lalu: berapa dari 10 produk prediksi yang memang masuk 10 terlaris"
        />
      </div>
      {m !== 1 && <p className="note">Semua angka prakiraan sudah dikali pengali kampanye {m.toLocaleString('id-ID')} (asumsi manual, bukan hasil data).</p>}

      <Card title={`10 produk diprediksi paling laku di ${target}`} note="Urut menurut prakiraan unit. Rentang menunjukkan 60% kejadian pada uji ke masa lalu; pakai batas atas sebagai acuan stok aman.">
        <HBars items={top.map((r) => ({ label: r.name, value: r.f * m, sub: `${rangeText(r)} · ${TREND_LABEL[r.trend]}` }))} fmt={unit} color="var(--fc)" />
      </Card>

      <div className="grid two">
        <Card title="Siapkan stok lebih" note="Produk kelas A dengan tren naik (3 bulan terakhir dibanding 3 bulan sebelumnya).">
          {rise.length ? (
            <ul className="insight-list">
              {rise.map((r) => (
                <li key={r.key}>
                  <Pill tone="good">naik {r.trendPct !== null ? signedPct(r.trendPct, 0) : ''}</Pill>
                  <div>
                    <strong>{r.name}</strong>
                    <p>
                      Prakiraan {fmtInt(r.f * m)} unit ({rangeText(r)}); bulan lalu {fmtInt(r.lastUnits)} unit.
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Tidak ada produk kelas A dengan tren naik yang melewati ambang 15%.</p>
          )}
        </Card>
        <Card title="Pantau penurunan" note="Produk kelas A atau B dengan tren turun lebih dari 15%.">
          {fall.length ? (
            <ul className="insight-list">
              {fall.map((r) => (
                <li key={r.key}>
                  <Pill tone="warn">turun {r.trendPct !== null ? signedPct(r.trendPct, 0) : ''}</Pill>
                  <div>
                    <strong>{r.name}</strong>
                    <p>
                      Prakiraan {fmtInt(r.f * m)} unit ({rangeText(r)}); rata-rata 3 bulan terakhir {fmtInt(r.avg3)} unit.
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Tidak ada produk kelas A atau B dengan tren turun yang melewati ambang 15%.</p>
          )}
        </Card>
      </div>

      <Card title="Riwayat dan prakiraan total unit" note="Total unit pesanan aktif semua produk per bulan, lalu prakiraan bulan berikutnya." right={<Legend series={SERIES} />}>
        <StackedColumns ariaLabel="Riwayat dan prakiraan total unit" series={SERIES} fmt={unit} fmtAxis={unitC} data={history} />
      </Card>

      <Card
        title="Semua produk"
        note="Kelas ABC dari kontribusi kumulatif prakiraan unit: A sampai 70%, B sampai 90%, C sisanya. Produk yang tidak terjual 3 bulan terakhir tidak diprakirakan."
      >
        <DataTable<ForecastRow & { rank: number }>
          caption="Prakiraan per produk"
          rows={shown.map((r) => ({ ...r, rank: res.rows.indexOf(r) + 1 }))}
          rowKey={(r) => r.key}
          pageSize={25}
          initialSort={{ key: 'rank', dir: 'asc' }}
          cols={[
            { key: 'rank', label: '#', align: 'right', render: (r) => r.rank, sort: (r) => r.rank },
            {
              key: 'name',
              label: 'Produk',
              render: (r) => (
                <div className="pname">
                  <span>{r.name}</span>
                  <span className="plats">
                    {r.platforms.map((p) => (
                      <i key={p} title={p} style={{ background: PLATFORM_COLOR[p] }} />
                    ))}
                  </span>
                </div>
              ),
              sort: (r) => r.name,
            },
            { key: 'cls', label: 'Kelas', render: (r) => <Pill tone={r.cls === 'A' ? 'good' : r.cls === 'B' ? 'info' : undefined}>{r.cls}</Pill>, sort: (r) => r.cls },
            { key: 'f', label: `Prakiraan ${monthShort(prepared.target)}`, align: 'right', render: (r) => <strong>{fmtInt(r.f * m)}</strong>, sort: (r) => r.f },
            { key: 'rg', label: 'Rentang unit', align: 'right', render: (r) => (r.low !== null && r.high !== null ? `${fmtInt(r.low * m)}–${fmtInt(r.high * m)}` : '–'), sort: (r) => r.high ?? 0, title: 'Batas bawah (persentil 20) sampai batas atas (persentil 80) dari uji ke masa lalu' },
            { key: 'v', label: 'Perkiraan Harga Akhir', align: 'right', render: (r) => rpC(r.value * m), sort: (r) => r.value },
            { key: 't', label: 'Tren', render: (r) => <Pill tone={TREND_TONE[r.trend]}>{r.trend === 'baru' ? 'baru' : `${TREND_LABEL[r.trend].toLowerCase()}${r.trendPct !== null ? ' ' + signedPct(r.trendPct, 0) : ''}`}</Pill>, sort: (r) => r.trendPct ?? -9 },
            { key: 'c', label: 'Keyakinan', render: (r) => <Pill tone={CONF_TONE[r.confidence]}>{r.confidence}</Pill>, sort: (r) => ({ tinggi: 3, sedang: 2, rendah: 1 })[r.confidence] },
            { key: 'l', label: 'Bulan lalu', align: 'right', render: (r) => fmtInt(r.lastUnits), sort: (r) => r.lastUnits },
            { key: 'a', label: 'Rata-rata 3 bln', align: 'right', render: (r) => fmtInt(r.avg3), sort: (r) => r.avg3 },
            { key: 'n', label: 'Bulan terjual', align: 'right', render: (r) => r.months, sort: (r) => r.months },
          ]}
        />
      </Card>

      <Card
        title="Seberapa akurat prakiraan ini?"
        note="Tiap bulan di masa lalu diprediksi hanya dari data sebelum bulan itu, lalu dibandingkan dengan kenyataan. Metode dengan kesalahan terkecil dipakai."
      >
        {res.backtest.length ? (
          <>
            <p className="note">
              Metode terpilih: <strong>{METHOD_LABEL[res.method]}</strong>
              {res.selectedByBacktest ? ' (dipilih otomatis karena paling akurat pada uji di bawah).' : ' (riwayat belum cukup untuk memilih; memakai bawaan).'}
            </p>
            <DataTable
              caption="Hasil uji ke masa lalu"
              rows={res.backtest}
              rowKey={(r) => r.month}
              pageSize={24}
              cols={[
                { key: 'm', label: 'Bulan yang diuji', render: (r) => monthLabel(r.month) },
                { key: 'p', label: 'Produk diuji', align: 'right', render: (r) => fmtInt(r.products) },
                { key: 'a', label: 'Unit sebenarnya', align: 'right', render: (r) => fmtInt(r.actual) },
                { key: 'f', label: 'Unit diprediksi', align: 'right', render: (r) => fmtInt(r.predicted) },
                { key: 'e', label: 'Selisih total', align: 'right', render: (r) => signedPct(r.totalErr, 0) },
                { key: 'w', label: 'Kesalahan per produk', align: 'right', render: (r) => pct(r.wape, 0), title: 'Jumlah selisih mutlak tiap produk dibagi total unit sebenarnya' },
                { key: 'h', label: '10 teratas tepat', align: 'right', render: (r) => `${r.hit10} dari 10` },
              ]}
            />
            <details className="month-table">
              <summary>Perbandingan metode</summary>
              <DataTable
                caption="Perbandingan metode prakiraan"
                rows={res.methodScores}
                rowKey={(r) => r.method}
                pageSize={10}
                cols={[
                  { key: 'm', label: 'Metode', render: (r) => (r.method === res.method ? <strong>{METHOD_LABEL[r.method]} (dipakai)</strong> : METHOD_LABEL[r.method]) },
                  { key: 'w', label: 'Kesalahan per produk', align: 'right', render: (r) => (r.wape === null ? '–' : pct(r.wape, 1)) },
                  { key: 'h', label: '10 teratas tepat', align: 'right', render: (r) => (r.hit10 === null ? '–' : `${r.hit10.toLocaleString('id-ID', { maximumFractionDigits: 1 })} dari 10`) },
                ]}
              />
            </details>
          </>
        ) : (
          <p className="muted">Riwayat belum cukup untuk menguji akurasi (dibutuhkan minimal 4 bulan lengkap). Prakiraan di atas memakai rata-rata berbobot 3 bulan dan belum bisa dinilai ketepatannya.</p>
        )}
      </Card>

      <details className="month-table">
        <summary>Cara kerja dan batasan</summary>
        <ul className="notes">
          <li>Dasar hitung adalah unit pada pesanan aktif (tidak batal, sudah dibayar), bukan hanya Selesai, karena pesanan beberapa minggu terakhir belum sempat berstatus Selesai.</li>
          <li>Produk digabung lintas platform menurut tingkat yang dipilih (Model atau SKU). Hanya platform yang punya data sampai bulan terakhir yang diprakirakan.</li>
          <li>Bulan yang belum penuh diproyeksikan ke sebulan penuh secara proporsional menurut tanggal terakhir data.</li>
          <li>Rentang unit berasal dari sebaran selisih nyata pada uji ke masa lalu (persentil 20 sampai 80), bukan angka tebakan.</li>
          <li>Produk yang baru muncul atau riwayatnya pendek diberi keyakinan rendah. Produk yang tidak terjual 3 bulan terakhir tidak diprakirakan.</li>
          <li>Prakiraan tidak membaca kampanye, stok kosong, harga, atau iklan. Pengali kampanye adalah asumsi manual dari tim, bukan hasil data.</li>
          <li>Ini rekomendasi berbasis aturan dan statistik sederhana, bukan jaminan penjualan.</li>
        </ul>
      </details>
    </>
  );
}
