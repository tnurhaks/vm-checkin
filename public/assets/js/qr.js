/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/qr.js  (halaman poster QR)
   - QR Code statis mengarah ke halaman registrasi (dapat dipakai berulang).
   - Cetak A4, unduh poster PNG (A4 300 dpi), unduh QR PNG.
   ========================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var URL_TUJUAN = window.location.origin + "/";
  var FONT = "'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif";
  var NAVY = "#123354", BLUE = "#2563EB", MUTED = "#64748B", TEXT = "#0F172A", BG = "#F8FAFC";

  // Error correction "H" (30%): tetap terbaca walau poster sedikit kotor/tergores.
  var qr = qrcode(0, "H");
  qr.addData(URL_TUJUAN);
  qr.make();
  var jumlahModul = qr.getModuleCount();

  $("url-tujuan").textContent = URL_TUJUAN;
  $("poster-url").textContent = URL_TUJUAN.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // ---------- QR sebagai SVG (tajam saat dicetak) ----------
  function buatSvg() {
    var path = "";
    for (var r = 0; r < jumlahModul; r++) {
      for (var c = 0; c < jumlahModul; c++) {
        if (qr.isDark(r, c)) path += "M" + c + " " + r + "h1v1h-1z";
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + jumlahModul + " " + jumlahModul +
      '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#FFFFFF"/>' +
      '<path d="' + path + '" fill="' + NAVY + '"/></svg>';
  }
  $("qr-wadah").innerHTML = buatSvg();

  // ---------- Menggambar QR ke canvas ----------
  function gambarQr(ctx, x, y, ukuran) {
    var modul = ukuran / jumlahModul;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, ukuran, ukuran);
    ctx.fillStyle = NAVY;
    for (var r = 0; r < jumlahModul; r++) {
      for (var c = 0; c < jumlahModul; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(Math.floor(x + c * modul), Math.floor(y + r * modul), Math.ceil(modul), Math.ceil(modul));
        }
      }
    }
  }

  function unduhCanvas(canvas, namaFile) {
    canvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = namaFile;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, "image/png");
  }

  function bungkus(ctx, teks, lebarMaks) {
    var kata = teks.split(" "), baris = [], kini = "";
    kata.forEach(function (k) {
      var coba = kini ? kini + " " + k : k;
      if (ctx.measureText(coba).width > lebarMaks && kini) { baris.push(kini); kini = k; }
      else { kini = coba; }
    });
    if (kini) baris.push(kini);
    return baris;
  }

  function pilRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Unduh QR saja ----------
  function unduhQr() {
    var ukuran = 1200, margin = 80;
    var c = document.createElement("canvas");
    c.width = c.height = ukuran + margin * 2;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);
    gambarQr(ctx, margin, margin, ukuran);
    unduhCanvas(c, "QR-Registrasi-Vendor-Management.png");
  }

  // ---------- Unduh poster A4 300 dpi (2480 x 3508 px) ----------
  function unduhPoster() {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
      var W = 2480, H = 3508, mm = W / 210;
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var ctx = c.getContext("2d");
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      // Header
      var tinggiHeader = 52 * mm;
      ctx.fillStyle = NAVY;
      ctx.fillRect(0, 0, W, tinggiHeader);
      ctx.fillStyle = BLUE;
      ctx.fillRect(0, tinggiHeader, W, 3 * mm);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 " + Math.round(11.5 * mm) + "px " + FONT;
      if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(1.4 * mm) + "px";
      ctx.fillText("VENDOR MANAGEMENT", W / 2, tinggiHeader / 2 + 4 * mm);

      // WELCOME
      if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(2.1 * mm) + "px";
      ctx.fillStyle = NAVY;
      ctx.font = "800 " + Math.round(20 * mm) + "px " + FONT;
      ctx.fillText("WELCOME", W / 2, 88 * mm);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

      ctx.fillStyle = MUTED;
      ctx.font = "600 " + Math.round(7.6 * mm) + "px " + FONT;
      ctx.fillText("Registrasi Kehadiran Pengunjung", W / 2, 101 * mm);

      // Bingkai + QR
      var bingkai = 100 * mm, xB = (W - bingkai) / 2, yB = 111 * mm;
      ctx.fillStyle = NAVY;
      pilRoundRect(ctx, xB, yB, bingkai, bingkai, 6 * mm);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      pilRoundRect(ctx, xB + 1.2 * mm, yB + 1.2 * mm, bingkai - 2.4 * mm, bingkai - 2.4 * mm, 5 * mm);
      ctx.fill();
      var ukuranQr = bingkai - 14.4 * mm;
      gambarQr(ctx, xB + 7.2 * mm, yB + 7.2 * mm, ukuranQr);

      // SCAN TO CHECK IN (pil biru)
      ctx.font = "800 " + Math.round(10 * mm) + "px " + FONT;
      if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(1 * mm) + "px";
      var teksCta = "SCAN TO CHECK IN";
      var lebarCta = ctx.measureText(teksCta).width + 20 * mm, tinggiCta = 17 * mm;
      var yCta = yB + bingkai + 10 * mm;
      ctx.fillStyle = BLUE;
      pilRoundRect(ctx, (W - lebarCta) / 2, yCta, lebarCta, tinggiCta, tinggiCta / 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(teksCta, W / 2, yCta + tinggiCta / 2 + 3.5 * mm);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

      // Deskripsi
      ctx.fillStyle = TEXT;
      ctx.font = "500 " + Math.round(5.9 * mm) + "px " + FONT;
      var baris = bungkus(ctx, "Silakan pindai QR Code menggunakan kamera smartphone Anda untuk melakukan registrasi kunjungan", 150 * mm);
      var yDesk = yCta + tinggiCta + 12 * mm;
      baris.forEach(function (b, i) { ctx.fillText(b, W / 2, yDesk + i * 9 * mm); });

      // Footer
      var tinggiFooter = 18 * mm;
      ctx.fillStyle = BG;
      ctx.fillRect(0, H - tinggiFooter, W, tinggiFooter);
      ctx.fillStyle = MUTED;
      ctx.font = "500 " + Math.round(4.2 * mm) + "px " + FONT;
      ctx.fillText($("poster-url").textContent, W / 2, H - tinggiFooter / 2 + 1.5 * mm);

      unduhCanvas(c, "Poster-Registrasi-Vendor-Management-A4.png");
    });
  }

  $("btn-cetak").addEventListener("click", function () { window.print(); });
  $("btn-unduh-qr").addEventListener("click", unduhQr);
  $("btn-unduh-poster").addEventListener("click", unduhPoster);
})();
