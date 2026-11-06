import type { FileMeta, Item } from './types';

/**
 * Klien untuk API PHP (folder api/). Data disimpan di database MySQL (terlihat di phpMyAdmin).
 * Pembacaan file dan perhitungan KPI tetap terjadi di peramban; server hanya menyimpan dan mengirim baris pesanan.
 */

export class ServerError extends Error {
  hint: string;
  constructor(message: string, hint = '') {
    super(message);
    this.hint = hint;
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ServerError(
      'Server tidak bisa dihubungi.',
      'Buka aplikasi lewat http://localhost/dashboard-penjualan/ (bukan dengan klik dua kali pada file), dan pastikan Apache di XAMPP sudah Start.',
    );
  }
  const text = await res.text();
  let data: { ok?: boolean; error?: string; hint?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ServerError(
      res.ok ? 'Respons server tidak berupa JSON.' : `Server membalas error ${res.status}.`,
      'Pastikan folder api/ ada di dalam folder proyek dan PHP berjalan. Lihat log error Apache di XAMPP untuk detailnya.',
    );
  }
  if (!res.ok || data.ok === false) throw new ServerError(data.error ?? `Error ${res.status}`, data.hint ?? '');
  return data;
}

export interface ServerStatus {
  database: string;
  items: number;
  files: number;
}

/** Memastikan database dan tabel ada (dibuat otomatis bila belum). */
export async function checkServer(): Promise<ServerStatus> {
  return request<ServerStatus>('api/status.php');
}

export async function loadAll(): Promise<{ files: FileMeta[]; items: Item[] }> {
  const [f, i] = await Promise.all([request<{ files: FileMeta[] }>('api/files.php'), request<{ items: Item[] }>('api/items.php')]);
  return { files: f.files, items: i.items };
}

const BATCH = 2000;

/** Menyimpan hasil normalisasi satu file ke database, bertahap. Impor ulang file yang sama memperbarui, bukan menggandakan. */
export async function importFile(meta: FileMeta, items: Item[], onProgress: (done: number, total: number) => void): Promise<void> {
  const file = { name: meta.name, platform: meta.platform, importedAt: meta.importedAt, rows: meta.rows, warnings: meta.warnings };
  const importId = meta.importedAt;
  onProgress(0, items.length);
  for (let i = 0; i < items.length; i += BATCH) {
    await request('api/import.php', { action: 'batch', file, importId, items: items.slice(i, i + BATCH) });
    onProgress(Math.min(i + BATCH, items.length), items.length);
  }
  await request('api/import.php', { action: 'finish', file, importId });
}

export async function removeFile(name: string): Promise<void> {
  await request('api/files.php', { action: 'delete', name });
}

export async function clearAll(): Promise<void> {
  await request('api/files.php', { action: 'clear' });
}
