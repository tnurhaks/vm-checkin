# Vendor Management – Digital Visitor Check-in

Website registrasi kehadiran tamu berbasis QR Code. Data tersimpan di Google Sheets, foto tersimpan di Google Drive (privat).

## Struktur

```text
vm-checkin/
├── wrangler.jsonc          Konfigurasi Cloudflare Worker
├── src/worker.js           API: /api/config, /api/geocode, /api/submit
├── public/                 File statis (frontend)
│   ├── index.html          Halaman registrasi tamu
│   ├── qr.html             Poster QR Code (buka: /qr)
│   ├── privasi.html        Pemberitahuan pemrosesan data pribadi (buka: /privasi)
│   ├── _headers            Security headers (CSP, dll.)
│   └── assets/
│       ├── css/style.css, css/qr.css
│       └── js/validation.js, api.js, app.js, location.js,
│              watermark.js, camera.js, qr.js, vendor/qrcode.js
└── apps-script/            Salinan kode Google Apps Script (dijalankan di script.google.com)
    ├── Code.gs
    └── appsscript.json
```

## Alur data

Browser tamu → Cloudflare Worker (`/api/*`, validasi + rate limit + Turnstile) → Google Apps Script (verifikasi HMAC, validasi ulang) → Google Sheets + Google Drive.

Browser tidak pernah mengetahui URL Apps Script maupun secret.

## Secret di Cloudflare (Workers & Pages → vm-checkin → Settings → Variables and Secrets)

| Nama | Wajib | Isi |
|---|---|---|
| `GAS_URL` | Ya | URL Web App Apps Script (berakhiran `/exec`) |
| `GAS_SECRET` | Ya | `SHARED_SECRET` dari Execution log fungsi `setup()` |
| `TURNSTILE_SITE_KEY` | Tidak | Site key widget Turnstile |
| `TURNSTILE_SECRET_KEY` | Tidak | Secret key widget Turnstile |

Semua diisi dengan tipe **Secret**.

## Pengaturan oleh administrator (sheet "Pengaturan")

| Parameter | Default | Fungsi |
|---|---|---|
| `RETENTION_DAYS` | 365 | Data lebih lama dianonimkan dan fotonya dihapus (trigger harian 02.00 WIB). 0 = nonaktif |
| `BATAS_REGISTRASI_PER_10_MENIT` | 10 | Batas registrasi per jaringan |
| `STATUS_LAYANAN` | AKTIF | Isi `NONAKTIF` untuk menutup registrasi sementara |

Perubahan berlaku paling lambat 5 menit.

## Pemeliharaan

- Lupa secret: jalankan `tampilkanSecret()` di Apps Script.
- Secret bocor: jalankan `gantiSecret()`, lalu perbarui `GAS_SECRET` di Cloudflare.
- Mengubah kode Apps Script: **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**. URL tetap sama.
- Akses petugas: bagikan spreadsheet dan folder "Vendor Management Check-in" ke akun petugas (Bagikan → masukkan email). Jangan pilih "Siapa saja yang memiliki link".

## Keterbatasan

GPS dapat dipalsukan dan kurang akurat di dalam gedung. Kamera browser tidak dapat membuktikan bahwa gambar berasal dari kamera fisik. Waktu watermark disinkronkan dengan jam server, tetapi tetap dihitung di perangkat. Sistem ini adalah alat bantu pencatatan, bukan bukti kehadiran mutlak. 
