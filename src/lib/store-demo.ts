import type { FileMeta, Item } from './types';
import demo from '../../demo/demo-data.json';

/**
 * Pengganti store.ts untuk build demo statis (tanpa server). Data fiktif dibuat oleh scripts/generate-demo-data.py.
 * File yang ditambahkan pengunjung hanya diproses di peramban dan hilang saat halaman dimuat ulang; tidak ada yang diunggah.
 */

export class ServerError extends Error {
  hint: string;
  constructor(message: string, hint = '') {
    super(message);
    this.hint = hint;
  }
}

export interface ServerStatus {
  database: string;
  items: number;
  files: number;
}

let files: FileMeta[] = (demo as unknown as { files: FileMeta[] }).files.slice();
let items: Item[] = (demo as unknown as { items: Item[] }).items.slice();

export async function checkServer(): Promise<ServerStatus> {
  return { database: '', items: items.length, files: files.length };
}

export async function loadAll(): Promise<{ files: FileMeta[]; items: Item[] }> {
  return { files: files.slice(), items: items.slice() };
}

export async function importFile(meta: FileMeta, add: Item[], onProgress: (done: number, total: number) => void): Promise<void> {
  files = files.filter((f) => f.name !== meta.name).concat(meta);
  items = items.filter((i) => i.src !== meta.name).concat(add);
  onProgress(add.length, add.length);
}

export async function removeFile(name: string): Promise<void> {
  files = files.filter((f) => f.name !== name);
  items = items.filter((i) => i.src !== name);
}

export async function clearAll(): Promise<void> {
  files = [];
  items = [];
}
