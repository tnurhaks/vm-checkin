# Vendor Management – Digital Visitor Check-in

Website registrasi kehadiran tamu berbasis QR Code.

## Teknologi
- Frontend: HTML, CSS, JavaScript (folder `public/`)
- API serverless: Cloudflare Pages Functions (folder `functions/`)
- Backend: Google Apps Script (salinan kode di folder `apps-script/`)
- Database: Google Sheets
- Penyimpanan foto: Google Drive (privat)

## Deployment
Cloudflare Pages, terhubung ke branch `main`.
- Build command: (kosong)
- Build output directory: `public`

## Keamanan
Seluruh secret disimpan di Cloudflare Environment Variables dan
Google Apps Script Script Properties. Jangan menyimpan secret di repository ini.
