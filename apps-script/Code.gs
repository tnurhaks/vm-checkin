/* =========================================================
   Vendor Management - Visitor Check-in
   File: Code.gs  (Google Apps Script)

   CARA PAKAI SINGKAT:
   1. Tempel seluruh isi file ini ke editor Apps Script.
   2. Jalankan fungsi setup() satu kali (pilih "setup" lalu klik Run).
      setup() membuat spreadsheet, folder Drive, secret, dan trigger retensi.
   3. Salin SHARED_SECRET dari Execution log ke Cloudflare (GAS_SECRET).
   4. Deploy sebagai Web app: Execute as "Me", Who has access "Anyone".
   ========================================================= */

var NAMA_SPREADSHEET = "Database Kehadiran Vendor Management";
var NAMA_FOLDER_UTAMA = "Vendor Management Check-in";
var NAMA_FOLDER_FOTO = "Photos";
var ZONA = "Asia/Jakarta";
var VERSI_PERSETUJUAN = "1.0";

var SHEET_REGISTRASI = "Registrasi";
var SHEET_PENGATURAN = "Pengaturan";
var SHEET_LOG = "Log";

var HEADER = [
  "Registration ID",
  "Tanggal Kunjungan",
  "Waktu Pengisian Form",
  "Waktu Pengambilan Foto",
  "Waktu Submit Server",
  "Nama Lengkap",
  "Nama Perusahaan",
  "Nomor WhatsApp",
  "Latitude",
  "Longitude",
  "Akurasi GPS",
  "Alamat Lokasi",
  "Google Maps URL",
  "Google Drive Photo URL",
  "Persetujuan Pemrosesan Data",
  "Status Registrasi"
];

var BATAS_UMUR_PERMINTAAN_MS = 5 * 60 * 1000; // signature berlaku 5 menit
var BATAS_FOTO_BYTE = 1.5 * 1024 * 1024;

var POLA_NAMA = /^\p{L}[\p{L}\p{M}\s.,'\-]*$/u;
var POLA_PERUSAHAAN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s.,&()'\/\-]*$/u;
var POLA_IDEMPOTENCY = /^[A-Za-z0-9-]{16,64}$/;

/* =========================================================
   1. SETUP (jalankan sekali)
   ========================================================= */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // --- Folder Drive (privat) ---
  var folderUtama = ambilFolderDariProperti_("FOLDER_UTAMA_ID") || DriveApp.createFolder(NAMA_FOLDER_UTAMA);
  props.setProperty("FOLDER_UTAMA_ID", folderUtama.getId());
  var folderFoto = ambilFolderDariProperti_("FOLDER_FOTO_ID") || folderUtama.createFolder(NAMA_FOLDER_FOTO);
  props.setProperty("FOLDER_FOTO_ID", folderFoto.getId());
  try {
    folderUtama.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    folderFoto.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) { /* akun tertentu tidak mengizinkan setSharing; folder baru tetap privat secara default */ }

  // --- Spreadsheet ---
  var ss;
  var ssId = props.getProperty("SPREADSHEET_ID");
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create(NAMA_SPREADSHEET);
    props.setProperty("SPREADSHEET_ID", ss.getId());
    DriveApp.getFileById(ss.getId()).moveTo(folderUtama);
  }
  ss.setSpreadsheetTimeZone(ZONA);

  // Sheet Registrasi
  var sh = ss.getSheetByName(SHEET_REGISTRASI);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(SHEET_REGISTRASI);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER])
      .setFontWeight("bold").setBackground("#123354").setFontColor("#FFFFFF").setWrap(true);
    sh.setFrozenRows(1);
    sh.getRange("B2:B").setNumberFormat("yyyy-mm-dd");
    sh.getRange("C2:E").setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sh.getRange("I2:J").setNumberFormat("0.000000");
    sh.getRange("K2:K").setNumberFormat("0");
    sh.setColumnWidths(1, HEADER.length, 160);
  }

  // Sheet Pengaturan (dapat diubah administrator)
  var shP = ss.getSheetByName(SHEET_PENGATURAN) || ss.insertSheet(SHEET_PENGATURAN);
  if (shP.getLastRow() === 0) {
    shP.getRange(1, 1, 4, 3).setValues([
      ["Parameter", "Nilai", "Keterangan"],
      ["RETENTION_DAYS", 365, "Lama penyimpanan data (hari). Data lebih lama dianonimkan dan fotonya dihapus. Isi 0 untuk menonaktifkan."],
      ["BATAS_REGISTRASI_PER_10_MENIT", 10, "Batas registrasi dari satu jaringan dalam 10 menit."],
      ["STATUS_LAYANAN", "AKTIF", "Isi NONAKTIF untuk menutup sementara registrasi."]
    ]);
    shP.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#123354").setFontColor("#FFFFFF");
    shP.setColumnWidth(1, 260);
    shP.setColumnWidth(3, 520);
  }

  // Sheet Log (tanpa data pribadi)
  var shL = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  if (shL.getLastRow() === 0) {
    shL.getRange(1, 1, 1, 3).setValues([["Waktu", "Jenis", "Keterangan"]])
      .setFontWeight("bold").setBackground("#123354").setFontColor("#FFFFFF");
    shL.setColumnWidth(3, 600);
  }

  // --- Secret bersama dengan Cloudflare ---
  var secret = props.getProperty("SHARED_SECRET");
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty("SHARED_SECRET", secret);
  }

  // --- Trigger retensi harian (pukul 02.00 WIB) ---
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "hapusDataKedaluwarsa") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("hapusDataKedaluwarsa").timeBased().everyDays(1).atHour(2).create();

  // Uji layanan Maps agar izin ikut diminta sekarang.
  try { Maps.newGeocoder().setLanguage("id").reverseGeocode(-6.2, 106.8); } catch (e) { /* abaikan */ }

  Logger.log("=== SETUP SELESAI ===");
  Logger.log("Spreadsheet : " + ss.getUrl());
  Logger.log("Folder foto : " + folderFoto.getUrl());
  Logger.log("SHARED_SECRET (salin ke Cloudflare sebagai GAS_SECRET):");
  Logger.log(secret);
}

function ambilFolderDariProperti_(nama) {
  var id = PropertiesService.getScriptProperties().getProperty(nama);
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

/** Menampilkan ulang secret jika lupa menyalin. */
function tampilkanSecret() {
  Logger.log(PropertiesService.getScriptProperties().getProperty("SHARED_SECRET"));
}

/** Mengganti secret (lakukan jika secret diduga bocor, lalu perbarui GAS_SECRET di Cloudflare). */
function gantiSecret() {
  var baru = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("SHARED_SECRET", baru);
  Logger.log("SHARED_SECRET baru: " + baru);
}

/* =========================================================
   2. ENDPOINT WEB APP
   ========================================================= */
function doGet() {
  return ContentService.createTextOutput("Layanan aktif.");
}

function doPost(e) {
  try {
    var mentah = e && e.postData && e.postData.contents;
    if (!mentah) return balas_({ ok: false, code: "BAD_REQUEST", message: "Permintaan tidak valid." });

    var amplop = JSON.parse(mentah);
    if (!verifikasiSignature_(amplop)) {
      catatLog_("KEAMANAN", "Signature tidak valid atau kedaluwarsa.");
      return balas_({ ok: false, code: "UNAUTHORIZED", message: "Permintaan tidak sah." });
    }

    var isi = JSON.parse(amplop.payload);
    if (isi.action === "submit") return balas_(prosesSubmit_(isi.data || {}));
    if (isi.action === "geocode") return balas_(prosesGeocode_(isi.data || {}));
    if (isi.action === "ping") return balas_({ ok: true });
    return balas_({ ok: false, code: "BAD_REQUEST", message: "Aksi tidak dikenal." });
  } catch (err) {
    catatLog_("ERROR", String((err && err.message) || err).slice(0, 300));
    return balas_({ ok: false, code: "SERVER_ERROR", message: "Terjadi kendala pada server. Silakan coba kembali." });
  }
}

function balas_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   3. KEAMANAN: HMAC-SHA256 + anti-replay
   ========================================================= */
function verifikasiSignature_(amplop) {
  if (!amplop || typeof amplop.ts !== "string" || typeof amplop.sig !== "string" || typeof amplop.payload !== "string") {
    return false;
  }
  var ts = Number(amplop.ts);
  if (!isFinite(ts) || Math.abs(Date.now() - ts) > BATAS_UMUR_PERMINTAAN_MS) return false;

  var secret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!secret) return false;

  var bytes = Utilities.computeHmacSha256Signature(amplop.ts + "." + amplop.payload, secret, Utilities.Charset.UTF_8);
  var diharapkan = bytes.map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
  if (!samaAman_(diharapkan, amplop.sig.toLowerCase())) return false;

  // Tolak permintaan yang sama dikirim ulang (replay).
  var cache = CacheService.getScriptCache();
  var kunci = "sig_" + amplop.sig.slice(0, 64);
  if (cache.get(kunci)) return false;
  cache.put(kunci, "1", 600);
  return true;
}

function samaAman_(a, b) {
  if (a.length !== b.length) return false;
  var beda = 0;
  for (var i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

/* =========================================================
   4. REVERSE GEOCODING
   ========================================================= */
function prosesGeocode_(d) {
  var lat = Number(d.latitude);
  var lng = Number(d.longitude);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, code: "VALIDATION", message: "Koordinat tidak valid." };
  }
  var cache = CacheService.getScriptCache();
  if (d.ipHash && !izinkanRate_("geo_" + d.ipHash, 30)) return { ok: true, alamat: null };

  var kunci = "geo_" + lat.toFixed(4) + "_" + lng.toFixed(4);
  var tersimpan = cache.get(kunci);
  if (tersimpan) return { ok: true, alamat: tersimpan };

  try {
    var hasil = Maps.newGeocoder().setLanguage("id").setRegion("id").reverseGeocode(lat, lng);
    var alamat = hasil && hasil.results && hasil.results[0] && hasil.results[0].formatted_address;
    if (alamat) {
      alamat = String(alamat).slice(0, 300);
      cache.put(kunci, alamat, 21600);
      return { ok: true, alamat: alamat };
    }
  } catch (e) {
    catatLog_("GEOCODE", String(e && e.message || e).slice(0, 200));
  }
  return { ok: true, alamat: null };
}

/* =========================================================
   5. SIMPAN REGISTRASI
   ========================================================= */
function prosesSubmit_(d) {
  var pengaturan = bacaPengaturan_();
  if (String(pengaturan.STATUS_LAYANAN || "AKTIF").toUpperCase() !== "AKTIF") {
    return { ok: false, code: "SERVICE_OFF", message: "Registrasi sedang ditutup sementara. Silakan hubungi petugas." };
  }

  // Validasi ulang di server.
  var v = validasi_(d);
  if (v.error) return { ok: false, code: "VALIDATION", message: v.error };

  var cache = CacheService.getScriptCache();
  var kunciIdem = "idem_" + d.idempotencyKey;
  var sebelumnya = cache.get(kunciIdem);
  if (sebelumnya) return JSON.parse(sebelumnya); // kiriman ulang: kembalikan hasil yang sama

  var batas = Number(pengaturan.BATAS_REGISTRASI_PER_10_MENIT) || 10;
  if (d.ipHash && !izinkanRate_("sub_" + d.ipHash, batas)) {
    return { ok: false, code: "RATE_LIMIT", message: "Terlalu banyak percobaan. Silakan tunggu beberapa menit, lalu coba kembali." };
  }

  // Validasi file foto.
  var bytes;
  try { bytes = Utilities.base64Decode(d.foto.base64); } catch (e) { bytes = null; }
  if (!bytes || bytes.length < 1000 || bytes.length > BATAS_FOTO_BYTE) {
    return { ok: false, code: "VALIDATION", message: "Ukuran foto tidak valid. Silakan ambil ulang foto." };
  }
  if (!(bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1)) { // FF D8 FF = JPEG
    return { ok: false, code: "VALIDATION", message: "Format foto tidak valid. Silakan ambil ulang foto." };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sebelumnya = cache.get(kunciIdem);
    if (sebelumnya) return JSON.parse(sebelumnya);

    var kini = new Date();
    var id = buatRegistrationId_(kini);

    // Simpan foto: Photos/YYYY/MM/YYYYMMDD_HHMMSS_ID.jpg (privat)
    var folderFoto = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_FOTO_ID"));
    var folderTahun = ambilAtauBuatFolder_(folderFoto, Utilities.formatDate(kini, ZONA, "yyyy"));
    var folderBulan = ambilAtauBuatFolder_(folderTahun, Utilities.formatDate(kini, ZONA, "MM"));
    var namaFile = Utilities.formatDate(kini, ZONA, "yyyyMMdd_HHmmss") + "_" + id + ".jpg";
    var file = folderBulan.createFile(Utilities.newBlob(bytes, "image/jpeg", namaFile));

    var l = v.data.lokasi;
    var mapsUrl = "https://www.google.com/maps?q=" + l.latitude + "," + l.longitude;

    var baris = [
      id,
      Utilities.formatDate(kini, ZONA, "yyyy-MM-dd"),
      formatWIB_(v.data.waktuMulaiIsi),
      formatWIB_(v.data.waktuFoto),
      Utilities.formatDate(kini, ZONA, "yyyy-MM-dd HH:mm:ss"),
      teksAman_(v.data.nama),
      teksAman_(v.data.perusahaan),
      "'" + v.data.whatsapp, // apostrof: simpan sebagai teks, tanda + tidak hilang
      l.latitude,
      l.longitude,
      l.akurasi,
      teksAman_(l.alamat || "Tidak tersedia (koordinat GPS digunakan)"),
      mapsUrl,
      file.getUrl(),
      "Ya (versi " + VERSI_PERSETUJUAN + ")",
      "Berhasil"
    ];
    bukaSheet_(SHEET_REGISTRASI).appendRow(baris);

    var hasil = { ok: true, registrationId: id, waktuServer: kini.toISOString() };
    cache.put(kunciIdem, JSON.stringify(hasil), 21600);
    return hasil;
  } finally {
    lock.releaseLock();
  }
}

function validasi_(d) {
  if (!POLA_IDEMPOTENCY.test(String(d.idempotencyKey || ""))) return { error: "Data registrasi tidak valid." };
  var nama = rapikan_(d.nama);
  if (nama.length < 3 || nama.length > 100 || !POLA_NAMA.test(nama)) return { error: "Nama lengkap tidak valid." };
  var perusahaan = rapikan_(d.perusahaan);
  if (perusahaan.length < 2 || perusahaan.length > 120 || !POLA_PERUSAHAAN.test(perusahaan)) {
    return { error: "Nama perusahaan tidak valid." };
  }
  var wa = String(d.whatsapp || "");
  if (!/^\+628[1-9]\d{7,10}$/.test(wa)) return { error: "Nomor WhatsApp tidak valid." };
  if (d.persetujuan !== true) return { error: "Persetujuan pemrosesan data wajib diberikan." };

  var l = d.lokasi || {};
  var lat = Number(l.latitude), lng = Number(l.longitude), ak = Number(l.akurasi);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !isFinite(ak) || ak < 0) {
    return { error: "Data lokasi tidak valid." };
  }
  if (!d.foto || typeof d.foto.base64 !== "string") return { error: "Foto tidak valid." };

  return {
    data: {
      nama: nama,
      perusahaan: perusahaan,
      whatsapp: wa,
      waktuMulaiIsi: d.waktuMulaiIsi,
      waktuFoto: d.foto.waktuFoto,
      lokasi: {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        akurasi: Math.round(ak),
        alamat: l.alamat ? rapikan_(l.alamat).slice(0, 300) : null
      }
    }
  };
}

/* =========================================================
   6. RETENSI DATA (trigger harian)
   Data lebih lama dari RETENTION_DAYS dianonimkan dan fotonya
   dipindahkan ke Trash Google Drive (terhapus permanen setelah 30 hari).
   ========================================================= */
function hapusDataKedaluwarsa() {
  var hari = Number(bacaPengaturan_().RETENTION_DAYS);
  if (!hari || hari <= 0) return;

  var sh = bukaSheet_(SHEET_REGISTRASI);
  var jumlahBaris = sh.getLastRow() - 1;
  if (jumlahBaris <= 0) return;

  var batas = new Date(Date.now() - hari * 24 * 60 * 60 * 1000);
  var data = sh.getRange(2, 1, jumlahBaris, HEADER.length).getValues();
  var diproses = 0;

  for (var i = 0; i < data.length && diproses < 500; i++) {
    var baris = data[i];
    if (baris[15] !== "Berhasil") continue;
    var waktu = baris[4] instanceof Date ? baris[4] : new Date(String(baris[4]).replace(" ", "T") + "+07:00");
    if (isNaN(waktu.getTime()) || waktu >= batas) continue;

    var idFoto = (String(baris[13]).match(/[-\w]{25,}/) || [])[0];
    if (idFoto) {
      try { DriveApp.getFileById(idFoto).setTrashed(true); } catch (e) { /* file sudah tidak ada */ }
    }
    // Kolom F sampai N dianonimkan, kolom P diberi status.
    sh.getRange(i + 2, 6, 1, 9).setValues([[
      "[dihapus]", "[dihapus]", "[dihapus]", "", "", "", "[dihapus]", "[dihapus]", "[dihapus]"
    ]]);
    sh.getRange(i + 2, 16).setValue("Dihapus (Retensi)");
    diproses++;
  }
  if (diproses > 0) catatLog_("RETENSI", diproses + " data melewati " + hari + " hari telah dianonimkan.");
}

/* =========================================================
   7. UTILITAS
   ========================================================= */
function bukaSheet_(nama) {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  return SpreadsheetApp.openById(id).getSheetByName(nama);
}

function bacaPengaturan_() {
  var cache = CacheService.getScriptCache();
  var tersimpan = cache.get("pengaturan");
  if (tersimpan) return JSON.parse(tersimpan);
  var hasil = {};
  var sh = bukaSheet_(SHEET_PENGATURAN);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) hasil[String(r[0]).trim()] = r[1];
    });
  }
  cache.put("pengaturan", JSON.stringify(hasil), 300); // perubahan berlaku maks. 5 menit
  return hasil;
}

function izinkanRate_(kunci, maks) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(kunci) || 0);
  if (n >= maks) return false;
  cache.put(kunci, String(n + 1), 600);
  return true;
}

function ambilAtauBuatFolder_(induk, nama) {
  var it = induk.getFoldersByName(nama);
  return it.hasNext() ? it.next() : induk.createFolder(nama);
}

function buatRegistrationId_(tanggal) {
  var huruf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa O/0/I/1 agar mudah dibaca
  var acak = "";
  for (var i = 0; i < 6; i++) acak += huruf.charAt(Math.floor(Math.random() * huruf.length));
  return "VM-" + Utilities.formatDate(tanggal, ZONA, "yyyyMMdd") + "-" + acak;
}

function formatWIB_(iso) {
  var t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  return Utilities.formatDate(t, ZONA, "yyyy-MM-dd HH:mm:ss");
}

function rapikan_(teks) {
  return String(teks == null ? "" : teks)
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Mencegah spreadsheet formula injection.
function teksAman_(teks) {
  var s = String(teks == null ? "" : teks);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function catatLog_(jenis, keterangan) {
  try {
    bukaSheet_(SHEET_LOG).appendRow([Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm:ss"), jenis, keterangan]);
  } catch (e) { /* abaikan kegagalan log */ }
}
