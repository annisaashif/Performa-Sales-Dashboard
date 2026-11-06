// Membundel aplikasi React.
//   node scripts/build.mjs          -> assets/app.js + assets/app.css (versi lokal PHP + MySQL; dipakai index.php)
//   node scripts/build.mjs --demo   -> docs/ (demo statis tanpa server, data fiktif tertanam; untuk GitHub Pages)
// Pengaturan opsional lewat variabel lingkungan:
//   DKP_OWN="akun1, akun2"   akun kreator milik sendiri yang terisi otomatis di halaman Affiliate
//   DKP_BRAND="NAMA MEREK"   awalan merek pada nama produk yang dibuang dari label grafik
// Hanya perlu dijalankan bila kamu mengubah isi folder src/. Hasil build sudah disertakan.
let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  esbuild = await import('/opt/npm-tools/node_modules/esbuild/lib/main.js');
}
const { build } = esbuild;
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const demo = process.argv.includes('--demo') || !!process.env.DKP_DEMO;
const outDir = path.join(root, demo ? 'docs' : 'assets');
fs.mkdirSync(outDir, { recursive: true });

const swapStore = {
  name: 'swap-store',
  setup(b) {
    if (!demo) return;
    b.onResolve({ filter: /^\.\/lib\/store$/ }, () => ({ path: path.join(root, 'src/lib/store-demo.ts') }));
  },
};

const res = await build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: {
    'process.env.NODE_ENV': '"production"',
    __BUILD__: JSON.stringify(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')),
    __DEMO__: JSON.stringify(demo),
    __OWN__: JSON.stringify(process.env.DKP_OWN ?? (demo ? 'demo.official, demo.knits' : '')),
    __BRAND__: JSON.stringify(process.env.DKP_BRAND ?? (demo ? 'DEMO' : '')),
  },
  plugins: [swapStore],
  legalComments: 'none',
  logLevel: 'info',
  nodePaths: ['/opt/npm-tools/node_modules'],
});
const js = res.outputFiles[0].text;
fs.writeFileSync(path.join(outDir, 'app.js'), js);
fs.copyFileSync(path.join(root, 'src/styles.css'), path.join(outDir, 'app.css'));
if (demo) {
  const head = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
  const fonts = (head.match(/<link[^>]+fonts[^>]+>/g) ?? []).join('\n  ');
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    `<!doctype html>\n<html lang="id">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Dashboard Kinerja Penjualan (Demo)</title>\n  ${fonts}\n  <link rel="stylesheet" href="app.css">\n</head>\n<body>\n  <div id="root"></div>\n  <script src="app.js"></script>\n</body>\n</html>\n`,
  );
}
console.log(path.join(demo ? 'docs' : 'assets', 'app.js'), (js.length / 1024).toFixed(0) + ' KB');
