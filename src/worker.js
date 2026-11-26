/* =========================================================
   Vendor Management - Visitor Check-in
   File: src/worker.js  (Cloudflare Worker)
   - File statis di folder public/ dilayani otomatis oleh Cloudflare.
   - Worker ini hanya menangani /api/*:
       GET  /api/config   : jam server + site key Turnstile
       POST /api/geocode  : alamat dari koordinat (via Apps Script)
       POST /api/submit   : validasi, anti-bot, rate limit, teruskan ke Apps Script
   - Secret (Settings > Variables and Secrets):
       GAS_URL, GAS_SECRET, TURNSTILE_SITE_KEY (opsional), TURNSTILE_SECRET_KEY (opsional)
   ========================================================= */

const BATAS_BODY_SUBMIT = 2_500_000;   // byte
const BATAS_FOTO_BASE64 = 2_000_000;   // karakter (±1,5 MB file)
const VERSI_DISCLAIMER = "2.0"; // 2.0: disclaimer tanpa kotak centang persetujuan

const POLA_NAMA = /^\p{L}[\p{L}\p{M}\s.,'\-]*$/u;
const POLA_PERUSAHAAN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s.,&()'\/\-]*$/u;
const POLA_IDEMPOTENCY = /^[A-Za-z0-9-]{16,64}$/;

// Daftar bidang usaha (sama dengan public/assets/js/validation.js dan apps-script/Code.gs).
const DAFTAR_BIDANG_USAHA = [
  "Konstruksi & Renovasi Gedung",
  "Konsultan (Perencana / Pengawas / Manajemen Konstruksi)",
  "Mekanikal, Elektrikal & Plumbing (MEP)",
  "Pemeliharaan Gedung & Fasilitas",
  "Kebersihan (Cleaning Service)",
  "Keamanan (Security / Satpam)",
  "Teknologi Informasi (Hardware, Software, Jaringan)",
  "Telekomunikasi",
  "Alat Tulis Kantor, Perlengkapan & Furnitur",
  "Kendaraan & Transportasi",
  "Katering & Konsumsi",
  "Event Organizer, Percetakan & Media",
  "Peralatan Pengelolaan Uang (mesin hitung, sortir, khazanah)",
  "Asuransi & Jasa Keuangan",
  "Akomodasi (Hotel / Travel Agent)"
];
// Daftar keperluan kunjungan (sama dengan validation.js dan Code.gs).
const DAFTAR_KEPERLUAN = [
  "Pendaftaran Rekanan",
  "Verifikasi Dokumen",
  "Penambahan Akun Baru",
  "Tidak Bisa Login",
  "Memandu Pengadaan",
  "Mengambil Dokumen Kontrak",
  "Kembalikan Dokumen Kontrak",
  "Mengantar Bank Garansi",
  "Mengantar Dokumen"
];
// Daftar jabatan (sama dengan validation.js dan Code.gs).
const DAFTAR_JABATAN = [
  "Direktur / Pimpinan",
  "Manajer",
  "Staf",
  "Marketing / Sales",
  "Teknisi",
  "Kurir"
];
const AWALAN_LAINNYA = "Lainnya: ";

// ---------- Utilitas respons ----------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function gagal(status, message, code = "ERROR") {
  return json({ ok: false, code, message }, status);
}

// ---------- Rate limit sederhana per instance (lapis pertama) ----------
// Lapis kedua yang lebih kuat ada di Apps Script (CacheService).
const catatanRate = new Map();
function lewatBatas(kunci, maks, jendelaMs) {
  const kini = Date.now();
  const daftar = (catatanRate.get(kunci) || []).filter((t) => kini - t < jendelaMs);
  daftar.push(kini);
  catatanRate.set(kunci, daftar);
  if (catatanRate.size > 5000) catatanRate.clear();
  return daftar.length > maks;
}

// ---------- Kriptografi ----------
const enc = new TextEncoder();

function keHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, pesan) {
  const kunci = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return keHex(await crypto.subtle.sign("HMAC", kunci, enc.encode(pesan)));
}

async function sha256Hex(teks) {
  return keHex(await crypto.subtle.digest("SHA-256", enc.encode(teks)));
}

// ---------- Validasi (sama dengan validasi browser & Apps Script) ----------
function rapikan(teks) {
  return String(teks ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisasiWhatsApp(input) {
  let s = String(input ?? "").replace(/[\s\-().]/g, "");
  if (s.startsWith("+62")) s = s.slice(3);
  else if (s.startsWith("62")) s = s.slice(2);
  if (s.startsWith("0")) s = s.slice(1);
  if (!/^8[1-9]\d{7,10}$/.test(s)) return null;
  return "+62" + s;
}

function waktuWajar(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Math.abs(Date.now() - t) < 24 * 60 * 60 * 1000;
}

function angkaDalamRentang(n, min, max) {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

// Nilai sah: salah satu isi daftar, atau "Lainnya: <isian 2-80 karakter>".
function normalisasiPilihan(daftar, input) {
  const s = rapikan(input);
  if (daftar.includes(s)) return s;
  if (s.startsWith(AWALAN_LAINNYA)) {
    const isi = s.slice(AWALAN_LAINNYA.length).trim();
    if (isi.length >= 2 && isi.length <= 80 && POLA_PERUSAHAAN.test(isi)) return AWALAN_LAINNYA + isi;
  }
  return null;
}

function validasiSubmit(b) {
  if (!b || typeof b !== "object") return { error: "Data registrasi tidak valid." };

  if (!POLA_IDEMPOTENCY.test(String(b.idempotencyKey || ""))) return { error: "Data registrasi tidak valid." };

  const nama = rapikan(b.nama);
  if (nama.length < 3 || nama.length > 100 || !POLA_NAMA.test(nama)) {
    return { error: "Nama lengkap tidak valid." };
  }
  const perusahaan = rapikan(b.perusahaan).toUpperCase(); // disimpan dalam huruf kapital
  if (perusahaan.length < 2 || perusahaan.length > 120 || !POLA_PERUSAHAAN.test(perusahaan)) {
    return { error: "Nama perusahaan tidak valid." };
  }
  const jabatan = normalisasiPilihan(DAFTAR_JABATAN, b.jabatan);
  if (!jabatan) return { error: "Jabatan tidak valid. Muat ulang halaman, lalu pilih kembali." };
  const bidangUsaha = normalisasiPilihan(DAFTAR_BIDANG_USAHA, b.bidangUsaha);
  if (!bidangUsaha) return { error: "Bidang usaha tidak valid. Muat ulang halaman, lalu pilih kembali." };
  const whatsapp = normalisasiWhatsApp(b.whatsapp);
  if (!whatsapp) return { error: "Nomor WhatsApp tidak valid." };
  const keperluan = normalisasiPilihan(DAFTAR_KEPERLUAN, b.keperluan);
  if (!keperluan) return { error: "Keperluan tidak valid. Muat ulang halaman, lalu pilih kembali." };

  if (!waktuWajar(b.waktuMulaiIsi)) return { error: "Waktu pengisian tidak valid. Muat ulang halaman, lalu coba kembali." };

  const l = b.lokasi || {};
  if (!angkaDalamRentang(l.latitude, -90, 90) || !angkaDalamRentang(l.longitude, -180, 180) ||
      !angkaDalamRentang(l.akurasi, 0, 100000)) {
    return { error: "Data lokasi tidak valid. Aktifkan ulang lokasi Anda." };
  }
  const alamat = l.alamat ? rapikan(l.alamat).slice(0, 300) : null;
  const waktuLokasi = waktuWajar(l.waktuLokasi) ? l.waktuLokasi : null;

  const f = b.foto || {};
  if (typeof f.base64 !== "string" || f.base64.length < 1000 || f.base64.length > BATAS_FOTO_BASE64 ||
      !f.base64.startsWith("/9j/")) { // tanda awal file JPEG dalam base64
    return { error: "Foto tidak valid. Silakan ambil ulang foto." };
  }
  if (!waktuWajar(f.waktuFoto)) return { error: "Waktu foto tidak valid. Silakan ambil ulang foto." };

  return {
    data: {
      idempotencyKey: b.idempotencyKey,
      nama,
      perusahaan,
      jabatan,
      bidangUsaha,
      whatsapp,
      keperluan,
      waktuMulaiIsi: b.waktuMulaiIsi,
      versiDisclaimer: VERSI_DISCLAIMER,
      lokasi: {
        latitude: Number(l.latitude.toFixed(6)),
        longitude: Number(l.longitude.toFixed(6)),
        akurasi: Math.round(l.akurasi),
        alamat,
        waktuLokasi
      },
      foto: { base64: f.base64, waktuFoto: f.waktuFoto }
    }
  };
}

// ---------- Pemeriksaan permintaan ----------
function originSah(request, url) {
  return request.headers.get("Origin") === url.origin;
}

function ipKlien(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

async function bacaJson(request, batas) {
  const panjang = Number(request.headers.get("Content-Length") || 0);
  if (panjang > batas) return { terlaluBesar: true };
  const teks = await request.text();
  if (teks.length > batas) return { terlaluBesar: true };
  try {
    return { data: JSON.parse(teks) };
  } catch {
    return { data: null };
  }
}

async function verifikasiTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true; // Turnstile tidak diaktifkan
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(10000)
  });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
}

// ---------- Panggilan ke Google Apps Script (ditandatangani HMAC) ----------
async function panggilGAS(env, action, data) {
  const payload = JSON.stringify({ action, data });
  const ts = Date.now().toString();
  const sig = await hmacHex(env.GAS_SECRET, ts + "." + payload);
  const resp = await fetch(env.GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ts, sig, payload }),
    redirect: "follow",
    signal: AbortSignal.timeout(50000)
  });
  const teks = await resp.text();
  try {
    return JSON.parse(teks);
  } catch {
    throw new Error("Respons Apps Script bukan JSON (HTTP " + resp.status + ")");
  }
}

function backendTerkonfigurasi(env) {
  return Boolean(env.GAS_URL && env.GAS_SECRET);
}

// ---------- Handler ----------
function handleConfig(env) {
  return json({
    ok: true,
    serverTime: new Date().toISOString(),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    backendSiap: backendTerkonfigurasi(env)
  });
}

async function handleGeocode(request, env, url) {
  if (!originSah(request, url)) return gagal(403, "Permintaan tidak diizinkan.", "FORBIDDEN");
  const ip = ipKlien(request);
  if (lewatBatas("geo:" + ip, 30, 10 * 60 * 1000)) return json({ ok: true, alamat: null });

  const { data, terlaluBesar } = await bacaJson(request, 2000);
  if (terlaluBesar || !data) return gagal(400, "Data tidak valid.", "VALIDATION");
  const lat = data.latitude;
  const lng = data.longitude;
  if (!angkaDalamRentang(lat, -90, 90) || !angkaDalamRentang(lng, -180, 180)) {
    return gagal(400, "Koordinat tidak valid.", "VALIDATION");
  }
  if (!backendTerkonfigurasi(env)) return json({ ok: true, alamat: null });

  try {
    const ipHash = (await sha256Hex(ip + "|" + env.GAS_SECRET)).slice(0, 24);
    const hasil = await panggilGAS(env, "geocode", { latitude: lat, longitude: lng, ipHash });
    return json({ ok: true, alamat: (hasil && hasil.ok && hasil.alamat) || null });
  } catch (e) {
    console.error("geocode gagal:", e.message);
    return json({ ok: true, alamat: null });
  }
}

async function handleSubmit(request, env, url) {
  if (!originSah(request, url)) return gagal(403, "Permintaan tidak diizinkan.", "FORBIDDEN");
  if (!backendTerkonfigurasi(env)) {
    return gagal(503, "Layanan registrasi belum siap. Silakan hubungi petugas.", "NOT_CONFIGURED");
  }

  const ip = ipKlien(request);
  if (lewatBatas("submit:" + ip, 10, 10 * 60 * 1000)) {
    return gagal(429, "Terlalu banyak percobaan. Silakan tunggu beberapa menit, lalu coba kembali.", "RATE_LIMIT");
  }

  const { data, terlaluBesar } = await bacaJson(request, BATAS_BODY_SUBMIT);
  if (terlaluBesar) return gagal(413, "Ukuran foto terlalu besar. Silakan ambil ulang foto.", "TOO_LARGE");
  if (!data) return gagal(400, "Data registrasi tidak valid.", "VALIDATION");

  const hasilValidasi = validasiSubmit(data);
  if (hasilValidasi.error) return gagal(400, hasilValidasi.error, "VALIDATION");

  const lolosTurnstile = await verifikasiTurnstile(env, data.turnstileToken, ip);
  if (!lolosTurnstile) {
    return gagal(403, "Verifikasi keamanan gagal. Silakan tunggu verifikasi selesai, lalu kirim kembali.", "TURNSTILE");
  }

  const ipHash = (await sha256Hex(ip + "|" + env.GAS_SECRET)).slice(0, 24);

  let hasil;
  try {
    hasil = await panggilGAS(env, "submit", { ...hasilValidasi.data, ipHash });
  } catch (e) {
    console.error("submit ke Apps Script gagal:", e.message);
    return gagal(502, "Server penyimpanan sedang tidak dapat dihubungi. Silakan coba kembali.", "UPSTREAM");
  }

  if (hasil && hasil.ok) {
    return json({ ok: true, registrationId: hasil.registrationId, waktuServer: hasil.waktuServer });
  }

  const peta = { VALIDATION: 400, RATE_LIMIT: 429, UNAUTHORIZED: 502, SERVICE_OFF: 503 };
  const status = peta[hasil && hasil.code] || 500;
  const pesan = (hasil && hasil.code !== "UNAUTHORIZED" && hasil.message) ||
    "Registrasi gagal diproses. Silakan coba kembali.";
  if (hasil && hasil.code === "UNAUTHORIZED") console.error("GAS menolak signature: periksa GAS_SECRET.");
  return gagal(status, pesan, (hasil && hasil.code) || "ERROR");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Selain /api/*, serahkan ke file statis (folder public/).
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      if (url.pathname === "/api/config" && request.method === "GET") return handleConfig(env);
      if (url.pathname === "/api/geocode" && request.method === "POST") return await handleGeocode(request, env, url);
      if (url.pathname === "/api/submit" && request.method === "POST") return await handleSubmit(request, env, url);
      return gagal(404, "Endpoint tidak ditemukan.", "NOT_FOUND");
    } catch (e) {
      console.error("Kesalahan tak terduga:", e && e.message);
      return gagal(500, "Terjadi kendala pada server. Silakan coba kembali.", "SERVER_ERROR");
    }
  }
};
