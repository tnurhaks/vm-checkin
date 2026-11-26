/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/validation.js
   Validasi dan normalisasi input di sisi browser.
   Catatan: validasi yang sama akan diulang di server (Phase 4),
   karena validasi browser dapat dilewati oleh pengguna.
   ========================================================= */
(function () {
  "use strict";

  function hasilOk(nilai) { return { valid: true, nilai: nilai, pesan: "" }; }
  function hasilGagal(pesan) { return { valid: false, nilai: "", pesan: pesan }; }

  // Merapikan teks: hapus karakter kontrol, satukan spasi ganda, hapus spasi di awal/akhir.
  function rapikan(teks) {
    return String(teks || "")
      .normalize("NFC")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Nama: diawali huruf; boleh huruf, spasi, titik, koma, apostrof, tanda hubung (untuk gelar).
  var POLA_NAMA = /^\p{L}[\p{L}\p{M}\s.,'\-]*$/u;

  function validasiNama(input) {
    var nilai = rapikan(input);
    if (!nilai) return hasilGagal("Nama lengkap wajib diisi");
    if (nilai.length < 3) return hasilGagal("Nama lengkap minimal 3 karakter");
    if (nilai.length > 100) return hasilGagal("Nama lengkap maksimal 100 karakter");
    if (!POLA_NAMA.test(nilai)) {
      return hasilGagal("Nama hanya boleh berisi huruf, spasi, titik, koma, apostrof, atau tanda hubung");
    }
    return hasilOk(nilai);
  }

  // Perusahaan: diawali huruf/angka; boleh huruf, angka, spasi, dan . , & ( ) ' / -
  var POLA_PERUSAHAAN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s.,&()'\/\-]*$/u;

  function validasiPerusahaan(input) {
    var nilai = rapikan(input).toUpperCase(); // nama perusahaan disimpan dalam huruf kapital
    if (!nilai) return hasilGagal("Nama perusahaan wajib diisi");
    if (nilai.length < 2) return hasilGagal("Nama perusahaan minimal 2 karakter");
    if (nilai.length > 120) return hasilGagal("Nama perusahaan maksimal 120 karakter");
    if (!POLA_PERUSAHAAN.test(nilai)) {
      return hasilGagal("Nama perusahaan mengandung karakter yang tidak diperbolehkan");
    }
    return hasilOk(nilai);
  }

  // Normalisasi nomor seluler Indonesia ke format +62.
  // Menerima: 0812..., 62812..., +62812..., 812... (dengan spasi/tanda hubung).
  // Mengembalikan null apabila tidak valid.
  function normalisasiWhatsApp(input) {
    var s = String(input || "").replace(/[\s\-().]/g, "");
    if (s.indexOf("+62") === 0) s = s.slice(3);
    else if (s.indexOf("62") === 0) s = s.slice(2);
    if (s.indexOf("0") === 0) s = s.slice(1);
    // Nomor seluler Indonesia: diawali 8, total 9 sampai 12 digit setelah kode negara.
    if (!/^8[1-9]\d{7,10}$/.test(s)) return null;
    return "+62" + s;
  }

  function validasiWhatsApp(input) {
    var mentah = String(input || "").trim();
    if (!mentah) return hasilGagal("Nomor WhatsApp wajib diisi");
    if (/[^\d+\s\-().]/.test(mentah)) return hasilGagal("Nomor WhatsApp hanya boleh berisi angka");
    var nilai = normalisasiWhatsApp(mentah);
    if (!nilai) {
      return hasilGagal("Nomor WhatsApp tidak valid. Gunakan nomor seluler Indonesia, contoh 0812 3456 7890");
    }
    return hasilOk(nilai);
  }

  // ---------- Pilihan dropdown (daftar tetap + "Lainnya") ----------
  // Daftar yang sama ada di src/worker.js dan apps-script/Code.gs.
  var DAFTAR_BIDANG_USAHA = [
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
  var DAFTAR_KEPERLUAN = [
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
  var DAFTAR_JABATAN = [
    "Direktur / Pimpinan",
    "Manajer",
    "Staf",
    "Marketing / Sales",
    "Teknisi",
    "Kurir"
  ];
  var PILIHAN_LAINNYA = "Lainnya";

  // Mengembalikan nilai yang disimpan: isi daftar, atau "Lainnya: <isian>".
  function validasiPilihan(daftar, label, pilihan, isianLainnya) {
    var p = String(pilihan || "");
    if (!p) return hasilGagal(label + " wajib dipilih");
    if (p === PILIHAN_LAINNYA) {
      var isi = rapikan(isianLainnya);
      if (!isi) return hasilGagal("Sebutkan " + label.toLowerCase() + " Anda");
      if (isi.length < 2) return hasilGagal(label + " minimal 2 karakter");
      if (isi.length > 80) return hasilGagal(label + " maksimal 80 karakter");
      if (!POLA_PERUSAHAAN.test(isi)) return hasilGagal(label + " mengandung karakter yang tidak diperbolehkan");
      return hasilOk(PILIHAN_LAINNYA + ": " + isi);
    }
    if (daftar.indexOf(p) === -1) return hasilGagal(label + " tidak valid");
    return hasilOk(p);
  }

  function validasiBidangUsaha(pilihan, isianLainnya) {
    return validasiPilihan(DAFTAR_BIDANG_USAHA, "Bidang usaha", pilihan, isianLainnya);
  }

  function validasiJabatan(pilihan, isianLainnya) {
    return validasiPilihan(DAFTAR_JABATAN, "Jabatan", pilihan, isianLainnya);
  }

  function validasiKeperluan(pilihan, isianLainnya) {
    return validasiPilihan(DAFTAR_KEPERLUAN, "Keperluan", pilihan, isianLainnya);
  }

  window.VMValidasi = {
    rapikan: rapikan,
    validasiNama: validasiNama,
    validasiPerusahaan: validasiPerusahaan,
    validasiWhatsApp: validasiWhatsApp,
    normalisasiWhatsApp: normalisasiWhatsApp,
    validasiBidangUsaha: validasiBidangUsaha,
    validasiKeperluan: validasiKeperluan,
    validasiJabatan: validasiJabatan,
    DAFTAR_JABATAN: DAFTAR_JABATAN,
    DAFTAR_BIDANG_USAHA: DAFTAR_BIDANG_USAHA,
    DAFTAR_KEPERLUAN: DAFTAR_KEPERLUAN,
    PILIHAN_LAINNYA: PILIHAN_LAINNYA
  };
})();
