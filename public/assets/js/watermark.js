/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/watermark.js
   Menambahkan watermark permanen ke foto (HTML Canvas) dan
   mengompres hasilnya menjadi JPEG. Watermark menyatu dengan
   piksel foto, bukan overlay di halaman.
   ========================================================= */
(function () {
  "use strict";

  var ZONA_WAKTU = "Asia/Jakarta";
  var FONT = "'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif";
  var JUDUL = "VENDOR MANAGEMENT – VISITOR CHECK-IN";

  var formatTanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: ZONA_WAKTU, day: "2-digit", month: "long", year: "numeric"
  });
  var formatWaktu = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_WAKTU, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });

  // Memecah teks menjadi beberapa baris sesuai lebar maksimal.
  function bungkusTeks(ctx, teks, lebarMaks, barisMaks) {
    var kata = String(teks).split(" ");
    var baris = [];
    var sekarang = "";
    for (var i = 0; i < kata.length; i++) {
      var coba = sekarang ? sekarang + " " + kata[i] : kata[i];
      if (ctx.measureText(coba).width <= lebarMaks || !sekarang) {
        sekarang = coba;
      } else {
        baris.push(sekarang);
        sekarang = kata[i];
      }
    }
    if (sekarang) baris.push(sekarang);

    if (baris.length > barisMaks) {
      baris = baris.slice(0, barisMaks);
      var terakhir = baris[barisMaks - 1];
      while (terakhir.length > 1 && ctx.measureText(terakhir + "…").width > lebarMaks) {
        terakhir = terakhir.slice(0, -1);
      }
      baris[barisMaks - 1] = terakhir + "…";
    }
    return baris;
  }

  function teksLokasi(lokasi) {
    if (lokasi.alamat) return lokasi.alamat;
    return lokasi.latitude.toFixed(6) + ", " + lokasi.longitude.toFixed(6);
  }

  /**
   * @param {HTMLCanvasElement} canvas  canvas berisi foto
   * @param {{nama:string, perusahaan:string, waktu:Date, lokasi:object}} data
   */
  function tambahkan(canvas, data) {
    var fontSiap = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fontSiap.then(function () {
      var ctx = canvas.getContext("2d");
      var W = canvas.width;
      var H = canvas.height;

      var u = Math.max(12, Math.round(Math.min(W, H) / 34)); // ukuran huruf dasar
      var ukuranJudul = Math.round(u * 1.05);
      var pad = Math.round(u * 0.9);
      var tinggiBaris = Math.round(u * 1.38);
      var lebarMaks = W - pad * 2;

      var isi = [
        "Nama: " + data.nama,
        "Perusahaan: " + data.perusahaan,
        "Tanggal: " + formatTanggal.format(data.waktu),
        "Waktu: " + formatWaktu.format(data.waktu) + " WIB",
        "Lokasi: " + teksLokasi(data.lokasi),
        "Akurasi GPS: " + data.lokasi.akurasi + " meter"
      ];

      ctx.font = "500 " + u + "px " + FONT;
      var semuaBaris = [];
      isi.forEach(function (teks) {
        var maks = teks.indexOf("Lokasi:") === 0 ? 3 : 2;
        bungkusTeks(ctx, teks, lebarMaks, maks).forEach(function (b) { semuaBaris.push(b); });
      });

      var tinggiPanel = pad + Math.round(ukuranJudul * 1.5) + semuaBaris.length * tinggiBaris + pad;
      var yPanel = H - tinggiPanel;
      var fade = u * 2;

      // Latar panel: gradasi navy agar teks terbaca di atas foto apa pun.
      var grad = ctx.createLinearGradient(0, yPanel - fade, 0, H);
      grad.addColorStop(0, "rgba(18, 51, 84, 0)");
      grad.addColorStop(0.22, "rgba(18, 51, 84, 0.80)");
      grad.addColorStop(1, "rgba(18, 51, 84, 0.94)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, yPanel - fade, W, tinggiPanel + fade);

      // Garis aksen biru di atas judul.
      ctx.fillStyle = "#2563EB";
      ctx.fillRect(pad, yPanel, Math.round(u * 2.2), Math.max(2, Math.round(u * 0.14)));

      ctx.textBaseline = "top";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = Math.round(u * 0.15);

      ctx.font = "800 " + ukuranJudul + "px " + FONT;
      ctx.fillText(JUDUL, pad, yPanel + Math.round(pad * 0.6), lebarMaks);

      ctx.font = "500 " + u + "px " + FONT;
      var y = yPanel + Math.round(pad * 0.6) + Math.round(ukuranJudul * 1.5);
      semuaBaris.forEach(function (b) {
        ctx.fillText(b, pad, y, lebarMaks);
        y += tinggiBaris;
      });

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    });
  }

  function canvasKeBlob(canvas, kualitas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error("Gagal membuat file JPEG"));
      }, "image/jpeg", kualitas);
    });
  }

  function blobKeBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1]); };
      reader.onerror = function () { reject(new Error("Gagal membaca file foto")); };
      reader.readAsDataURL(blob);
    });
  }

  // Kompresi bertahap: target maksimal ±700 KB agar cepat diunggah.
  var TARGET_BYTE = 700 * 1024;
  var DAFTAR_KUALITAS = [0.82, 0.72, 0.62, 0.52];

  function kompres(canvas) {
    var i = 0;
    function coba() {
      return canvasKeBlob(canvas, DAFTAR_KUALITAS[i]).then(function (blob) {
        if (blob.size > TARGET_BYTE && i < DAFTAR_KUALITAS.length - 1) {
          i += 1;
          return coba();
        }
        return blobKeBase64(blob).then(function (base64) {
          return { blob: blob, base64: base64, kualitas: DAFTAR_KUALITAS[i] };
        });
      });
    }
    return coba();
  }

  window.VMWatermark = { tambahkan: tambahkan, kompres: kompres };
})();
