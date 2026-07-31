import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { EarlyAccessBanner } from "../components/EarlyAccess.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  ["Penguasaan materi", 45, "bg-warning"],
  ["Metodologi", 60, "bg-primary"],
  ["Kualitas & orisinalitas", 72, "bg-success"],
  ["Argumentasi & pertahanan", 35, "bg-warning"],
];

const DIM_TEXT: Record<string, string> = {
  "bg-warning": "text-warning",
  "bg-primary": "text-primary",
  "bg-success": "text-success",
};

const GRADES: [string, string][] = [
  ["A · >85", "bg-success/15 text-success"],
  ["AB · 75–85", "bg-success/15 text-success"],
  ["B · 65–75", "bg-primary/10 text-primary"],
  ["BC · 60–65", "bg-primary/10 text-primary"],
  ["C · 50–60", "bg-warning/15 text-warning"],
  ["D · 40–50", "bg-destructive/10 text-destructive"],
  ["E · ≤40", "bg-destructive/10 text-destructive"],
];

const NAV: [string, string][] = [
  ["#cara-kerja", "Cara kerja"],
  ["#penguji", "Penguji"],
  ["#penilaian", "Penilaian"],
  ["#privasi", "Biaya & privasi"],
  ["#tanya", "Tanya jawab"],
];

const PROBLEMS: [string, string, string, string][] = [
  [
    "Masalahnya",
    "bg-destructive/10 text-destructive",
    "Latihan dengan teman terlalu ramah",
    "Tidak ada yang berani mengejar sampai Anda kehabisan alasan. Padahal justru di situ sidang biasanya jatuh.",
  ],
  [
    "Yang terjadi",
    "bg-warning/15 text-warning",
    "Pertanyaan yang mematikan itu spesifik",
    "“Ada di halaman berapa?”, “Itu asumsi atau ada datanya?”, “Bedanya apa dengan penelitian X?” — semua menyasar isi naskah Anda, bukan teori umum.",
  ],
  [
    "Solusinya",
    "bg-success/15 text-success",
    "Penguji yang sudah membaca naskah Anda",
    "Unggah PDF-nya sekali. Setiap pertanyaan lahir dari bab, tabel, dan angka yang benar-benar ada di skripsi Anda.",
  ],
];

const RULES: [string, string][] = [
  [
    "Minta bukti, bukan klaim",
    "Setiap klaim tentang isi skripsi harus disertai bab, halaman, atau tabelnya. Tanpa itu, penguji tidak pindah topik.",
  ],
  [
    "Konfrontasi inkonsistensi",
    "Jawaban Anda dibandingkan dengan isi naskah. Kalau Bab 3 bilang X dan Anda bilang Y, itu langsung ditunjukkan.",
  ],
  [
    "Laddering bertahap",
    "Permukaan → minta bukti → konfrontasi → pertanyaan hipotetis → justifikasi keputusan desain. Maksimal tiga follow-up per topik.",
  ],
  [
    "“Lanjut” bukan jawaban",
    "Mendorong penguji pindah dengan “ya”, “oke”, atau “lanjut” justru membuat pertanyaan yang sama diulang lebih tajam.",
  ],
  [
    "Satu butir sekali uji",
    "Menjawab tiga rumusan masalah sekaligus tidak dihitung selesai. Penguji memilih satu butir dan mengujinya sampai tuntas.",
  ],
  [
    "Modul kritik domain",
    "Skripsi pengembangan sistem, evaluasi kuesioner (SUS/UAT/TAM), penggunaan LLM, atau domain sensitif punya daftar serangan khususnya sendiri.",
  ],
];

const PRIVACY: [string, string][] = [
  [
    "API key disimpan terenkripsi",
    "Key LLM dan key suara disimpan dalam bentuk terenkripsi, terpisah per akun, dan tidak pernah ditampilkan kembali secara utuh.",
  ],
  [
    "Satu akun, satu ruang data",
    "Naskah, sesi, dan penilaian terikat ke akun Anda. Bisa dihapus kapan saja — termasuk menghapus PDF skripsi dari server.",
  ],
  [
    "Pemakaian token terlihat",
    "Token input, output, cache, jumlah panggilan, dan estimasi biaya dicatat per sesi — satu sidang penuh biasanya di bawah setengah dolar.",
  ],
];

const STEPS: { n: string; title: string; body: React.ReactNode; aside: React.ReactNode }[] = [
  {
    n: "01",
    title: "Hubungkan model AI Anda",
    body: (
      <>
        Di tab <b>Pengaturan → Model AI</b>, pilih provider (OpenRouter, Anthropic, OpenAI,
        atau Google AI Studio), isi nama model, lalu tempel API key Anda. Tekan{" "}
        <b>Tes koneksi</b> untuk memastikan key valid sebelum mulai.
      </>
    ),
    aside: (
      <>
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          Provider
        </div>
        <div className="mt-1 text-sm font-semibold">OpenRouter · z-ai/glm-5.2</div>
        <span className="mt-2 inline-block rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
          ✓ Terhubung
        </span>
      </>
    ),
  },
  {
    n: "02",
    title: "Unggah naskah skripsi",
    body: (
      <>
        Tarik file PDF naskah terbaru ke <b>Pengaturan → Dokumen skripsi</b>. Teksnya
        diekstrak dan menjadi satu-satunya sumber pertanyaan penguji — termasuk nomor bab,
        nama tabel, dan angka hasil pengujian Anda.
      </>
    ),
    aside: (
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-[10px] font-bold text-destructive">
          PDF
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">ta_fixed.pdf</div>
          <div className="text-xs text-muted-foreground">113.512 karakter · terindeks</div>
        </div>
      </div>
    ),
  },
  {
    n: "03",
    title: "Atur karakter penguji",
    body: (
      <>
        Pilih seberapa keras (mode) dan apa yang dikejar (tipe). Kalau Anda sudah tahu titik
        lemah naskah sendiri, tulis di kolom <b>poin serangan</b> — maksimal 8 baris — dan
        penguji akan memprioritaskannya.
      </>
    ),
    aside: (
      <>
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          Poin serangan
        </div>
        <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic">
          “Klaim efisiensi 40% belum ada buktinya; skor SUS 56,25 dibaca sebagai
          persentase.”
        </p>
      </>
    ),
  },
  {
    n: "04",
    title: "Jalani sidang secara lisan",
    body: (
      <>
        Tekan <b>Rekam</b> lalu bicara seperti di ruang sidang; jawaban Anda ditranskrip
        otomatis, dan pertanyaan penguji dibacakan dengan suara. Sedang di tempat ramai?
        Ketik saja jawabannya.
      </>
    ),
    aside: (
      <>
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          Suara penguji
        </div>
        <div className="mt-1 text-sm font-semibold">id-ID-Chirp3-HD-Leda</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Google Cloud · ElevenLabs · browser
        </div>
      </>
    ),
  },
  {
    n: "05",
    title: "Akhiri sidang, baca penilaiannya",
    body: (
      <>
        Begitu seluruh fase terbahas, penguji mengusulkan menutup sidang. Anda langsung
        menerima skor empat aspek, huruf mutu, daftar kelebihan–kekurangan, dan saran revisi
        yang menyebut bab mana yang harus diperbaiki.
      </>
    ),
    aside: (
      <div className="flex items-center gap-3">
        <span className="font-serif text-3xl font-semibold">62</span>
        <div>
          <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">
            BC
          </span>
          <div className="mt-1 text-xs text-muted-foreground">Lulus dengan revisi</div>
        </div>
      </div>
    ),
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
      {children}
    </span>
  );
}

function SectionHead({
  eyebrow,
  title,
  lede,
  dark,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: string;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center" data-reveal>
      <span
        className={cn(
          "text-[11px] font-bold tracking-widest uppercase",
          dark ? "text-primary-foreground/60" : "text-primary",
        )}
      >
        {eyebrow}
      </span>
      <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed",
            dark ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [mode, setMode] = useState(2);
  const [type, setType] = useState(1);
  const [faq, setFaq] = useState(0);

  useScrollReveal();

  const m = MODES[mode];
  const t = TYPES[type];

  return (
    <div className="min-h-dvh bg-background">
      {/* Di atas header, bukan di dalamnya: header ini sticky, dan pengumuman
          yang ikut menempel memakan tinggi layar sepanjang halaman. */}
      <EarlyAccessBanner />

      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3">
          <a href="#atas" className="flex items-center gap-2.5">
            <img src="/sibiru-icon.svg" alt="" width={34} height={34} />
            <span className="leading-tight">
              <span className="block font-serif text-lg font-semibold tracking-tight">
                SiBiru
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Simulator Sidang Skripsi
              </span>
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex gap-2 lg:ml-0">
            <Button variant="ghost" onClick={onStart}>
              Masuk
            </Button>
            <Button onClick={onStart}>Mulai latihan</Button>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section id="atas" className="relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-xs">
              <i className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Penguji AI yang membaca naskah skripsi Anda
            </span>
            <h1 className="mt-5 font-serif text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Latihan dihabisi penguji,
              <br />
              sebelum hari sidang tiba.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              SiBiru membaca PDF skripsi Anda, lalu memerankan dosen penguji sungguhan:
              bertanya dari isi naskah, mengejar jawaban yang mengambang, dan menutup sidang
              dengan nilai serta daftar revisi per bab.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" onClick={onStart}>
                Mulai latihan gratis
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#cara-kerja">Lihat cara pakainya</a>
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                ["7 fase", "agenda sidang penuh"],
                ["6", "penguji bernama"],
                ["15+", "pertanyaan per sidang"],
                ["API key", "milik Anda sendiri"],
              ].map(([b, s]) => (
                <div key={s}>
                  <dt className="font-serif text-xl font-semibold">{b}</dt>
                  <dd className="text-xs text-muted-foreground">{s}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Session mock */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-primary/10 blur-2xl"
            />
            <Card className="relative overflow-hidden py-0 shadow-xl">
              <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  RW
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    Dr. Ratna Wijaya, M.Kom.
                  </div>
                  {/* Same wording the session header uses; Ratna is standar/metodolog in personas.ts. */}
                  <div className="truncate text-xs text-muted-foreground">
                    Sang metodolog · mode Standar
                  </div>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive">
                  <i className="size-1.5 animate-pulse rounded-full bg-destructive" />
                  MEREKAM
                </span>
              </div>

              <div className="flex flex-col gap-4 px-4 py-5 text-sm">
                <div className="flex gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    RW
                  </div>
                  <p className="rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 leading-relaxed">
                    Anda menulis selisih stok 111 item di Bab 1. Tunjukkan halaman berapa
                    data lapangannya, dan siapa yang mencatat angka itu.
                  </p>
                </div>
                <div className="flex flex-row-reverse gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    AR
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="rounded-xl rounded-tr-sm bg-primary px-3.5 py-2.5 leading-relaxed text-primary-foreground">
                      Ada di lampiran Stock Opname, Bu. Tapi halamannya belum saya cantumkan
                      di Bab 1.
                    </p>
                    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                      <b className="block text-[10px] tracking-widest text-warning uppercase">
                        Catatan
                      </b>
                      <span className="text-muted-foreground">
                        Klaim tanpa rujukan halaman. Penguji akan mengejar titik ini lagi.
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    RW
                  </div>
                  <p className="rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 leading-relaxed">
                    Berarti angka itu belum bisa dipertanggungjawabkan di naskah. Kalau
                    begitu, atas dasar apa Anda menyimpulkan pencatatan manual yang jadi
                    penyebabnya?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-3 text-xs">
                <span className="flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1.5 font-semibold text-white">
                  <i className="size-2 rounded-xs bg-white" aria-hidden="true" />
                  Berhenti
                </span>
                <span className="text-muted-foreground">Mendengarkan jawaban Anda…</span>
                <span className="ml-auto font-mono tabular-nums">12:34</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {PROBLEMS.map(([tag, tone, title, body]) => (
            <Card key={title} data-reveal>
              <CardContent>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>
                  {tag}
                </span>
                <h3 className="mt-3 font-serif text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="cara-kerja" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <SectionHead
          eyebrow="Cara penggunaan"
          title="Lima langkah, sekitar sepuluh menit persiapan."
          lede="Setelah setup pertama selesai, latihan berikutnya cukup satu klik: buka tab Latihan, tekan Rekam, dan sidang dimulai."
        />
        <div className="flex flex-col gap-4">
          {STEPS.map((s) => (
            <Card key={s.n} data-reveal>
              <CardContent className="grid items-start gap-5 lg:grid-cols-[3rem_minmax(0,1fr)_18rem]">
                <span className="font-serif text-3xl font-semibold text-primary/30">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-serif text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">{s.aside}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- Examiner picker ---------------- */}
      <section id="penguji" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="rounded-3xl bg-foreground px-6 py-14 text-primary-foreground sm:px-12">
          <SectionHead
            dark
            eyebrow="Karakter penguji"
            title="Tentukan seberapa keras, dan apa yang dikejar."
            lede="Mode mengatur tekanan; tipe mengatur sudut serang. Enam karakter siap pakai dirakit dari keduanya — dari pembimbing yang menenangkan sampai penguji senior tanpa ampun."
          />

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-6" data-reveal>
              <div>
                <div className="mb-3 text-[11px] font-bold tracking-widest text-primary-foreground/60 uppercase">
                  Mode — seberapa keras
                </div>
                <div className="flex flex-wrap gap-2">
                  {MODES.map(([label], i) => (
                    <button
                      key={label}
                      aria-pressed={mode === i}
                      onClick={() => setMode(i)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                        mode === i
                          ? "border-transparent bg-primary-foreground text-foreground"
                          : "border-primary-foreground/25 text-primary-foreground/75 hover:border-primary-foreground/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 text-[11px] font-bold tracking-widest text-primary-foreground/60 uppercase">
                  Tipe — apa yang dikejar
                </div>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map(([label], i) => (
                    <button
                      key={label}
                      aria-pressed={type === i}
                      onClick={() => setType(i)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                        type === i
                          ? "border-transparent bg-primary-foreground text-foreground"
                          : "border-primary-foreground/25 text-primary-foreground/75 hover:border-primary-foreground/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              key={`${mode}-${type}`}
              className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-6"
            >
              {/* An illustration of the two dials, not the app's picker — that is six named cards. */}
              <div className="text-[11px] font-bold tracking-widest text-primary-foreground/50 uppercase">
                Contoh kombinasi
              </div>
              <h3 className="mt-2 font-serif text-2xl font-semibold">
                Penguji {m[0]} · {t[0]}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-primary-foreground/70">{m[1]}</p>
              <p className="mt-2 text-sm leading-relaxed text-primary-foreground/70">{t[1]}</p>
              <div className="mt-5 border-t border-primary-foreground/15 pt-4">
                <div className="text-[11px] font-bold tracking-widest text-primary-foreground/50 uppercase">
                  Contoh pertanyaan
                </div>
                <p className="mt-2 font-serif text-lg italic">“{t[2]}”</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Chasing rules ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHead
          eyebrow="Aturan mengejar"
          title="Jawaban mengambang tidak akan dilepaskan."
          lede="Penguji SiBiru menjalankan aturan yang sama dengan penguji sungguhan: satu topik tidak ditutup sebelum jawaban Anda menyentuh sesuatu yang bisa diperiksa."
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([title, body]) => (
            <Card key={title} data-reveal>
              <CardContent>
                <h3 className="font-serif text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- Phases ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <Card className="bg-muted/40">
          <CardContent className="py-4">
            <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <SectionHead
                eyebrow="Agenda sidang"
                title="Tujuh fase, dilalui berurutan."
                lede="Fase inti mendapat minimal dua pertanyaan menggali. Sidang baru boleh ditutup setelah semua fase, termasuk Penutup, benar-benar terbahas."
              />
              <div className="mb-10 grid grid-cols-2 gap-5" data-reveal>
                <div>
                  <div className="font-serif text-xl font-semibold">8–15</div>
                  <div className="text-xs text-muted-foreground">pertanyaan utama</div>
                </div>
                <div>
                  <div className="font-serif text-xl font-semibold">±30 mnt</div>
                  <div className="text-xs text-muted-foreground">durasi tanya jawab</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PHASES.map(([label, core], i) => (
                <div
                  key={label}
                  data-reveal
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    core ? "border-primary/30 bg-primary/5" : "bg-card",
                  )}
                >
                  <b
                    className={cn(
                      "font-mono text-xs",
                      core ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </b>
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Kotak biru menandai fase inti — di sinilah penguji menggali paling dalam.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ---------------- Assessment ---------------- */}
      <section id="penilaian" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <SectionHead
          eyebrow="Hasil sidang"
          title="Penilaian yang menunjuk bab mana yang harus direvisi."
          lede="Skor dihitung dari transkrip, bukan dari kesan umum. Jawaban yang menyebut angka, metode, atau halaman bernilai jauh lebih tinggi daripada jawaban normatif."
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card data-reveal>
            <CardContent>
              <h3 className="font-serif text-lg font-semibold">Empat aspek yang dinilai</h3>
              <div className="mt-4 flex flex-col gap-3">
                {DIMS.map(([label, val, bar]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3"
                  >
                    <span className="text-sm">{label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <i
                        className={cn("block h-full rounded-full", bar)}
                        style={{ width: `${val}%` }}
                      />
                    </span>
                    <span className={cn("text-right text-sm font-bold", DIM_TEXT[bar])}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              <hr className="my-6" />

              <h3 className="font-serif text-lg font-semibold">Huruf mutu &amp; kelulusan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Mengikuti skema huruf mutu sarjana; batas minimal lulus adalah C.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {GRADES.map(([label, tone]) => (
                  <span
                    key={label}
                    className={cn("rounded-full px-3 py-1 text-xs font-semibold", tone)}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-5">
            <Card data-reveal>
              <CardContent>
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                  Saran revisi per bab
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  {[
                    ["BAB I", "Hilangkan duplikasi rumusan masalah dan cantumkan halaman lampiran data selisih stok."],
                    ["BAB II", "Tambahkan kolom analisis perbedaan teknis dengan penelitian terdekat."],
                    ["PRESENTASI", "Siapkan ringkasan 3–5 menit: latar belakang, tujuan, metode, hasil, kesimpulan."],
                  ].map(([bab, note]) => (
                    <div key={bab}>
                      <b className="font-mono text-[11px] text-primary">{bab}</b>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card data-reveal>
              <CardContent>
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                  Tersimpan di Riwayat
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Setiap sesi tersimpan lengkap dengan transkripnya. Bandingkan skor
                  antarsesi untuk melihat aspek mana yang benar-benar membaik, dan ekspor
                  transkrip ke CSV bila ingin dibahas bersama pembimbing.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------- Privacy ---------------- */}
      <section id="privasi" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <SectionHead
          eyebrow="Biaya &amp; privasi"
          title="Naskah Anda tidak ke mana-mana."
          lede="SiBiru tidak menjual token. Anda memakai API key sendiri, jadi biaya dan kendali data tetap di tangan Anda."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {PRIVACY.map(([title, body]) => (
            <Card key={title} data-reveal>
              <CardContent>
                <h3 className="font-serif text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="tanya" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-16">
        <SectionHead eyebrow="Tanya jawab" title="Yang biasanya ditanyakan lebih dulu." />
        <div className="flex flex-col gap-2">
          {FAQ.map(([q, a], i) => {
            const open = faq === i;
            return (
              <div
                key={q}
                data-reveal
                className={cn(
                  "rounded-xl border bg-card transition-colors",
                  open && "border-primary/30 bg-primary/5",
                )}
              >
                <button
                  aria-expanded={open}
                  onClick={() => setFaq(open ? -1 : i)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium"
                >
                  <span className="flex-1">{q}</span>
                  <Plus
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-45",
                    )}
                  />
                </button>
                {open && (
                  <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section id="mulai" className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-white/15 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl" data-reveal>
            <h2 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Kalau sidangnya besok,
              <br />
              latihannya malam ini.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
              Unggah naskah, pilih penguji paling galak, dan cari tahu pertanyaan mana yang
              belum bisa Anda jawab — selagi masih sempat memperbaikinya.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="secondary" onClick={onStart}>
                Mulai latihan sekarang
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                asChild
              >
                <a href="#cara-kerja">Baca cara pakainya lagi</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-8">
          <div className="flex items-center gap-2">
            <img src="/sibiru-icon.svg" alt="" width={28} height={28} />
            <span className="font-serif text-base font-semibold">SiBiru</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Simulator sidang skripsi berbasis AI. Bukan pengganti bimbingan dosen.
          </span>
          <div className="ml-auto flex flex-wrap gap-4 text-xs text-muted-foreground">
            <a href="#cara-kerja" className="hover:text-foreground">Cara kerja</a>
            <a href="#penilaian" className="hover:text-foreground">Penilaian</a>
            <a href="#privasi" className="hover:text-foreground">Privasi</a>
            <a href="#tanya" className="hover:text-foreground">Tanya jawab</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
