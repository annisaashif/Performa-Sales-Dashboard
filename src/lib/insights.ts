import type { Item, Platform } from './types';
import { PLATFORMS } from './types';
import {
  Agg,
  classifyCreator,
  dailyAnomalies,
  groupAgg,
  isActive,
  isCompleted,
  netAfter,
  productTable,
  totalAgg,
  lastDate,
} from './kpi';
import { dateLong, fmtInt, monthLabel, pct, rpC } from './format';

export type Level = 'penting' | 'perhatian' | 'info';

export interface Insight {
  id: string;
  level: Level;
  title: string;
  detail: string;
  action: string;
}

const LV: Record<Level, number> = { penting: 0, perhatian: 1, info: 2 };

/**
 * Rekomendasi berbasis aturan (bukan AI generatif). Setiap aturan hanya memakai angka dari data
 * yang sedang dipilih dan menyebutkan ambang yang dipakai.
 */
export function buildInsights(items: Item[], own: Set<string>): Insight[] {
  const out: Insight[] = [];
  if (!items.length) return out;
  const done = items.filter(isCompleted);

  for (const p of PLATFORMS) {
    const all = items.filter((i) => i.p === p);
    if (!all.length) continue;

    // 1. Pembatalan
    const orders = new Set(all.map((i) => i.o)).size;
    const canc = new Set(all.filter((i) => i.t === 'cancelled').map((i) => i.o)).size;
    const rate = orders ? canc / orders : 0;
    if (orders >= 100 && rate >= 0.3) {
      out.push({
        id: `cancel-${p}`,
        level: rate >= 0.4 ? 'penting' : 'perhatian',
        title: `${pct(rate)} pesanan ${p} berakhir batal`,
        detail: `${fmtInt(canc)} dari ${fmtInt(orders)} pesanan ${p} batal (ambang perhatian 30%, penting 40%).`,
        action:
          p === 'TikTok'
            ? 'Buka kolom Cancel Reason di export TikTok untuk melihat alasan terbanyak, lalu cek stok, ukuran, dan estimasi pre-order.'
            : 'Tinjau alasan pembatalan di Seller Centre, lalu cek stok, ukuran, dan waktu kirim yang dijanjikan.',
      });
    }

    // 2. Refund
    const d = totalAgg(done.filter((i) => i.p === p));
    if (d.ha > 0 && d.orders >= 50) {
      const rr = d.rf / d.ha;
      if (rr >= 0.05) {
        out.push({
          id: `refund-${p}`,
          level: rr >= 0.08 ? 'penting' : 'perhatian',
          title: `Refund ${p} mencapai ${pct(rr)} dari Net Sales`,
          detail: `Refund ${rpC(d.rf)} dari Harga Akhir ${rpC(d.ha)} pada pesanan Completed (ambang perhatian 5%, penting 8%).`,
          action: 'Lihat produk dengan retur tertinggi di halaman Produk dan periksa ukuran, bahan, dan foto produknya.',
        });
      }
    }

    // 3. Kedalaman diskon seller
    if (d.gross > 0 && d.orders >= 50) {
      const dr = d.sd / d.gross;
      if (dr >= 0.4) {
        out.push({
          id: `disc-${p}`,
          level: 'perhatian',
          title: `Diskon seller ${p} sebesar ${pct(dr)} dari penjualan kotor`,
          detail: `Diskon seller ${rpC(d.sd)} atas penjualan kotor ${rpC(d.gross)} (ambang perhatian 40%). Margin tidak bisa dinilai karena data biaya produk belum ada.`,
          action: 'Bandingkan penjualan per tingkat diskon sebelum memutuskan promo berikutnya, dan masukkan data HPP untuk menghitung laba.',
        });
      }
    }
  }

  // 4. Produk dengan retur tinggi
  const models = productTable(done, 'model').filter((r) => r.qty >= 30 && r.rq / r.qty >= 0.08);
  models.sort((a, b) => b.rq / b.qty - a.rq / a.qty);
  if (models.length) {
    const top = models.slice(0, 3);
    out.push({
      id: 'return-products',
      level: 'perhatian',
      title: `${models.length} produk punya tingkat retur di atas 8%`,
      detail: top.map((r) => `${r.name} (${pct(r.rq / r.qty)} dari ${fmtInt(r.qty)} unit)`).join('; ') + '.',
      action: 'Periksa keluhan ukuran atau kualitas pada produk ini sebelum restock.',
    });
  }

  // 5. Konsentrasi produk
  const allModels = productTable(done, 'model');
  const totalNet = allModels.reduce((s, r) => s + r.net, 0);
  if (allModels.length >= 10 && totalNet > 0) {
    const share = allModels.slice(0, 5).reduce((s, r) => s + r.net, 0) / totalNet;
    if (share >= 0.5) {
      out.push({
        id: 'concentration',
        level: 'perhatian',
        title: `5 produk teratas menyumbang ${pct(share)} Net Sales`,
        detail: allModels
          .slice(0, 5)
          .map((r) => r.name)
          .join('; ') + '.',
        action: 'Pastikan stok produk ini aman dan siapkan produk pengganti bila salah satunya habis.',
      });
    }
  }

  // 6. Pesanan yang belum Selesai di bulan terbaru
  const months = [...new Set(items.map((i) => i.m))].sort();
  const latest = months[months.length - 1];
  if (latest) {
    const inM = items.filter((i) => i.m === latest);
    const pipeline = totalAgg(inM.filter((i) => i.t === 'delivered' || i.t === 'shipping' || i.t === 'toShip'));
    const comp = totalAgg(inM.filter(isCompleted));
    if (pipeline.ha > 0 && comp.ha > 0 && pipeline.ha / comp.ha >= 0.5) {
      out.push({
        id: 'pipeline',
        level: 'info',
        title: `Net Sales ${monthLabel(latest)} masih akan naik`,
        detail: `Pesanan senilai ${rpC(pipeline.ha)} (${fmtInt(pipeline.orders)} pesanan) sudah dibayar tetapi belum berstatus Selesai, sedangkan Completed baru ${rpC(comp.ha)}. Data terakhir ${dateLong(lastDate(items))}.`,
        action: 'Jangan membandingkan bulan berjalan dengan bulan lalu memakai angka Completed. Gunakan basis "Semua pesanan aktif" di halaman Kinerja Penjualan.',
      });
    }

    // 7. Perubahan rata-rata harian (pesanan aktif) vs bulan sebelumnya
    if (months.length >= 2) {
      const prev = months[months.length - 2];
      for (const p of PLATFORMS) {
        const cur = items.filter((i) => i.p === p && i.m === latest && isActive(i));
        const old = items.filter((i) => i.p === p && i.m === prev && isActive(i));
        if (!cur.length || !old.length) continue;
        const dc = new Set(cur.map((i) => i.d)).size;
        const dp = new Set(old.map((i) => i.d)).size;
        if (dc < 7 || dp < 7) continue;
        const avgC = cur.reduce((s, i) => s + i.ha, 0) / dc;
        const avgP = old.reduce((s, i) => s + i.ha, 0) / dp;
        if (avgP <= 0) continue;
        const ch = avgC / avgP - 1;
        if (Math.abs(ch) >= 0.2) {
          out.push({
            id: `mom-${p}`,
            level: ch < 0 ? 'perhatian' : 'info',
            title: `Penjualan harian ${p} ${ch < 0 ? 'turun' : 'naik'} ${pct(Math.abs(ch), 0)} dibanding ${monthLabel(prev)}`,
            detail: `Rata-rata Harga Akhir pesanan aktif per hari ${rpC(avgC)} di ${monthLabel(latest)} vs ${rpC(avgP)} di ${monthLabel(prev)} (selisih minimal 20% yang ditandai).`,
            action: ch < 0 ? 'Cek apakah ada perubahan promo, stok kosong, atau jadwal live di periode ini.' : 'Catat promo atau live yang berjalan agar bisa diulang.',
          });
        }
      }
    }
  }

  // 8. Affiliate (TikTok)
  const tt = done.filter((i) => i.p === 'TikTok');
  if (tt.length) {
    const byCl = groupAgg(tt, (i) => classifyCreator(i.cr, own));
    const sum = (k: 'own' | 'affiliate' | 'none') => (byCl.get(k) ? netAfter(byCl.get(k)!) : 0);
    const total = sum('own') + sum('affiliate') + sum('none');
    if (total > 0) {
      const aff = groupAgg(
        tt.filter((i) => classifyCreator(i.cr, own) === 'affiliate'),
        (i) => i.cr.trim().toLowerCase(),
      );
      const rows = [...aff.entries()].map(([k, a]) => ({ k, net: netAfter(a) })).sort((a, b) => b.net - a.net);
      const affTotal = rows.reduce((s, r) => s + r.net, 0);
      if (rows.length >= 5 && affTotal > 0) {
        const top10 = rows.slice(0, 10).reduce((s, r) => s + r.net, 0) / affTotal;
        if (top10 >= 0.5) {
          out.push({
            id: 'affiliate-conc',
            level: 'info',
            title: `10 affiliate teratas menyumbang ${pct(top10)} penjualan affiliate`,
            detail: `Dari ${fmtInt(rows.length)} affiliate aktif; terbesar @${rows[0].k} (${pct(rows[0].net / affTotal)} dari penjualan affiliate).`,
            action: 'Jaga hubungan dengan creator teratas dan rekrut creator baru agar tidak bergantung pada segelintir akun.',
          });
        }
      }
      out.push({
        id: 'affiliate-split',
        level: 'info',
        title: `Akun sendiri ${pct(sum('own') / total, 0)}, affiliate ${pct(sum('affiliate') / total, 0)}, tanpa creator ${pct(sum('none') / total, 0)} dari Net Sales TikTok`,
        detail: `Akun sendiri dihitung dari daftar handle yang kamu atur di halaman Affiliate (${[...own].map((h) => '@' + h).join(', ') || 'kosong'}).`,
        action: 'Gunakan pembagian ini untuk menilai apakah penjualan TikTok bergantung pada live dan konten milik sendiri atau pada affiliate.',
      });
    }
  }

  // 9. Hari tidak biasa (per platform, pesanan aktif)
  for (const p of PLATFORMS) {
    const act = items.filter((i) => i.p === p && isActive(i));
    const g = groupAgg(act, (i) => i.d);
    const daily = [...g.entries()].map(([date, a]) => ({ date, value: a.ha })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const an = dailyAnomalies(daily);
    if (an.length) {
      const top = an[0];
      out.push({
        id: `anomaly-${p}`,
        level: 'info',
        title: `${an.length} hari tidak biasa di ${p}`,
        detail: `Paling jauh dari biasanya: ${dateLong(top.date)} dengan ${rpC(top.value)} (median harian ${rpC(top.expected)}). Ditandai bila skor robust (median dan MAD) minimal 3,5.`,
        action: 'Cocokkan dengan jadwal promo atau live pada tanggal tersebut. Lihat daftar lengkap di bagian Hari tidak biasa.',
      });
    }
  }

  // 10. Kualitas data
  const sc = items.filter((i) => i.flag === 'selesai_cancel');
  if (sc.length) {
    const orders = new Set(sc.map((i) => i.o)).size;
    const v = sc.reduce((s, i) => s + i.ha, 0);
    out.push({
      id: 'dq-selesai-cancel',
      level: 'perhatian',
      title: `${fmtInt(orders)} pesanan TikTok berstatus Selesai tetapi bertipe Cancel`,
      detail: `Nilai Harga Akhir ${rpC(v)}. Pesanan ini dikeluarkan dari Completed sampai ada konfirmasi.`,
      action: 'Cek beberapa nomor pesanannya di TikTok Seller Center, lalu putuskan apakah dihitung sebagai penjualan.',
    });
  }

  out.sort((a, b) => LV[a.level] - LV[b.level]);
  return out;
}

export type { Agg, Platform };
