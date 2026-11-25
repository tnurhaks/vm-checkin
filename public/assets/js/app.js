/* =========================================================
   Vendor Management - Visitor Check-in
   File: public/assets/js/app.js
   Tahap 2.2: jam WIB + mode pratinjau tampilan.
   Logika form, validasi, GPS, dan kamera ditambahkan di tahap berikutnya.
   ========================================================= */
(function () {
  "use strict";

  var ZONA_WAKTU = "Asia/Jakarta";

  var formatTanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: ZONA_WAKTU, day: "2-digit", month: "long", year: "numeric"
  });
  var formatWaktu = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_WAKTU, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });

  function $(id) { return document.getElementById(id); }

  // ---------- Jam WIB (read-only) ----------
  function perbaruiJam() {
    var sekarang = new Date();
    $("tanggal-kunjungan").textContent = formatTanggal.format(sekarang);
    $("waktu-sekarang").textContent = formatWaktu.format(sekarang) + " WIB";
  }
  perbaruiJam();
  setInterval(perbaruiJam, 1000);

  // ---------- Mode pratinjau tampilan (sementara, untuk review desain) ----------
  // Contoh: /?tampilan=lengkap | sukses | error | loading
  var mode = new URLSearchParams(window.location.search).get("tampilan");

  if (mode === "lengkap") {
    $("nama").value = "Budi Santoso (Data Dummy)";
    $("perusahaan").value = "PT Contoh Dummy";
    $("whatsapp").value = "0812 0000 0000";

    $("status-lokasi").setAttribute("data-state", "success");
    $("status-lokasi-teks").textContent = "Lokasi berhasil terdeteksi";
    $("detail-lokasi").hidden = false;
    $("lokasi-koordinat").textContent = "-6.186486, 106.822745";
    $("lokasi-akurasi").textContent = "± 18 meter";
    $("lokasi-alamat").textContent = "Jl. Contoh No. 1, Jakarta Pusat";
    $("btn-lokasi").textContent = "Perbarui Lokasi";

    $("persetujuan").checked = true;
    $("btn-submit").disabled = false;
    $("submit-hint").textContent = "Seluruh langkah telah lengkap.";

    ["kartu-identitas", "kartu-lokasi", "kartu-persetujuan"].forEach(function (id) {
      $(id).classList.add("is-done");
    });
    document.querySelectorAll(".step").forEach(function (el) {
      el.classList.remove("is-active");
      if (el.getAttribute("data-step") !== "3") { el.classList.add("is-done"); }
      else { el.classList.add("is-active"); }
    });
  }

  if (mode === "error") {
    $("pesan-error").hidden = false;
    $("field-whatsapp").classList.add("has-error");
    $("whatsapp").value = "12345";
    $("whatsapp-error").hidden = false;
    $("whatsapp-error").textContent = "Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx.";
    $("status-lokasi").setAttribute("data-state", "error");
    $("status-lokasi-teks").textContent = "Akses lokasi ditolak";
  }

  if (mode === "loading") {
    $("loading").hidden = false;
  }

  if (mode === "sukses") {
    $("halaman-form").hidden = true;
    $("halaman-sukses").hidden = false;
    $("sukses-id").textContent = "VM-20261125-DUMMY1";
    $("sukses-nama").textContent = "Budi Santoso (Data Dummy)";
    $("sukses-perusahaan").textContent = "PT Contoh Dummy";
    $("sukses-waktu").textContent = formatTanggal.format(new Date()) + ", " + formatWaktu.format(new Date()) + " WIB";
  }
})();
