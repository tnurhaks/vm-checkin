/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/app.js
   Pengendali utama halaman registrasi: state, validasi form,
   indikator langkah, tombol Submit, pencegahan kirim ganda,
   dan koordinasi modul lokasi, kamera, serta API.
   ========================================================= */
(function () {
  "use strict";

  var V = window.VMValidasi;
  var ZONA_WAKTU = "Asia/Jakarta";
  var VERSI_PERSETUJUAN = "1.0";

  var formatTanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: ZONA_WAKTU, day: "2-digit", month: "long", year: "numeric"
  });
  var formatWaktu = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_WAKTU, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });

  function $(id) { return document.getElementById(id); }

  function buatIdUnik() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  // ---------- State aplikasi ----------
  var state = {
    identitas: { nama: "", perusahaan: "", jabatan: "", bidangUsaha: "", whatsapp: "", keperluan: "", valid: false },
    lokasi: null,
    foto: null,
    persetujuan: false,
    waktuMulaiIsi: null,
    idempotencyKey: buatIdUnik(), // tetap sama saat kirim ulang, mencegah data ganda
    sedangMengirim: false,
    terkirim: false
  };

  // ---------- Jam WIB (disinkronkan dengan server) ----------
  function perbaruiJam() {
    var sekarang = window.VMApi.sekarang();
    $("tanggal-kunjungan").textContent = formatTanggal.format(sekarang);
    $("waktu-sekarang").textContent = formatWaktu.format(sekarang) + " WIB";
  }
  perbaruiJam();
  setInterval(perbaruiJam, 1000);

  // ---------- Dropdown dengan pilihan "Lainnya" (bidang usaha & keperluan) ----------
  var DROPDOWN = {
    jabatan:     { pilih: $("jabatan"),      isian: $("jabatan-lainnya"), daftar: V.DAFTAR_JABATAN },
    bidangUsaha: { pilih: $("bidang-usaha"), isian: $("bidang-lainnya"), daftar: V.DAFTAR_BIDANG_USAHA },
    keperluan:   { pilih: $("keperluan"),    isian: $("keperluan-lainnya"), daftar: V.DAFTAR_KEPERLUAN }
  };

  Object.keys(DROPDOWN).forEach(function (key) {
    var d = DROPDOWN[key];
    d.daftar.concat([V.PILIHAN_LAINNYA]).forEach(function (nama) {
      var opsi = document.createElement("option");
      opsi.value = nama;
      opsi.textContent = nama;
      d.pilih.appendChild(opsi);
    });
  });

  function aturIsianLainnya(key) {
    var d = DROPDOWN[key];
    var lainnya = d.pilih.value === V.PILIHAN_LAINNYA;
    d.isian.hidden = !lainnya;
    d.isian.required = lainnya;
    if (!lainnya) d.isian.value = "";
  }

  // ---------- Validasi identitas ----------
  var FIELD = {
    nama:        { input: $("nama"),       wadah: $("field-nama"),         error: $("nama-error"),         cek: V.validasiNama },
    perusahaan:  { input: $("perusahaan"), wadah: $("field-perusahaan"),   error: $("perusahaan-error"),   cek: V.validasiPerusahaan },
    jabatan:     { input: DROPDOWN.jabatan.pilih, wadah: $("field-jabatan"), error: $("jabatan-error"),
                   cek: function (nilai) { return V.validasiJabatan(nilai, DROPDOWN.jabatan.isian.value); } },
    bidangUsaha: { input: DROPDOWN.bidangUsaha.pilih, wadah: $("field-bidang-usaha"), error: $("bidang-usaha-error"),
                   cek: function (nilai) { return V.validasiBidangUsaha(nilai, DROPDOWN.bidangUsaha.isian.value); } },
    whatsapp:    { input: $("whatsapp"),   wadah: $("field-whatsapp"),     error: $("whatsapp-error"),     cek: V.validasiWhatsApp },
    keperluan:   { input: DROPDOWN.keperluan.pilih, wadah: $("field-keperluan"), error: $("keperluan-error"),
                   cek: function (nilai) { return V.validasiKeperluan(nilai, DROPDOWN.keperluan.isian.value); } }
  };
  var URUTAN_FIELD = ["nama", "perusahaan", "jabatan", "bidangUsaha", "whatsapp", "keperluan"];

  function tampilkanErrorField(key, pesan) {
    var f = FIELD[key];
    f.wadah.classList.add("has-error");
    f.error.textContent = pesan;
    f.error.hidden = false;
    f.input.setAttribute("aria-invalid", "true");
  }

  function hapusErrorField(key) {
    var f = FIELD[key];
    f.wadah.classList.remove("has-error");
    f.error.textContent = "";
    f.error.hidden = true;
    f.input.removeAttribute("aria-invalid");
  }

  function cekField(key, tampilkanError) {
    var f = FIELD[key];
    var hasil = f.cek(f.input.value);
    if (hasil.valid) {
      hapusErrorField(key);
      state.identitas[key] = hasil.nilai;
    } else {
      state.identitas[key] = "";
      if (tampilkanError) tampilkanErrorField(key, hasil.pesan);
    }
    if (key === "whatsapp") {
      var info = $("whatsapp-normal");
      info.hidden = !hasil.valid;
      info.textContent = hasil.valid ? "Akan disimpan sebagai " + hasil.nilai : "";
    }
    return hasil.valid;
  }

  function cekIdentitas(tampilkanError) {
    var semuaValid = true;
    URUTAN_FIELD.forEach(function (key) {
      if (!cekField(key, tampilkanError)) semuaValid = false;
    });
    state.identitas.valid = semuaValid;
    return semuaValid;
  }

  // Foto memuat nama & perusahaan di watermark. Jika data berubah, foto harus diambil ulang.
  function periksaKonsistensiFoto() {
    if (!state.foto) return;
    if (state.foto.nama !== state.identitas.nama || state.foto.perusahaan !== state.identitas.perusahaan) {
      resetFoto("Data identitas berubah setelah foto diambil. Silakan ambil ulang foto agar watermark sesuai.");
    }
  }

  function resetFoto(pesan) {
    state.foto = null;
    if (window.VMKamera) window.VMKamera.reset(pesan);
    perbaruiStatus();
  }

  URUTAN_FIELD.forEach(function (key) {
    var f = FIELD[key];

    f.input.addEventListener("input", function () {
      if (!state.waktuMulaiIsi) state.waktuMulaiIsi = window.VMApi.sekarang().toISOString();
      if (key === "whatsapp") {
        var bersih = f.input.value.replace(/[^\d+\s\-]/g, "");
        if (bersih !== f.input.value) f.input.value = bersih;
      }
      if (key === "perusahaan") {
        // Nama perusahaan otomatis huruf kapital; posisi kursor dipertahankan.
        var besar = f.input.value.toUpperCase();
        if (besar !== f.input.value) {
          var awal = f.input.selectionStart, akhir = f.input.selectionEnd;
          f.input.value = besar;
          try { f.input.setSelectionRange(awal, akhir); } catch (e) { /* abaikan */ }
        }
      }
      cekField(key, f.wadah.classList.contains("has-error"));
      perbaruiStatus();
    });

    f.input.addEventListener("blur", function () {
      var menungguIsianLainnya = DROPDOWN[key] && f.input.value === V.PILIHAN_LAINNYA;
      if (f.input.value.trim() !== "" && !menungguIsianLainnya) cekField(key, true);
      perbaruiStatus();
      periksaKonsistensiFoto();
    });
  });

  Object.keys(DROPDOWN).forEach(function (key) {
    var d = DROPDOWN[key];

    d.pilih.addEventListener("change", function () {
      if (!state.waktuMulaiIsi) state.waktuMulaiIsi = window.VMApi.sekarang().toISOString();
      aturIsianLainnya(key);
      // Pilihan dari daftar langsung dinilai; "Lainnya" baru dinilai setelah isian diketik.
      cekField(key, d.pilih.value !== V.PILIHAN_LAINNYA);
      perbaruiStatus();
      if (d.pilih.value === V.PILIHAN_LAINNYA) d.isian.focus();
    });

    d.isian.addEventListener("input", function () {
      cekField(key, FIELD[key].wadah.classList.contains("has-error"));
      perbaruiStatus();
    });

    d.isian.addEventListener("blur", function () {
      cekField(key, true);
      perbaruiStatus();
    });
  });

  $("persetujuan").addEventListener("change", function (e) {
    state.persetujuan = e.target.checked;
    perbaruiStatus();
  });

  // ---------- Indikator langkah & tombol Submit ----------
  function perbaruiStatus() {
    cekIdentitas(false);

    var selesai = {
      "1": state.identitas.valid,
      "2": !!state.lokasi,
      "3": !!state.foto,
      "4": state.persetujuan
    };

    var aktifSudahDitetapkan = false;
    Array.prototype.forEach.call(document.querySelectorAll(".step"), function (el) {
      var nomor = el.getAttribute("data-step");
      el.classList.remove("is-active");
      el.classList.remove("is-done");
      if (selesai[nomor]) {
        el.classList.add("is-done");
      } else if (!aktifSudahDitetapkan) {
        el.classList.add("is-active");
        aktifSudahDitetapkan = true;
      }
    });

    $("kartu-identitas").classList.toggle("is-done", selesai["1"]);
    $("kartu-lokasi").classList.toggle("is-done", selesai["2"]);
    $("kartu-foto").classList.toggle("is-done", selesai["3"]);
    $("kartu-persetujuan").classList.toggle("is-done", selesai["4"]);

    if (window.VMKamera) window.VMKamera.setSiap(selesai["1"] && selesai["2"]);

    var kurang = [];
    if (!selesai["1"]) kurang.push("Identitas");
    if (!selesai["2"]) kurang.push("Lokasi");
    if (!selesai["3"]) kurang.push("Foto");
    if (!selesai["4"]) kurang.push("Persetujuan");

    var menungguVerifikasi = window.VMApi.perluVerifikasi() && !window.VMApi.tokenTersedia();
    var layananSiap = window.VMApi.backendSiap();
    var siap = kurang.length === 0 && !menungguVerifikasi && layananSiap;

    $("btn-submit").disabled = !siap || state.sedangMengirim || state.terkirim;
    if (!layananSiap) {
      $("submit-hint").textContent = "Layanan registrasi belum siap. Silakan hubungi petugas.";
    } else if (kurang.length > 0) {
      $("submit-hint").textContent = "Belum lengkap: " + kurang.join(", ") + ".";
    } else if (menungguVerifikasi) {
      $("submit-hint").textContent = "Menunggu verifikasi keamanan selesai.";
    } else {
      $("submit-hint").textContent = "Seluruh langkah telah lengkap. Silakan kirim registrasi.";
    }
    return siap;
  }

  // ---------- Pengiriman ----------
  $("form-registrasi").addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.sedangMengirim || state.terkirim) return; // cegah kirim ganda

    var identitasValid = cekIdentitas(true);
    var siap = perbaruiStatus();
    if (!siap) {
      if (!identitasValid) {
        var pertama = URUTAN_FIELD.filter(function (k) { return FIELD[k].wadah.classList.contains("has-error"); })[0];
        if (pertama) FIELD[pertama].input.focus();
      }
      return;
    }
    kirim();
  });

  function susunPayload() {
    return {
      idempotencyKey: state.idempotencyKey,
      nama: state.identitas.nama,
      perusahaan: state.identitas.perusahaan,
      jabatan: state.identitas.jabatan,
      bidangUsaha: state.identitas.bidangUsaha,
      whatsapp: state.identitas.whatsapp,
      keperluan: state.identitas.keperluan,
      waktuMulaiIsi: state.waktuMulaiIsi || window.VMApi.sekarang().toISOString(),
      persetujuan: state.persetujuan === true,
      versiPersetujuan: VERSI_PERSETUJUAN,
      lokasi: {
        latitude: state.lokasi.latitude,
        longitude: state.lokasi.longitude,
        akurasi: state.lokasi.akurasi,
        alamat: state.lokasi.alamat || null,
        waktuLokasi: state.lokasi.waktuLokasi
      },
      foto: {
        base64: state.foto.base64,
        waktuFoto: state.foto.waktuFoto
      }
    };
  }

  function kirim() {
    state.sedangMengirim = true;
    $("btn-submit").disabled = true;
    $("btn-submit").textContent = "Mengirim...";
    $("pesan-error").hidden = true;
    $("loading").hidden = false;

    window.VMApi.kirimRegistrasi(susunPayload())
      .then(function (hasil) {
        state.terkirim = true;
        tampilkanSukses(hasil);
      })
      .catch(function (err) {
        tampilkanErrorKirim(err && err.pesan ? err.pesan : "Terjadi kendala koneksi. Silakan coba kembali.");
      })
      .finally(function () {
        state.sedangMengirim = false;
        $("loading").hidden = true;
        $("btn-submit").textContent = "Kirim Registrasi";
        perbaruiStatus();
      });
  }

  function tampilkanSukses(hasil) {
    var waktu = hasil && hasil.waktuServer ? new Date(hasil.waktuServer) : window.VMApi.sekarang();
    $("sukses-id").textContent = (hasil && hasil.registrationId) || "-";
    $("sukses-nama").textContent = state.identitas.nama;
    $("sukses-perusahaan").textContent = state.identitas.perusahaan;
    $("sukses-jabatan").textContent = state.identitas.jabatan;
    $("sukses-bidang-usaha").textContent = state.identitas.bidangUsaha;
    $("sukses-whatsapp").textContent = state.identitas.whatsapp;
    $("sukses-keperluan").textContent = state.identitas.keperluan;
    $("sukses-waktu").textContent = formatTanggal.format(waktu) + ", " + formatWaktu.format(waktu) + " WIB";
    $("halaman-form").hidden = true;
    $("halaman-sukses").hidden = false;
    state.foto = null; // lepaskan data foto dari memori
    window.scrollTo(0, 0);
  }

  function tampilkanErrorKirim(pesan) {
    $("pesan-error-teks").textContent = pesan;
    $("pesan-error").hidden = false;
    $("pesan-error").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Antarmuka untuk modul lain ----------
  window.VMApp = {
    setLokasi: function (data) {
      var lama = state.lokasi;
      state.lokasi = data || null;
      var berpindah = state.foto && (!data || !lama ||
        data.latitude !== lama.latitude || data.longitude !== lama.longitude);
      if (berpindah) {
        resetFoto("Lokasi diperbarui setelah foto diambil. Silakan ambil ulang foto agar watermark sesuai.");
        return;
      }
      perbaruiStatus();
    },
    setFoto: function (data) { state.foto = data || null; perbaruiStatus(); },
    getIdentitas: function () { return { nama: state.identitas.nama, perusahaan: state.identitas.perusahaan }; },
    getLokasi: function () { return state.lokasi; },
    perbaruiStatus: perbaruiStatus
  };

  perbaruiStatus();
})();
