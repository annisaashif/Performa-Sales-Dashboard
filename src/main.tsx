import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FileMeta, Filter, Item } from './lib/types';
import { PLATFORMS } from './lib/types';
import { readXlsx } from './lib/xlsx';
import { parseCsv } from './lib/csv';
import { normalize } from './lib/normalize';
import { ServerError, checkServer, clearAll, importFile, loadAll, removeFile } from './lib/store';
import type { ServerStatus } from './lib/store';
import { applyFilter, monthsOf } from './lib/kpi';
import { dateLong, monthLabel } from './lib/format';
import { lastDate } from './lib/kpi';
import { DataCtx } from './ui/common';
import { Ringkasan, Penjualan } from './ui/pages-sales';
import { Affiliate, Channel, Produk } from './ui/pages-analysis';
import { DataPage, Rekomendasi } from './ui/pages-data';
import { Forecast } from './ui/pages-forecast';
import { DEFAULT_OWN, IS_DEMO } from './lib/env';

declare const __BUILD__: string;

const PAGES = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'penjualan', label: 'Kinerja Penjualan' },
  { id: 'channel', label: 'Channel' },
  { id: 'produk', label: 'Produk' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'affiliate', label: 'Affiliate' },
  { id: 'rekomendasi', label: 'Rekomendasi' },
  { id: 'data', label: 'Data' },
];

const OWN_KEY = 'dkp-own-handles';

function readOwn(): string {
  try {
    return localStorage.getItem(OWN_KEY) ?? DEFAULT_OWN;
  } catch {
    return DEFAULT_OWN;
  }
}

function pageFromHash(): string {
  const h = window.location.hash.replace('#', '');
  return PAGES.some((p) => p.id === h) ? h : 'ringkasan';
}

function App() {
  const [all, setAll] = useState<Item[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [ready, setReady] = useState(false);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [serverError, setServerError] = useState<{ message: string; hint: string } | null>(null);
  const [page, setPage] = useState(pageFromHash);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [ownText, setOwnTextRaw] = useState(readOwn);
  const [filter, setFilter] = useState<Filter | null>(null);

  /** Memeriksa database lalu memuat semua baris pesanan dari MySQL. */
  const reload = useCallback(async () => {
    try {
      setServer(await checkServer());
      const data = await loadAll();
      setAll(data.items);
      setFiles(data.files);
      setServerError(null);
    } catch (e) {
      const se = e instanceof ServerError ? e : new ServerError(e instanceof Error ? e.message : 'Terjadi kesalahan.');
      setServerError({ message: se.message, hint: se.hint });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const h = () => setPage(pageFromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const go = useCallback((p: string) => {
    window.location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const months = useMemo(() => monthsOf(all), [all]);

  // Filter default: seluruh periode dan semua platform. Disesuaikan saat data berubah.
  const effective: Filter = useMemo(() => {
    const plats = PLATFORMS.filter((p) => all.some((i) => i.p === p));
    if (!months.length) return { from: '', to: '', platforms: plats };
    const f = filter ?? { from: months[0], to: months[months.length - 1], platforms: plats };
    return {
      from: months.includes(f.from) ? f.from : months[0],
      to: months.includes(f.to) ? f.to : months[months.length - 1],
      platforms: f.platforms.filter((p) => plats.includes(p)).length ? f.platforms.filter((p) => plats.includes(p)) : plats,
    };
  }, [filter, months, all]);

  // Bila data baru ditambahkan, perluas periode agar bulan baru ikut terlihat.
  useEffect(() => {
    setFilter(null);
  }, [months.join(',')]);

  const items = useMemo(() => applyFilter(all, effective), [all, effective]);
  const own = useMemo(() => new Set(ownText.split(/[,\n]/).map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)), [ownText]);
  const setOwnText = useCallback((s: string) => {
    setOwnTextRaw(s);
    try {
      localStorage.setItem(OWN_KEY, s);
    } catch {
      /* abaikan */
    }
  }, []);

  const onFiles = useCallback(async (fs: File[]) => {
    setBusy(true);
    setError('');
    const errs: string[] = [];
    let saved = 0;
    for (const f of fs) {
      try {
        setProgress(`Membaca ${f.name}…`);
        await new Promise((r) => setTimeout(r, 20));
        const lower = f.name.toLowerCase();
        let rows: string[][];
        if (lower.endsWith('.csv')) rows = parseCsv(new TextDecoder('utf-8').decode(await f.arrayBuffer()));
        else if (lower.endsWith('.xlsx')) rows = await readXlsx(await f.arrayBuffer(), (n) => setProgress(`Membaca ${f.name}: ${n.toLocaleString('id-ID')} baris…`));
        else throw new Error('Format file tidak didukung. Gunakan .xlsx atau .csv.');
        setProgress(`Menormalkan ${f.name}…`);
        await new Promise((r) => setTimeout(r, 0));
        const res = normalize(rows, f.name);
        const meta: FileMeta = {
          name: f.name,
          platform: res.platform,
          importedAt: Date.now(),
          rows: res.rows,
          items: res.items.length,
          orders: new Set(res.items.map((i) => i.o)).size,
          months: monthsOf(res.items),
          warnings: res.warnings,
        };
        await importFile(meta, res.items, (done, total) => setProgress(`Menyimpan ${f.name} ke database: ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} baris…`));
        saved++;
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : 'gagal diimpor'}${e instanceof ServerError && e.hint ? ` (${e.hint})` : ''}`);
      }
    }
    if (saved) {
      setProgress('Memuat ulang data dari database…');
      await reload();
    }
    setBusy(false);
    setProgress('');
    if (errs.length) setError(errs.join(' · '));
    else if (saved) go('ringkasan');
  }, [go, reload]);

  const onRemove = useCallback(
    async (name: string) => {
      try {
        await removeFile(name);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menghapus file.');
      }
    },
    [reload],
  );
  const onClear = useCallback(async () => {
    try {
      await clearAll();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus data.');
    }
  }, [reload]);

  const ctx = useMemo(
    () => ({ all, items, filter: effective, setFilter: (f: Filter) => setFilter(f), months, files, own, ownText, setOwnText, go }),
    [all, items, effective, months, files, own, ownText, setOwnText, go],
  );

  const toggle = (p: (typeof PLATFORMS)[number]) => {
    const has = effective.platforms.includes(p);
    const next = has ? effective.platforms.filter((x) => x !== p) : [...effective.platforms, p];
    if (next.length) setFilter({ ...effective, platforms: next });
  };

  const availablePlatforms = PLATFORMS.filter((p) => all.some((i) => i.p === p));

  return (
    <DataCtx.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="brand">
            <span className="brand-mark" aria-hidden />
            <div>
              <strong>Kinerja Penjualan</strong>
              <small>TikTok Shop · Shopee · Website</small>
            </div>
          </div>
          <nav aria-label="Halaman">
            <ul>
              {PAGES.map((p) => (
                <li key={p.id}>
                  <a href={`#${p.id}`} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined}>
                    {p.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="side-foot">
            {all.length ? (
              <>
                <span>Data sampai</span>
                <strong>{dateLong(lastDate(all))}</strong>
                <span>{files.length} file diimpor</span>
              </>
            ) : (
              <span>Belum ada data</span>
            )}
            <small className="build">Versi {typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}</small>
          </div>
        </aside>

        <main className="main">
          {IS_DEMO && (
            <div className="alert info demo-banner" role="note">
              <strong>Demo dengan data fiktif.</strong> Semua merek, produk, akun kreator, dan angka di sini dibuat otomatis untuk peragaan. Anda boleh menambah file export sendiri di halaman Data; file itu hanya diproses di peramban Anda dan tidak diunggah ke mana pun.
            </div>
          )}
          {all.length > 0 && page !== 'data' && (
            <div className="filters" role="group" aria-label="Filter periode dan platform">
              <label>
                <span>Dari</span>
                <select id="f-dari" value={effective.from} onChange={(e) => setFilter({ ...effective, from: e.target.value, to: e.target.value > effective.to ? e.target.value : effective.to })}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sampai</span>
                <select id="f-sampai" value={effective.to} onChange={(e) => setFilter({ ...effective, to: e.target.value, from: e.target.value < effective.from ? e.target.value : effective.from })}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="chips" role="group" aria-label="Platform">
                {availablePlatforms.map((p) => (
                  <button key={p} className={`chip ${effective.platforms.includes(p) ? 'on' : ''}`} aria-pressed={effective.platforms.includes(p)} onClick={() => toggle(p)}>
                    <i style={{ background: p === 'TikTok' ? 'var(--s1)' : p === 'Shopee' ? 'var(--s2)' : 'var(--s3)' }} />
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!ready ? (
            <p className="muted">Memuat data dari database…</p>
          ) : serverError ? (
            <div className="alert crit" role="alert">
              <strong>{serverError.message}</strong>
              {serverError.hint && <p>{serverError.hint}</p>}
              <button className="btn" onClick={() => void reload()}>
                Coba lagi
              </button>
            </div>
          ) : page === 'ringkasan' ? (
            <Ringkasan />
          ) : page === 'penjualan' ? (
            <Penjualan />
          ) : page === 'channel' ? (
            <Channel />
          ) : page === 'produk' ? (
            <Produk />
          ) : page === 'forecast' ? (
            <Forecast />
          ) : page === 'affiliate' ? (
            <Affiliate />
          ) : page === 'rekomendasi' ? (
            <Rekomendasi />
          ) : (
            <DataPage onFiles={onFiles} busy={busy} progress={progress} error={error} dbName={server?.database ?? ''} onRemove={onRemove} onClear={onClear} />
          )}
        </main>
      </div>
    </DataCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
