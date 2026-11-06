/**
 * Nilai yang ditentukan saat build (lihat scripts/build.mjs). Saat dijalankan di luar build (mis. pengujian dengan tsx)
 * semuanya jatuh ke nilai bawaan yang aman.
 */
declare const __DEMO__: boolean;
declare const __OWN__: string;
declare const __BRAND__: string;

/** True pada build demo statis: data fiktif tertanam, tanpa PHP dan MySQL. */
export const IS_DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__;

/** Akun kreator milik sendiri yang terisi otomatis di halaman Affiliate (bisa diubah di halaman itu). */
export const DEFAULT_OWN = typeof __OWN__ === 'string' ? __OWN__ : '';

/** Awalan merek pada nama produk yang dibuang dari label grafik, mis. "ACME - ". Kosong bila tidak diatur. */
export const BRAND_PREFIX = typeof __BRAND__ === 'string' ? __BRAND__ : '';

export const stripBrand = (name: string): string => {
  if (!BRAND_PREFIX) return name;
  const esc = BRAND_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${esc}\\s*-\\s*`, 'i'), '');
};
