import { useEffect, useState } from "react";
import "./landing.css";

/**
 * One observer for every [data-reveal] on the page; each element is unobserved
 * once it has appeared, so nothing keeps running after the first pass.
 *
 * The "shown" flag is the data-in attribute, not a class: React rewrites
 * className whenever an element's class list changes (e.g. an FAQ row opening),
 * which would wipe a class added out here and hide the element for good.
 */
function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.setAttribute("data-in", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const MODES: [string, string][] = [
  ["Santai", "Hangat, suportif, dan membimbing. Pertanyaan diarahkan untuk membantu Anda berkembang, bukan menjebak."],
  ["Standar", "Seimbang dan wajar seperti penguji pada umumnya — menggali, tetapi tidak berlebihan."],
  ["Kritis", "Skeptis dan menuntut bukti. Tidak mudah puas dengan jawaban permukaan."],
  ["Galak", "Sangat menekan dan tanpa ampun. Setiap kelemahan, inkonsistensi, dan asumsi lemah dikejar tanpa kompromi."],
];

const TYPES: [string, string, string][] = [
  [
    "Umum",
    "Menyeluruh: konsistensi rumusan masalah–tujuan–kesimpulan, justifikasi metode, kecukupan evaluasi, dan kebaruan — bergantian sepanjang sidang.",
    "Kesimpulan nomor dua ini menjawab rumusan masalah yang mana?",
  ],
  [
    "Metodolog",
    "Sokratik: justifikasi pemilihan metode, validitas dan reliabilitas instrumen, cara pengambilan sampel, serta batas generalisasi.",
    "Dengan sampel sekecil itu, seberapa valid kesimpulan Anda? Apakah Anda menghitung selang kepercayaan?",
  ],
  [
    "Ahli Domain",
    "Penguasaan teori, posisi terhadap literatur terkini, etika penelitian, keselamatan pengguna, dan privasi data.",
    "Instrumen itu untuk skrining atau diagnosis? Siapa yang berwenang menafsirkan skornya?",
  ],
  [
    "Teknis (RPL/SI)",
    "Arsitektur sistem, alur data, alasan keputusan desain, kecukupan pengujian di luar black-box, dan penanganan kasus tepi.",
    "Coba telusuri langkah demi langkah cara fitur inti Anda bekerja saat inputnya tidak valid.",
  ],
  [
    "Ketua Sidang",
    "Keteraturan sidang: jawaban ringkas dan terstruktur, agenda terbahas merata, dan Anda diminta merangkum sendiri poin kuncinya.",
    "Rangkum sendiri poin kunci fase ini dalam tiga kalimat sebelum kita lanjut.",
  ],
];

const FAQ: [string, string][] = [
  [
    "Apakah pertanyaannya benar-benar dari skripsi saya?",
    "Ya. Naskah PDF yang Anda unggah dikirim sebagai konteks utama penguji. Bank pertanyaan internal hanya dipakai sebagai bahan, lalu disesuaikan dengan bab, tabel, dan angka yang benar-benar ada di naskah Anda — bukan dibacakan apa adanya.",
  ],
  [
    "Saya harus punya API key sendiri?",
    "Betul. SiBiru memakai key Anda sendiri dari OpenRouter, Anthropic, OpenAI, atau Google AI Studio. Konsekuensinya biaya jadi transparan dan naskah Anda tidak melewati layanan pihak ketiga milik kami.",
  ],
  [
    "Berapa biaya satu kali sidang?",
    "Bergantung model yang Anda pilih dan panjang naskah. Sebagai gambaran, satu sidang penuh berisi belasan pertanyaan plus penilaian akhir biasanya berada di kisaran beberapa ribu rupiah. Penghitung token di tab Pengaturan menampilkan angka persisnya.",
  ],
  [
    "Harus menjawab dengan suara?",
    "Tidak wajib. Mikrofon adalah cara yang paling mendekati sidang sungguhan, tetapi Anda bisa mengetik jawaban kapan saja — misalnya saat sedang di tempat ramai.",
  ],
  [
    "Bisa latihan bagian tertentu saja?",
    'Bisa. Tulis fokusnya di kolom poin serangan, misalnya "Bab 3 dan pengujian saja", lalu akhiri sesi setelah bagian itu selesai. Sesi pendek tetap tersimpan di Riwayat meski belum dinilai.',
  ],
  [
    "Nilainya bisa dipakai memprediksi hasil sidang asli?",
    "Anggap sebagai latihan, bukan ramalan. Skornya berguna untuk melihat aspek mana yang paling lemah dan pertanyaan mana yang belum bisa Anda jawab — keputusan akhir tetap di tangan dosen penguji Anda.",
  ],
];

const PHASES: [string, boolean][] = [
  ["Pembukaan", false],
  ["Latar Belakang & Rumusan Masalah", true],
  ["Tinjauan Pustaka", true],
  ["Metodologi", true],
  ["Hasil & Pembahasan", true],
  ["Kesimpulan & Kontribusi", true],
  ["Penutup", false],
];

const DIMS: [string, number, string][] = [
  ["Penguasaan materi", 45, "#e9a23b"],
  ["Metodologi", 60, "#2563eb"],
  ["Kualitas & orisinalitas", 72, "#0f9d6e"],
  ["Argumentasi & pertahanan", 35, "#e9a23b"],
];

const GRADES: [string, string, string][] = [
  ["A · >85", "#e7f7f0", "#0b7355"],
  ["AB · 75–85", "#e7f7f0", "#0b7355"],
  ["B · 65–75", "#edf3ff", "#1d4ed8"],
  ["BC · 60–65", "#edf3ff", "#1d4ed8"],
  ["C · 50–60", "#fff3e8", "#b45309"],
  ["D · 40–50", "#fef3f2", "#b42318"],
  ["E · ≤40", "#fef3f2", "#b42318"],
];

const NAV: [string, string][] = [
  ["#cara-kerja", "Cara kerja"],
  ["#penguji", "Penguji"],
  ["#penilaian", "Penilaian"],
  ["#privasi", "Biaya & privasi"],
  ["#tanya", "Tanya jawab"],
];

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [mode, setMode] = useState(2);
  const [type, setType] = useState(1);
  const [faq, setFaq] = useState(0);

  useScrollReveal();

  const m = MODES[mode];
  const t = TYPES[type];

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap">
          <a href="#atas" className="lp-brand">
            <img className="lp-brand-mark" src="/sibiru-icon.svg" alt="" width={36} height={36} />
            <div className="lp-brand-text">
              <span className="lp-brand-name">SiBiru</span>
              <span className="lp-brand-sub">Simulator Sidang Skripsi</span>
            </div>
          </a>
          <nav className="lp-nav">
            {NAV.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="lp-header-cta">
            <button className="lp-btn ghost" onClick={onStart}>Masuk</button>
            <button className="lp-btn" onClick={onStart}>Mulai latihan</button>
          </div>
        </div>
      </header>

      <section id="atas" className="lp-hero">
        <div className="lp-wrap">
          <div>
            <span className="lp-badge">
              <i aria-hidden="true" />
              Penguji AI yang membaca naskah skripsi Anda
            </span>
            <h1>Latihan dihabisi penguji,<br />sebelum hari sidang tiba.</h1>
            <p className="lp-lede">
              SiBiru membaca PDF skripsi Anda, lalu memerankan dosen penguji sungguhan: bertanya dari isi
              naskah, mengejar jawaban yang mengambang, dan menutup sidang dengan nilai serta daftar revisi
              per bab.
            </p>
            <div className="lp-cta-row">
              <button className="lp-btn lg" onClick={onStart}>Mulai latihan gratis</button>
              <a className="lp-btn ghost lg" href="#cara-kerja">Lihat cara pakainya</a>
            </div>
            <div className="lp-stats">
              <div className="lp-stat"><b>7 fase</b><span>agenda sidang penuh</span></div>
              <div className="lp-stat"><b>6</b><span>penguji bernama</span></div>
              <div className="lp-stat"><b>15+</b><span>pertanyaan per sidang</span></div>
              <div className="lp-stat"><b>API key</b><span>milik Anda sendiri</span></div>
            </div>
          </div>

          <div className="lp-mock-shell">
            <div className="lp-mock-glow" aria-hidden="true" />
            <div className="lp-mock">
              <div className="lp-mock-head">
                <div className="lp-mock-ring">
                  <i aria-hidden="true" />
                  <b>RW</b>
                </div>
                <div className="lp-mock-who">
                  <b>Dr. Ratna Wijaya, M.Kom.</b>
                  {/* Same wording the session header uses; Ratna is standar/metodolog in personas.ts. */}
                  <span>Sang metodolog · mode Standar</span>
                </div>
                <span className="lp-mock-rec">● MEREKAM</span>
              </div>
              <div className="lp-mock-body">
                <div className="lp-turn">
                  <div className="lp-turn-av">RW</div>
                  <div className="lp-msg">
                    Anda menulis selisih stok 111 item di Bab 1. Tunjukkan halaman berapa data lapangannya,
                    dan siapa yang mencatat angka itu.
                  </div>
                </div>
                <div className="lp-turn me">
                  <div className="lp-turn-av">AR</div>
                  <div className="lp-turn-col">
                    <div className="lp-msg me">
                      Ada di lampiran Stock Opname, Bu. Tapi halamannya belum saya cantumkan di Bab 1.
                    </div>
                    <div className="lp-note">
                      <b>CATATAN</b>
                      <span>Klaim tanpa rujukan halaman. Penguji akan mengejar titik ini lagi.</span>
                    </div>
                  </div>
                </div>
                <div className="lp-turn">
                  <div className="lp-turn-av">RW</div>
                  <div className="lp-msg">
                    Berarti angka itu belum bisa dipertanggungjawabkan di naskah. Kalau begitu, atas dasar apa
                    Anda menyimpulkan pencatatan manual yang jadi penyebabnya?
                  </div>
                </div>
              </div>
              <div className="lp-mock-foot">
                <span className="lp-mock-stop"><i aria-hidden="true" />Berhenti</span>
                <span className="lp-mock-hint">Mendengarkan jawaban Anda…</span>
                <span className="lp-mock-clock">12:34</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap lp-grid-3">
          <div className="lp-card" data-reveal>
            <span className="lp-tag bad">Masalahnya</span>
            <h3>Latihan dengan teman terlalu ramah</h3>
            <p>Tidak ada yang berani mengejar sampai Anda kehabisan alasan. Padahal justru di situ sidang biasanya jatuh.</p>
          </div>
          <div className="lp-card" data-reveal>
            <span className="lp-tag warn">Yang terjadi</span>
            <h3>Pertanyaan yang mematikan itu spesifik</h3>
            <p>“Ada di halaman berapa?”, “Itu asumsi atau ada datanya?”, “Bedanya apa dengan penelitian X?” — semua menyasar isi naskah Anda, bukan teori umum.</p>
          </div>
          <div className="lp-card" data-reveal>
            <span className="lp-tag good">Solusinya</span>
            <h3>Penguji yang sudah membaca naskah Anda</h3>
            <p>Unggah PDF-nya sekali. Setiap pertanyaan lahir dari bab, tabel, dan angka yang benar-benar ada di skripsi Anda.</p>
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Cara penggunaan</span>
            <h2>Lima langkah, sekitar sepuluh menit persiapan.</h2>
            <p>Setelah setup pertama selesai, latihan berikutnya cukup satu klik: buka tab Latihan, tekan Rekam, dan sidang dimulai.</p>
          </div>

          <div className="lp-steps">
            <div className="lp-step" data-reveal>
              <span className="lp-step-n">01</span>
              <div>
                <h3>Hubungkan model AI Anda</h3>
                <p>
                  Di tab <b>Pengaturan → Model AI</b>, pilih provider (OpenRouter, Anthropic, OpenAI, atau
                  Google AI Studio), isi nama model, lalu tempel API key Anda. Tekan <b>Tes koneksi</b> untuk
                  memastikan key valid sebelum mulai.
                </p>
              </div>
              <div className="lp-aside">
                <div className="lp-aside-label">Provider</div>
                <div className="lp-aside-val">OpenRouter · z-ai/glm-5.2</div>
                <div className="lp-pill-ok">✓ Terhubung</div>
              </div>
            </div>

            <div className="lp-step" data-reveal>
              <span className="lp-step-n">02</span>
              <div>
                <h3>Unggah naskah skripsi</h3>
                <p>
                  Tarik file PDF naskah terbaru ke <b>Pengaturan → Dokumen skripsi</b>. Teksnya diekstrak dan
                  menjadi satu-satunya sumber pertanyaan penguji — termasuk nomor bab, nama tabel, dan angka
                  hasil pengujian Anda.
                </p>
              </div>
              <div className="lp-aside row">
                <div className="lp-pdf">PDF</div>
                <div style={{ minWidth: 0 }}>
                  <div className="lp-aside-val" style={{ marginTop: 0 }}>ta_fixed.pdf</div>
                  <div className="lp-aside-sub">113.512 karakter · terindeks</div>
                </div>
              </div>
            </div>

            <div className="lp-step" data-reveal>
              <span className="lp-step-n">03</span>
              <div>
                <h3>Atur karakter penguji</h3>
                <p>
                  Pilih seberapa keras (mode) dan apa yang dikejar (tipe). Kalau Anda sudah tahu titik lemah
                  naskah sendiri, tulis di kolom <b>poin serangan</b> — maksimal 8 baris — dan penguji akan
                  memprioritaskannya.
                </p>
              </div>
              <div className="lp-aside">
                <div className="lp-aside-label">Poin serangan</div>
                <p className="lp-aside-quote">“Klaim efisiensi 40% belum ada buktinya; skor SUS 56,25 dibaca sebagai persentase.”</p>
              </div>
            </div>

            <div className="lp-step" data-reveal>
              <span className="lp-step-n">04</span>
              <div>
                <h3>Jalani sidang secara lisan</h3>
                <p>
                  Tekan <b>Rekam</b> lalu bicara seperti di ruang sidang; jawaban Anda ditranskrip otomatis,
                  dan pertanyaan penguji dibacakan dengan suara. Sedang di tempat ramai? Ketik saja jawabannya.
                </p>
              </div>
              <div className="lp-aside">
                <div className="lp-aside-label">Suara penguji</div>
                <div className="lp-aside-val">id-ID-Chirp3-HD-Leda</div>
                <div className="lp-aside-sub">Google Cloud · ElevenLabs · browser</div>
              </div>
            </div>

            <div className="lp-step" data-reveal>
              <span className="lp-step-n">05</span>
              <div>
                <h3>Akhiri sidang, baca penilaiannya</h3>
                <p>
                  Begitu seluruh fase terbahas, penguji mengusulkan menutup sidang. Anda langsung menerima skor
                  empat aspek, huruf mutu, daftar kelebihan–kekurangan, dan saran revisi yang menyebut bab mana
                  yang harus diperbaiki.
                </p>
              </div>
              <div className="lp-aside row" style={{ gap: 14 }}>
                <span className="lp-score-mini">62</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span className="lp-grade-mini">BC</span>
                  <span className="lp-aside-sub" style={{ marginTop: 0 }}>Lulus dengan revisi</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="penguji" className="lp-section">
        <div className="lp-wrap lp-dark">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Karakter penguji</span>
            <h2>Tentukan seberapa keras, dan apa yang dikejar.</h2>
            <p>Mode mengatur tekanan; tipe mengatur sudut serang. Enam karakter siap pakai dirakit dari keduanya — dari pembimbing yang menenangkan sampai penguji senior tanpa ampun.</p>
          </div>

          <div className="lp-picker">
            <div className="lp-picker-col" data-reveal>
              <div>
                <div className="lp-picker-label">Mode — seberapa keras</div>
                <div className="lp-pills">
                  {MODES.map(([label], i) => (
                    <button
                      key={label}
                      className="lp-pill"
                      aria-pressed={mode === i}
                      onClick={() => setMode(i)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="lp-picker-label">Tipe — apa yang dikejar</div>
                <div className="lp-pills">
                  {TYPES.map(([label], i) => (
                    <button
                      key={label}
                      className="lp-pill"
                      aria-pressed={type === i}
                      onClick={() => setType(i)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lp-pick" key={`${mode}-${type}`}>
              {/* An illustration of the two dials, not the app's picker — that is six named cards. */}
              <div className="lp-picker-label" style={{ marginBottom: 0, color: "#a8c3ff" }}>Contoh kombinasi</div>
              <h3>Penguji {m[0]} · {t[0]}</h3>
              <p>{m[1]}</p>
              <p>{t[1]}</p>
              <div className="lp-pick-foot">
                <div className="lp-picker-label" style={{ marginBottom: 9 }}>Contoh pertanyaan</div>
                <p className="lp-pick-sample">“{t[2]}”</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Aturan mengejar</span>
            <h2>Jawaban mengambang tidak akan dilepaskan.</h2>
            <p>Penguji SiBiru menjalankan aturan yang sama dengan penguji sungguhan: satu topik tidak ditutup sebelum jawaban Anda menyentuh sesuatu yang bisa diperiksa.</p>
          </div>

          <div className="lp-grid-3 tight">
            <div className="lp-card" data-reveal>
              <h3>Minta bukti, bukan klaim</h3>
              <p>Setiap klaim tentang isi skripsi harus disertai bab, halaman, atau tabelnya. Tanpa itu, penguji tidak pindah topik.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Konfrontasi inkonsistensi</h3>
              <p>Jawaban Anda dibandingkan dengan isi naskah. Kalau Bab 3 bilang X dan Anda bilang Y, itu langsung ditunjukkan.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Laddering bertahap</h3>
              <p>Permukaan → minta bukti → konfrontasi → pertanyaan hipotetis → justifikasi keputusan desain. Maksimal tiga follow-up per topik.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>“Lanjut” bukan jawaban</h3>
              <p>Mendorong penguji pindah dengan “ya”, “oke”, atau “lanjut” justru membuat pertanyaan yang sama diulang lebih tajam.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Satu butir sekali uji</h3>
              <p>Menjawab tiga rumusan masalah sekaligus tidak dihitung selesai. Penguji memilih satu butir dan mengujinya sampai tuntas.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Modul kritik domain</h3>
              <p>Skripsi pengembangan sistem, evaluasi kuesioner (SUS/UAT/TAM), penggunaan LLM, atau domain sensitif punya daftar serangan khususnya sendiri.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap lp-panel">
          <div className="lp-panel-head">
            <div className="lp-head" data-reveal>
              <span className="lp-eyebrow">Agenda sidang</span>
              <h2>Tujuh fase, dilalui berurutan.</h2>
              <p>Fase inti mendapat minimal dua pertanyaan menggali. Sidang baru boleh ditutup setelah semua fase, termasuk Penutup, benar-benar terbahas.</p>
            </div>
            <div className="lp-panel-stats" data-reveal>
              <div className="lp-stat"><b>8–15</b><span>pertanyaan utama</span></div>
              <div className="lp-stat"><b>±30 mnt</b><span>durasi tanya jawab</span></div>
            </div>
          </div>

          <div className="lp-phases">
            {PHASES.map(([label, core], i) => (
              <div key={label} className={core ? "lp-phase core" : "lp-phase"} data-reveal>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="lp-phase-note">Kotak biru menandai fase inti — di sinilah penguji menggali paling dalam.</p>
        </div>
      </section>

      <section id="penilaian" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Hasil sidang</span>
            <h2>Penilaian yang menunjuk bab mana yang harus direvisi.</h2>
            <p>Skor dihitung dari transkrip, bukan dari kesan umum. Jawaban yang menyebut angka, metode, atau halaman bernilai jauh lebih tinggi daripada jawaban normatif.</p>
          </div>

          <div className="lp-assess">
            <div className="lp-assess-card" data-reveal>
              <h3>Empat aspek yang dinilai</h3>
              <div className="lp-dims">
                {DIMS.map(([label, val, color]) => (
                  <div key={label} className="lp-dim">
                    <span>{label}</span>
                    <div className="lp-bar"><i style={{ width: `${val}%`, background: color }} /></div>
                    <span className="lp-dim-val" style={{ color }}>{val}</span>
                  </div>
                ))}
              </div>

              <div className="lp-rule" />

              <h3 style={{ marginBottom: 6 }}>Huruf mutu &amp; kelulusan</h3>
              <p>Mengikuti skema huruf mutu sarjana; batas minimal lulus adalah C.</p>
              <div className="lp-grades">
                {GRADES.map(([label, bg, color]) => (
                  <span key={label} style={{ background: bg, color }}>{label}</span>
                ))}
              </div>
            </div>

            <div className="lp-side">
              <div className="lp-assess-card" data-reveal>
                <div className="lp-side-label">Saran revisi per bab</div>
                <div className="lp-advice">
                  <div className="lp-advice-row">
                    <b>BAB I</b>
                    <p>Hilangkan duplikasi rumusan masalah dan cantumkan halaman lampiran data selisih stok.</p>
                  </div>
                  <div className="lp-advice-row">
                    <b>BAB II</b>
                    <p>Tambahkan kolom analisis perbedaan teknis dengan penelitian terdekat.</p>
                  </div>
                  <div className="lp-advice-row">
                    <b>PRESENTASI</b>
                    <p>Siapkan ringkasan 3–5 menit: latar belakang, tujuan, metode, hasil, kesimpulan.</p>
                  </div>
                </div>
              </div>

              <div className="lp-assess-card" data-reveal>
                <div className="lp-side-label">Tersimpan di Riwayat</div>
                <p className="lp-side-body">
                  Setiap sesi tersimpan lengkap dengan transkripnya. Bandingkan skor antarsesi untuk melihat
                  aspek mana yang benar-benar membaik, dan ekspor transkrip ke CSV bila ingin dibahas bersama
                  pembimbing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="privasi" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Biaya &amp; privasi</span>
            <h2>Naskah Anda tidak ke mana-mana.</h2>
            <p>SiBiru tidak menjual token. Anda memakai API key sendiri, jadi biaya dan kendali data tetap di tangan Anda.</p>
          </div>
          <div className="lp-grid-3 tight">
            <div className="lp-card" data-reveal>
              <h3>API key disimpan terenkripsi</h3>
              <p>Key LLM dan key suara disimpan dalam bentuk terenkripsi, terpisah per akun, dan tidak pernah ditampilkan kembali secara utuh.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Satu akun, satu ruang data</h3>
              <p>Naskah, sesi, dan penilaian terikat ke akun Anda. Bisa dihapus kapan saja — termasuk menghapus PDF skripsi dari server.</p>
            </div>
            <div className="lp-card" data-reveal>
              <h3>Pemakaian token terlihat</h3>
              <p>Token input, output, cache, jumlah panggilan, dan estimasi biaya dicatat per sesi — satu sidang penuh biasanya di bawah setengah dolar.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="tanya" className="lp-section">
        <div className="lp-faq-wrap">
          <div className="lp-faq-head" data-reveal>
            <span className="lp-eyebrow">Tanya jawab</span>
            <h2>Yang biasanya ditanyakan lebih dulu.</h2>
          </div>
          <div className="lp-faq">
            {FAQ.map(([q, a], i) => {
              const open = faq === i;
              return (
                <div key={q} className={open ? "lp-faq-item open" : "lp-faq-item"} data-reveal>
                  <button
                    className="lp-faq-q"
                    aria-expanded={open}
                    onClick={() => setFaq(open ? -1 : i)}
                  >
                    <span>{q}</span>
                    <span className="lp-faq-icon" aria-hidden="true">+</span>
                  </button>
                  {open && <p className="lp-faq-a">{a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="mulai" className="lp-section">
        <div className="lp-wrap lp-close">
          <div className="lp-close-orb" aria-hidden="true" />
          <div className="lp-close-inner" data-reveal>
            <h2>Kalau sidangnya besok,<br />latihannya malam ini.</h2>
            <p>
              Unggah naskah, pilih penguji paling galak, dan cari tahu pertanyaan mana yang belum bisa Anda
              jawab — selagi masih sempat memperbaikinya.
            </p>
            <div className="lp-cta-row">
              <button className="lp-btn invert" onClick={onStart}>Mulai latihan sekarang</button>
              <a className="lp-btn on-dark" href="#cara-kerja">Baca cara pakainya lagi</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-brand">
            <img className="lp-footer-mark" src="/sibiru-icon.svg" alt="" width={32} height={32} />
            <span className="lp-brand-name">SiBiru</span>
          </div>
          <span className="lp-footer-note">Simulator sidang skripsi berbasis AI. Bukan pengganti bimbingan dosen.</span>
          <div className="lp-footer-links">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#penilaian">Penilaian</a>
            <a href="#privasi">Privasi</a>
            <a href="#tanya">Tanya jawab</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
