/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/api.js
   Komunikasi browser dengan API Cloudflare Worker (/api/*).
   Browser tidak pernah memegang URL Apps Script maupun secret.
   ========================================================= */
(function () {
  "use strict";

  var selisihJamMs = 0;       // selisih jam server dan jam perangkat
  var siteKeyTurnstile = null;
  var tokenTurnstile = null;
  var idWidget = null;

  function fetchDenganBatasWaktu(url, opsi, ms) {
    var kontrol = new AbortController();
    var timer = setTimeout(function () { kontrol.abort(); }, ms);
    opsi = opsi || {};
    opsi.signal = kontrol.signal;
    return fetch(url, opsi).finally(function () { clearTimeout(timer); });
  }

  function beritahuApp() {
    if (window.VMApp && typeof window.VMApp.perbaruiStatus === "function") window.VMApp.perbaruiStatus();
  }

  // Waktu yang sudah disinkronkan dengan jam server.
  function sekarang() { return new Date(Date.now() + selisihJamMs); }

  // ---------- Cloudflare Turnstile (anti-bot, opsional) ----------
  function muatTurnstile() {
    window.onVMTurnstileSiap = function () {
      var wadah = document.getElementById("turnstile-wadah");
      if (!wadah || !window.turnstile) return;
      wadah.hidden = false;
      idWidget = window.turnstile.render(wadah, {
        sitekey: siteKeyTurnstile,
        language: "id",
        theme: "light",
        callback: function (token) { tokenTurnstile = token; beritahuApp(); },
        "expired-callback": function () { tokenTurnstile = null; beritahuApp(); },
        "error-callback": function () { tokenTurnstile = null; beritahuApp(); }
      });
    };
    var skrip = document.createElement("script");
    skrip.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onVMTurnstileSiap&render=explicit";
    skrip.async = true;
    document.head.appendChild(skrip);
  }

  function resetTurnstile() {
    tokenTurnstile = null;
    if (idWidget !== null && window.turnstile) {
      try { window.turnstile.reset(idWidget); } catch (e) { /* abaikan */ }
    }
    beritahuApp();
  }

  // ---------- Konfigurasi awal & sinkronisasi jam ----------
  var siap = (function muatKonfigurasi() {
    var t0 = Date.now();
    return fetchDenganBatasWaktu("/api/config", { cache: "no-store" }, 8000)
      .then(function (r) {
        if (!r.ok) throw new Error("config " + r.status);
        return r.json();
      })
      .then(function (d) {
        var t1 = Date.now();
        var waktuServer = Date.parse(d.serverTime);
        if (!isNaN(waktuServer)) selisihJamMs = waktuServer - Math.round((t0 + t1) / 2);
        siteKeyTurnstile = d.turnstileSiteKey || null;
        if (siteKeyTurnstile) muatTurnstile();
        beritahuApp();
      })
      .catch(function () {
        // Server tidak terjangkau: jam perangkat dipakai sementara.
      });
  })();

  // ---------- Alamat dari koordinat ----------
  function reverseGeocode(lat, lng) {
    return fetchDenganBatasWaktu("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng })
    }, 12000)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { return (d && d.alamat) || null; })
      .catch(function () { return null; });
  }

  // ---------- Kirim registrasi ----------
  function kirimRegistrasi(payload) {
    var body = JSON.stringify(Object.assign({}, payload, { turnstileToken: tokenTurnstile }));

    return fetchDenganBatasWaktu("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }, 60000)
      .then(function (r) {
        return r.json()
          .catch(function () { return {}; })
          .then(function (d) { return { status: r.status, data: d }; });
      })
      .then(function (h) {
        if (h.data && h.data.ok) {
          return { registrationId: h.data.registrationId, waktuServer: h.data.waktuServer };
        }
        throw { pesan: (h.data && h.data.message) || "Registrasi gagal diproses. Silakan coba kembali." };
      })
      .catch(function (err) {
        resetTurnstile(); // token Turnstile hanya berlaku sekali
        if (err && err.pesan) throw err;
        if (err && err.name === "AbortError") {
          throw { pesan: "Koneksi terlalu lama. Periksa jaringan Anda, lalu coba kembali." };
        }
        throw { pesan: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba kembali." };
      });
  }

  window.VMApi = {
    siap: siap,
    sekarang: sekarang,
    reverseGeocode: reverseGeocode,
    kirimRegistrasi: kirimRegistrasi,
    perluVerifikasi: function () { return !!siteKeyTurnstile; },
    tokenTersedia: function () { return !!tokenTurnstile; }
  };
})();
