#!/usr/bin/env python3
"""
Membuat DATA DEMO FIKTIF dalam format export TikTok Shop, Shopee, dan Website.
Semua nama merek, produk, akun kreator, dan angka di sini karangan (tidak ada data perusahaan nyata).

Pemakaian:  python3 scripts/generate-demo-data.py demo-data
Hasil: demo-data/TikTok_<bulan>.xlsx, Shopee_<bulan>.xlsx, Website_<bulan>.csv (hasil selalu sama karena seed tetap).
"""
import csv, os, random, sys, calendar
from datetime import date, datetime, timedelta
from openpyxl import Workbook

OUT = sys.argv[1] if len(sys.argv) > 1 else 'demo-data'
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(20261104)
rnd_corrupt = random.Random(99)   # terpisah, agar data dasar sama persis dengan atau tanpa simulasi file rusak
NO_CORRUPT = bool(os.environ.get('DEMO_NOCORRUPT'))

MONTHS = [(2025, 11), (2025, 12)] + [(2026, m) for m in range(1, 11)]
LAST_MONTH = (2026, 10)
LAST_DAY = 28  # data bulan terakhir berhenti tanggal 28 (bulan berjalan)
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

# (nama, kategori, harga awal, bobot dasar, bulan mulai (indeks), tren bulanan, bulan berhenti (indeks) atau None)
P = [
  ('Mirela Linen Blouse', 'Blouse', 219000, 10, 0, 1.02, None),
  ('Ravena Satin Blouse', 'Blouse', 249000, 9, 0, 0.95, None),
  ('Kinar Knit Cardigan', 'Cardigan', 289000, 9, 0, 1.06, None),
  ('Ayuna Knit Vest', 'Cardigan', 199000, 4, 0, 0.93, None),
  ('Dewi Wrap Dress', 'Dress', 329000, 8, 0, 1.00, None),
  ('Nirmala Midi Dress', 'Dress', 349000, 6, 0, 0.99, None),
  ('Sekar Floral Dress', 'Dress', 319000, 6, 0, 0.96, 8),
  ('Embun Slip Dress', 'Dress', 279000, 3, 0, 1.00, None),
  ('Salma Oversize Shirt', 'Shirt', 229000, 8, 0, 0.99, None),
  ('Kirana Tunic Shirt', 'Shirt', 209000, 5, 0, 0.97, None),
  ('Cahya Cropped Outer', 'Outer', 299000, 5, 0, 1.00, None),
  ('Gendis Kimono Outer', 'Outer', 339000, 4, 0, 0.88, None),
  ('Laras Wide Pants', 'Bottom', 239000, 7, 0, 0.99, None),
  ('Bening Pleated Pants', 'Bottom', 249000, 7, 0, 0.93, None),
  ('Tara Pleated Skirt', 'Bottom', 219000, 6, 0, 1.02, None),
  ('Tamsin Basic Tee', 'Top', 129000, 8, 0, 0.88, None),
  ('Anindya Ribbed Knit Top', 'Top', 169000, 5, 5, 1.12, None),   # produk baru, tumbuh
  ('Larasati Signature Set', 'Set', 399000, 6, 9, 1.00, None),     # produk baru (bulan terakhir)
]
SIZES = ['S', 'M', 'L', 'XL']
COLORS = ['Black', 'Cream', 'Sage', 'Dusty Pink', 'Navy']
BRAND = 'DEMO'
CODE = lambda n: ''.join(w[0] for w in n.split()[:2]).upper() + str(sum(map(ord, n)) % 90 + 10)

# musiman: bulan -> pengali volume (11.11 dan 12.12, Ramadan/Lebaran Maret, lalu normal)
SEASON = {(2025, 11): 1.55, (2025, 12): 1.65, (2026, 1): 0.9, (2026, 2): 1.0, (2026, 3): 1.5, (2026, 4): 0.8,
          (2026, 5): 0.9, (2026, 6): 0.95, (2026, 7): 0.92, (2026, 8): 1.0, (2026, 9): 1.0, (2026, 10): 1.03}
# diskon seller rata-rata per bulan (kampanye)
PROMO = {(2025, 11): 0.22, (2025, 12): 0.2, (2026, 3): 0.15}
BASE_ORDERS = 650  # pesanan per bulan, semua platform, sebelum musim dan pertumbuhan
SHARE = lambda mi: {'TikTok': 0.38 + 0.012 * mi, 'Shopee': 0.47 - 0.008 * mi, 'Website': 0.15 - 0.004 * mi}
CANCEL = {'TikTok': 0.06, 'Shopee': 0.08, 'Website': 0.04}
CREATORS_OWN = ['demo.official', 'demo.knits']
AFFIL = [f'kreator_{i:02d}' for i in range(1, 15)]
AFFIL_W = [1 / (i + 1) ** 1.1 for i in range(len(AFFIL))]
CHANNELS = [('LIVE', 0.3), ('Videos', 0.35), ('Product cards', 0.35)]

def weights(mi):
    ws = []
    for (name, cat, price, w, start, tr, end) in P:
        if mi < start or (end is not None and mi > end):
            ws.append(0)
        else:
            ws.append(w * tr ** (mi - start))
    return ws

def pick_variant(name):
    return f'{rnd.choice(COLORS)}, {rnd.choice(SIZES)}'

def day_for(y, m, mi):
    maxd = LAST_DAY if (y, m) == LAST_MONTH else calendar.monthrange(y, m)[1]
    # campaign peaks: tanggal 11 pada Nov, 12 pada Des
    if (y, m) == (2025, 11) and rnd.random() < 0.28: d = 11
    elif (y, m) == (2025, 12) and rnd.random() < 0.28: d = 12
    else: d = rnd.randint(1, maxd)
    return min(d, maxd)

def status_for(plat, y, m, d):
    age = (date(*LAST_MONTH, LAST_DAY) - date(y, m, d)).days
    if rnd.random() < CANCEL[plat]: return 'cancel'
    if age > 21: return 'done'
    if age > 9: return rnd.choice(['done', 'done', 'received', 'shipped'])
    if age > 3: return rnd.choice(['shipped', 'shipped', 'received', 'toship'])
    return rnd.choice(['toship', 'toship', 'shipped', 'unpaid'])

def make_orders(plat, y, m, mi):
    n_total = BASE_ORDERS * SEASON[(y, m)] * (1 + 0.012 * mi)
    if (y, m) == LAST_MONTH: n_total *= LAST_DAY / 31
    n = int(n_total * SHARE(mi)[plat] * rnd.uniform(0.95, 1.05))
    ws = weights(mi)
    orders = []
    for _ in range(n):
        d = day_for(y, m, mi); hh = rnd.choices(range(24), weights=[1,1,1,1,1,2,3,4,5,6,6,6,7,6,5,5,6,7,9,10,10,8,5,3])[0]
        mm = rnd.randint(0, 59)
        lines = []
        for _ in range(rnd.choices([1, 2, 3], weights=[75, 20, 5])[0]):
            pi = rnd.choices(range(len(P)), weights=ws)[0]
            if any(l['pi'] == pi for l in lines): continue
            name, cat, price, *_ = P[pi]
            q = rnd.choices([1, 2, 3], weights=[80, 15, 5])[0]
            promo = PROMO.get((y, m), 0.04)
            sd_pct = max(0.0, rnd.gauss(promo, 0.05)) if rnd.random() < (0.9 if (y, m) in PROMO else 0.35) else 0.0
            sd = round(price * q * sd_pct / 1000) * 1000
            pd_ = round(price * q * rnd.choice([0, 0, 0.03, 0.05]) / 1000) * 1000
            lines.append(dict(pi=pi, name=f'{BRAND} - {name}', cat=cat, price=price, q=q, sd=sd, pd=pd_, var=pick_variant(name), sku=f'{CODE(name)}-{rnd.choice(SIZES)}'))
        orders.append(dict(day=d, h=hh, mi_=mm, lines=lines, st=status_for(plat, y, m, d)))
    return orders

def uid(prefix, y, m, i, k=0):
    return f'{prefix}{y % 100:02d}{m:02d}{i:05d}{rnd.randint(100,999)}'

def tiktok_file(y, m, mi):
    wb = Workbook(); ws = wb.active; ws.title = 'OrderSKUList'
    ws.append(['Order ID', 'Order Status', 'Order Substatus', 'Cancelation/Return Type', 'Seller SKU', 'Product Name', 'Variation', 'Quantity',
               'Sku Quantity of return', 'SKU Unit Original Price', 'SKU Seller Discount', 'SKU Platform Discount', 'Created Time', 'Product Category',
               'Creator Handle', 'Order Channel'])
    for i, o in enumerate(make_orders('TikTok', y, m, mi)):
        oid = '5' + str(rnd.randint(10**16, 10**17 - 1))
        created = f'{o["day"]:02d}/{m:02d}/{y} {o["h"]:02d}:{o["mi_"]:02d}:{rnd.randint(0,59):02d}'
        r = rnd.random()
        creator, chan = '', ''
        if r < 0.10: creator, chan = rnd.choice(CREATORS_OWN), rnd.choice(['LIVE', 'Videos'])
        elif r < 0.42: creator, chan = rnd.choices(AFFIL, weights=AFFIL_W)[0], rnd.choices([c for c, _ in CHANNELS], weights=[w for _, w in CHANNELS])[0]
        else: chan = 'Product cards' if rnd.random() < 0.5 else ''
        st = o['st']
        for l in o['lines']:
            ctype, rq = '', 0
            if st == 'done': status, sub = 'Selesai', 'Selesai'
            elif st == 'received': status, sub = 'Dikirim', 'Terkirim'
            elif st == 'shipped': status, sub = 'Dikirim', 'Dalam pengiriman'
            elif st == 'toship': status, sub = 'Perlu dikirim', 'Menunggu dikemas'
            elif st == 'unpaid': status, sub = 'Belum dibayar', ''
            else: status, sub, ctype = 'Dibatalkan', 'Dibatalkan', 'Cancel'
            if status == 'Selesai':
                if rnd.random() < 0.035: ctype, rq = 'Return/Refund', l['q']
                elif rnd.random() < 0.004: ctype = 'Cancel'   # kasus ganjil: Selesai tetapi tercatat Cancel
            ws.append([oid, status, sub, ctype, l['sku'], l['name'], l['var'], l['q'], rq, l['price'], l['sd'], l['pd'], created, l['cat'], creator, chan])
    wb.save(f'{OUT}/TikTok_{MON[m-1]}_{y}.xlsx')

def shopee_file(y, m, mi, corrupt=False):
    wb = Workbook(); ws = wb.active; ws.title = 'orders'
    ws.append(['No. Pesanan', 'Status Pesanan', 'Nomor Referensi SKU', 'Nama Produk', 'Nama Variasi', 'Harga Awal', 'Harga Setelah Diskon', 'Jumlah',
               'Returned quantity', 'Diskon Dari Penjual', 'Diskon Dari Shopee', 'Subtotal Pesanan', 'Waktu Pesanan Dibuat'])
    fmt_id = lambda n: f'{n:,}'.replace(',', '.')
    for i, o in enumerate(make_orders('Shopee', y, m, mi)):
        oid = f'{y % 100:02d}{m:02d}{d_ if (d_ := o["day"]) else 0:02d}' + ''.join(rnd.choices('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', k=8))
        created = f'{y}-{m:02d}-{o["day"]:02d} {o["h"]:02d}:{o["mi_"]:02d}'
        st = o['st']
        for l in o['lines']:
            rq = 0
            if st == 'done': status = 'Selesai'
            elif st == 'received': status = 'Pesanan Diterima'
            elif st == 'shipped': status = 'Telah Dikirim'
            elif st == 'toship': status = 'Perlu Dikirim'
            elif st == 'unpaid': status = 'Belum Bayar'
            else: status = 'Batal'
            if status == 'Selesai' and rnd.random() < 0.03: rq = l['q']
            sub = l['price'] * l['q'] - l['sd'] - l['pd']
            after = sub / l['q']
            if not corrupt:
                ws.append([oid, status, l['sku'], l['name'], l['var'], l['price'], after, l['q'], rq, l['sd'], l['pd'], sub, created])
            else:
                # Simulasi file rusak: Harga Awal terbaca 1/100, diskon dengan skala berbeda-beda per baris,
                # Subtotal Pesanan tersimpan sebagai teks ribuan ("211.090"). Perilaku ini ditangani oleh aplikasi.
                s1, s2 = rnd_corrupt.choice([1, 10, 100]), rnd_corrupt.choice([1, 10, 100])
                sub_txt = fmt_id(int(sub)) if sub >= 1000 else str(int(sub))
                ws.append([oid, status, l['sku'], l['name'], l['var'], l['price'] / 100, after / 100, l['q'], rq, l['sd'] / s1, l['pd'] / s2, sub_txt, created])
    wb.save(f'{OUT}/Shopee_{MON[m-1]}_{y}.xlsx')

def website_file(y, m, mi):
    with open(f'{OUT}/Website_{MON[m-1]}_{y}.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['Status Order', 'Nomor Order', 'Tanggal Order', 'Nama Produk', 'Kode Varian', 'Variasi', 'Harga Produk', 'Jumlah', 'Nilai Diskon Produk'])
        for i, o in enumerate(make_orders('Website', y, m, mi)):
            oid = f'INV/{y}/{m:02d}/{i + 1:05d}'
            st = o['st']
            status = {'done': 'Selesai', 'received': 'Terkirim', 'shipped': 'Dikirim', 'toship': 'Lunas', 'unpaid': 'Belum Dibayar', 'cancel': 'Dibatalkan'}[st]
            created = f'{y}-{m:02d}-{o["day"]:02d} {o["h"]:02d}:{o["mi_"]:02d}:00'
            disc = sum(l['sd'] for l in o['lines'])
            for j, l in enumerate(o['lines']):
                w.writerow([status, oid, created, l['name'], l['sku'], l['var'], l['price'], l['q'], disc if j == 0 else 0])

for mi, (y, m) in enumerate(MONTHS):
    tiktok_file(y, m, mi)
    shopee_file(y, m, mi, corrupt=((y, m) == (2026, 3) and not NO_CORRUPT))   # Maret 2026: satu file Shopee dengan angka rusak (simulasi)
    if (y, m) != (2026, 9):                                  # Website September sengaja tidak ada (memperlihatkan penanganan bulan bolong)
        website_file(y, m, mi)
print('selesai:', len(os.listdir(OUT)), 'file di', OUT)
