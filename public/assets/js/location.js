/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/location.js
   Tahap 3.1: pengambilan lokasi GPS melalui Geolocation API.
   - Mengambil beberapa pembacaan selama maks. 10 detik dan memakai yang paling akurat.
   - Menangani izin ditolak, GPS mati, dan waktu habis.
   - Alamat (reverse geocoding) diambil dari server mulai Phase 4;
     sebelum itu koordinat GPS dipakai sebagai lokasi (fallback).
   ========================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var AKURASI_BAIK = 30;        // meter: berhenti lebih cepat jika sudah sebaik ini
  var AKURASI_RENDAH = 100;     // meter: di atas ini tampilkan catatan akurasi rendah
  var DURASI_PENYEMPURNAAN = 10000; // ms: lama maksimal menyempurnakan akurasi
  var BATAS_TANPA_SINYAL = 20000;   // ms: dianggap gagal jika belum ada pembacaan sama sekali

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var sedangMencari = false;
  var tombol = $("btn-lokasi");

  function setStatus(kondisi, teks) {
    $("status-lokasi").setAttribute("data-state", kondisi);
    $("status-lokasi-teks").textContent = teks;
  }

  function setCatatan(teks) {
    var el = $("lokasi-catatan");
    el.textContent = teks || "";
    el.hidden = !teks;
  }

  function panduanIzin() {
    if (isIOS) {
      return "Cara mengizinkan di iPhone: buka Pengaturan, pilih Privasi & Keamanan, lalu Layanan Lokasi. " +
        "Pastikan Layanan Lokasi aktif, lalu pada Situs Web Safari pilih \"Saat Menggunakan App\". " +
        "Setelah itu muat ulang halaman ini dan ketuk Coba Lagi";
    }
    return "Cara mengizinkan di Android: ketuk ikon di sebelah kiri alamat situs pada Chrome, pilih Izin, " +
      "lalu ubah Lokasi menjadi Izinkan. Pastikan fitur Lokasi pada ponsel juga aktif. " +
      "Setelah itu muat ulang halaman ini dan ketuk Coba Lagi";
  }

  function formatAngka(n) { return n.toFixed(6); }

  // ---------- Hasil berhasil ----------
  function berhasil(posisi) {
    var c = posisi.coords;
    var lat = Number(c.latitude.toFixed(6));
    var lng = Number(c.longitude.toFixed(6));
    var akurasi = Math.round(c.accuracy);

    var data = {
      latitude: lat,
      longitude: lng,
      akurasi: akurasi,
      waktuLokasi: new Date().toISOString(),
      mapsUrl: "https://www.google.com/maps?q=" + lat + "," + lng,
      alamat: null
    };

    $("detail-lokasi").hidden = false;
    $("lokasi-koordinat").textContent = formatAngka(lat) + ", " + formatAngka(lng);
    $("lokasi-akurasi").textContent = "± " + akurasi + " meter";
    $("lokasi-maps").href = data.mapsUrl;
    $("lokasi-alamat").textContent = "Mencari alamat...";

    setStatus("success", "Lokasi berhasil terdeteksi");
    setCatatan(akurasi > AKURASI_RENDAH
      ? "Akurasi lokasi rendah (± " + akurasi + " meter). Anda tetap dapat melanjutkan, atau ketuk Perbarui Lokasi di dekat jendela atau area terbuka"
      : "");
    tombol.textContent = "Perbarui Lokasi";

    window.VMApp.setLokasi(data);
    cariAlamat(data);
  }

  // ---------- Alamat (reverse geocoding) ----------
  function cariAlamat(data) {
    function pakaiKoordinat() {
      $("lokasi-alamat").textContent = "Belum tersedia, koordinat GPS digunakan";
    }

    if (window.VMApi && typeof window.VMApi.reverseGeocode === "function") {
      window.VMApi.reverseGeocode(data.latitude, data.longitude)
        .then(function (alamat) {
          if (alamat) {
            data.alamat = alamat;
            $("lokasi-alamat").textContent = alamat;
            window.VMApp.setLokasi(data);
          } else {
            pakaiKoordinat();
          }
        })
        .catch(pakaiKoordinat);
    } else {
      pakaiKoordinat(); // Phase 4 akan menambahkan VMApi.reverseGeocode
    }
  }

  // ---------- Hasil gagal ----------
  function gagal(err) {
    window.VMApp.setLokasi(null);
    $("detail-lokasi").hidden = true;
    tombol.textContent = "Coba Lagi";

    var kode = err && err.code;
    if (kode === 1) {
      setStatus("error", "Akses lokasi ditolak");
      setCatatan(panduanIzin());
    } else if (kode === 2) {
      setStatus("error", "Lokasi tidak dapat ditentukan");
      setCatatan("Pastikan fitur Lokasi (GPS) pada ponsel aktif dan koneksi internet tersedia, lalu ketuk Coba Lagi");
    } else {
      setStatus("error", "Waktu pencarian lokasi habis");
      setCatatan("Pindah ke dekat jendela atau area terbuka, pastikan fitur Lokasi aktif, lalu ketuk Coba Lagi");
    }
  }

  // ---------- Proses pencarian ----------
  function cariLokasi() {
    if (sedangMencari) return;

    if (!("geolocation" in navigator)) {
      setStatus("error", "Perangkat tidak mendukung akses lokasi");
      setCatatan("Gunakan browser Chrome (Android) atau Safari (iPhone) versi terbaru");
      return;
    }

    sedangMencari = true;
    tombol.disabled = true;
    tombol.textContent = "Mencari lokasi...";
    setStatus("loading", "Mencari lokasi Anda...");
    setCatatan("");

    var terbaik = null;
    var watchId = null;
    var timerPenyempurnaan = null;
    var timerTanpaSinyal = null;
    var selesai = false;

    function akhiri(err) {
      if (selesai) return;
      selesai = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timerPenyempurnaan);
      clearTimeout(timerTanpaSinyal);
      sedangMencari = false;
      tombol.disabled = false;
      if (terbaik) berhasil(terbaik);
      else gagal(err);
    }

    watchId = navigator.geolocation.watchPosition(
      function (posisi) {
        if (!terbaik || posisi.coords.accuracy < terbaik.coords.accuracy) terbaik = posisi;
        setStatus("loading", "Menyempurnakan akurasi (± " + Math.round(terbaik.coords.accuracy) + " meter)...");
        if (!timerPenyempurnaan) {
          timerPenyempurnaan = setTimeout(function () { akhiri(); }, DURASI_PENYEMPURNAAN);
        }
        if (posisi.coords.accuracy <= AKURASI_BAIK) akhiri();
      },
      function (err) { akhiri(err); },
      { enableHighAccuracy: true, timeout: BATAS_TANPA_SINYAL, maximumAge: 0 }
    );

    timerTanpaSinyal = setTimeout(function () {
      if (!terbaik) akhiri({ code: 3 });
    }, BATAS_TANPA_SINYAL + 1000);
  }

  tombol.addEventListener("click", cariLokasi);

  // Jika izin lokasi sudah pernah diberikan, langsung cari; jika sudah ditolak, tampilkan panduan.
  if (navigator.permissions && typeof navigator.permissions.query === "function") {
    navigator.permissions.query({ name: "geolocation" }).then(function (izin) {
      if (izin.state === "granted" && $("detail-lokasi").hidden) {
        cariLokasi();
      } else if (izin.state === "denied") {
        setStatus("error", "Akses lokasi ditolak");
        setCatatan(panduanIzin());
        tombol.textContent = "Coba Lagi";
      }
    }).catch(function () { /* browser tidak mendukung pengecekan izin; abaikan */ });
  }
})();
