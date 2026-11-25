/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/camera.js
   Kamera langsung melalui MediaDevices API (tanpa akses galeri).
   - Kamera depan/belakang, preview, ambil ulang.
   - Foto diproses: resize maks. 1280 px, watermark, kompresi JPEG.
   - Kamera baru dapat dipakai setelah identitas valid dan lokasi
     terdeteksi, agar data tersebut tercantum pada watermark.
   ========================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var RESOLUSI_MAKS = 1280;

  var video = $("kamera-video");
  var gambar = $("foto-hasil");
  var placeholder = $("kamera-placeholder");
  var teksPlaceholder = placeholder.querySelector("p");
  var btnKamera = $("btn-kamera");
  var btnGanti = $("btn-ganti-kamera");
  var btnAmbil = $("btn-ambil-foto");
  var btnUlang = $("btn-ulangi-foto");

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var PESAN_BELUM_SIAP = "Lengkapi identitas dan aktifkan lokasi terlebih dahulu agar data tersebut tercantum pada foto.";

  var stream = null;
  var arahKamera = "user"; // "user" = depan, "environment" = belakang
  var siap = false;
  var adaFoto = false;
  var sedangProses = false;
  var sedangMembuka = false;
  var urlPreview = null;
  var jumlahKamera = 0;
  var catatanAktif = "";

  function setCatatan(teks, jenis) {
    var el = $("foto-catatan");
    catatanAktif = teks || "";
    el.textContent = catatanAktif;
    el.hidden = !catatanAktif;
    el.className = "note " + (jenis === "peringatan" ? "note-warning" : "note-info");
  }

  function hentikanStream() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.srcObject = null;
    video.hidden = true;
  }

  function aturTombol() {
    var kameraAktif = !!stream;
    btnKamera.hidden = kameraAktif || adaFoto;
    btnKamera.disabled = !siap || sedangMembuka;
    btnAmbil.hidden = !kameraAktif;
    btnAmbil.disabled = !siap || sedangProses;
    btnGanti.hidden = !kameraAktif || jumlahKamera < 2;
    btnGanti.disabled = sedangProses;
    btnUlang.hidden = !adaFoto;

    if (!siap && !adaFoto) {
      setCatatan(PESAN_BELUM_SIAP, "info");
    } else if (siap && catatanAktif === PESAN_BELUM_SIAP) {
      setCatatan("");
    }
  }

  function panduanIzinKamera() {
    if (isIOS) {
      return "Akses kamera ditolak. Di iPhone: buka Pengaturan, pilih Safari, lalu Kamera, dan ubah menjadi Izinkan. Setelah itu muat ulang halaman ini.";
    }
    return "Akses kamera ditolak. Di Chrome: ketuk ikon di sebelah kiri alamat situs, pilih Izin, lalu ubah Kamera menjadi Izinkan. Setelah itu muat ulang halaman ini.";
  }

  function tampilkanErrorKamera(err) {
    var nama = err && err.name;
    var pesan;
    if (nama === "NotAllowedError" || nama === "SecurityError" || nama === "PermissionDeniedError") {
      pesan = panduanIzinKamera();
    } else if (nama === "NotFoundError" || nama === "DevicesNotFoundError") {
      pesan = "Kamera tidak ditemukan pada perangkat ini.";
    } else if (nama === "NotReadableError" || nama === "TrackStartError" || nama === "AbortError") {
      pesan = "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut, lalu ketuk Aktifkan Kamera kembali.";
    } else {
      pesan = "Kamera tidak dapat dibuka. Silakan muat ulang halaman, lalu coba kembali.";
    }
    teksPlaceholder.textContent = "Kamera belum aktif";
    setCatatan(pesan, "peringatan");
  }

  function hitungKamera() {
    if (!navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function (perangkat) {
      jumlahKamera = perangkat.filter(function (d) { return d.kind === "videoinput"; }).length;
    }).catch(function () { jumlahKamera = 1; });
  }

  function mulaiKamera() {
    if (sedangMembuka) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCatatan("Browser ini tidak mendukung akses kamera. Buka halaman ini langsung melalui Chrome (Android) atau Safari (iPhone), bukan dari dalam aplikasi lain.", "peringatan");
      return;
    }
    if (!siap) { aturTombol(); return; }

    sedangMembuka = true;
    btnKamera.textContent = "Membuka kamera...";
    aturTombol();
    hentikanStream();

    var batasan = {
      audio: false,
      video: { facingMode: { ideal: arahKamera }, width: { ideal: 1280 }, height: { ideal: 960 } }
    };

    navigator.mediaDevices.getUserMedia(batasan)
      .catch(function (err) {
        if (err && (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError")) {
          return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        throw err;
      })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        video.hidden = false;
        placeholder.hidden = true;
        gambar.hidden = true;

        var track = s.getVideoTracks()[0];
        var pengaturan = track && track.getSettings ? track.getSettings() : {};
        var depan = pengaturan.facingMode ? pengaturan.facingMode === "user" : arahKamera === "user";
        video.classList.toggle("is-mirror", depan);

        return video.play();
      })
      .then(function () {
        setCatatan("Posisikan wajah Anda di dalam bingkai, lalu ketuk Ambil Foto.", "info");
        return hitungKamera();
      })
      .catch(function (err) {
        hentikanStream();
        placeholder.hidden = false;
        tampilkanErrorKamera(err);
      })
      .then(function () {
        sedangMembuka = false;
        btnKamera.textContent = "Aktifkan Kamera";
        aturTombol();
      });
  }

  function gantiKamera() {
    arahKamera = arahKamera === "user" ? "environment" : "user";
    mulaiKamera();
  }

  function ambilFoto() {
    if (!stream || sedangProses || !siap) return;
    var lebarAsli = video.videoWidth;
    var tinggiAsli = video.videoHeight;
    if (!lebarAsli || !tinggiAsli) {
      setCatatan("Kamera belum siap. Tunggu sebentar, lalu ketuk Ambil Foto kembali.", "peringatan");
      return;
    }

    sedangProses = true;
    btnAmbil.textContent = "Memproses foto...";
    aturTombol();

    var skala = Math.min(1, RESOLUSI_MAKS / Math.max(lebarAsli, tinggiAsli));
    var lebar = Math.round(lebarAsli * skala);
    var tinggi = Math.round(tinggiAsli * skala);

    var canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    canvas.getContext("2d").drawImage(video, 0, 0, lebar, tinggi);

    var waktuFoto = window.VMApi.sekarang();
    var identitas = window.VMApp.getIdentitas();
    var lokasi = window.VMApp.getLokasi();

    hentikanStream(); // kamera dimatikan setelah foto diambil

    window.VMWatermark.tambahkan(canvas, {
      nama: identitas.nama,
      perusahaan: identitas.perusahaan,
      waktu: waktuFoto,
      lokasi: lokasi
    })
      .then(function () { return window.VMWatermark.kompres(canvas); })
      .then(function (hasil) {
        if (urlPreview) URL.revokeObjectURL(urlPreview);
        urlPreview = URL.createObjectURL(hasil.blob);
        gambar.src = urlPreview;
        gambar.hidden = false;
        placeholder.hidden = true;
        adaFoto = true;

        window.VMApp.setFoto({
          base64: hasil.base64,
          ukuran: hasil.blob.size,
          lebar: lebar,
          tinggi: tinggi,
          waktuFoto: waktuFoto.toISOString(),
          nama: identitas.nama,
          perusahaan: identitas.perusahaan,
          latitude: lokasi.latitude,
          longitude: lokasi.longitude
        });
        setCatatan("Foto berhasil diambil. Periksa hasilnya, atau ketuk Ambil Ulang apabila kurang jelas.", "info");
      })
      .catch(function () {
        placeholder.hidden = false;
        teksPlaceholder.textContent = "Foto gagal diproses";
        setCatatan("Foto gagal diproses. Ketuk Aktifkan Kamera untuk mencoba kembali.", "peringatan");
      })
      .then(function () {
        sedangProses = false;
        btnAmbil.textContent = "Ambil Foto";
        aturTombol();
      });
  }

  function hapusFoto() {
    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = null;
    gambar.removeAttribute("src");
    gambar.hidden = true;
    adaFoto = false;
  }

  function ambilUlang() {
    hapusFoto();
    window.VMApp.setFoto(null);
    mulaiKamera();
  }

  // Dipanggil app.js ketika identitas/lokasi berubah setelah foto diambil.
  function reset(pesan) {
    hentikanStream();
    hapusFoto();
    placeholder.hidden = false;
    teksPlaceholder.textContent = "Silakan ambil ulang foto";
    if (pesan) setCatatan(pesan, "peringatan");
    aturTombol();
  }

  function setSiap(nilai) {
    if (siap === nilai) return;
    siap = nilai;
    aturTombol();
  }

  // Hentikan kamera ketika halaman ditinggalkan (pindah aplikasi/tab).
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && stream) {
      hentikanStream();
      placeholder.hidden = false;
      teksPlaceholder.textContent = "Kamera dijeda. Ketuk Aktifkan Kamera untuk melanjutkan.";
      setCatatan("");
      aturTombol();
    }
  });

  btnKamera.addEventListener("click", mulaiKamera);
  btnGanti.addEventListener("click", gantiKamera);
  btnAmbil.addEventListener("click", ambilFoto);
  btnUlang.addEventListener("click", ambilUlang);

  window.VMKamera = { setSiap: setSiap, reset: reset };

  aturTombol();
  window.VMApp.perbaruiStatus();
})();
