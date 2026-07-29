/**
 * Dossier: ringkasan terstruktur satu skripsi, dibangun sekali per dokumen dan
 * dipakai sebagai pengganti naskah utuh di setiap giliran.
 *
 * Kualitasnya menentukan seluruh sesi dokumen itu, dan kegagalannya senyap —
 * karena itu skema divalidasi ketat dan `parse` menolak dossier yang kehilangan
 * bagian inti, alih-alih meneruskan objek setengah jadi.
 */

import type Database from "better-sqlite3";
import { getProvider } from "./providers/index.js";
import { getEffectiveLlmConfig, resolveSourceUser } from "./effectiveConfig.js";
import { recordUsage } from "./repos/usage.js";
import { setDossierPending, setDossierReady, setDossierFailed } from "./repos/documents.js";
import { CRITIQUE_TRIGGERS } from "./questionBank.js";

// Penanda internal: model menyentuh ceiling output sebelum JSON selesai.
const TRUNCATED = "dossier truncated";

/**
 * Ceiling output pembangun dossier. Harus menutupi token reasoning DITAMBAH
 * JSON penuh — pelajaran yang sama dengan ASSESSMENT_MAX_TOKENS: ceiling yang
 * kekecilan dibayar penuh dan tetap gagal.
 */
export const DOSSIER_MAX_TOKENS = 8000;

/** Naikkan bila skema atau prompt berubah, supaya dossier lama bisa dikenali. */
export const DOSSIER_VERSION = 1;

export interface Dossier {
  judul: string;
  rumusan_masalah: string[];
  tujuan: string[];
  batasan: string[];
  metode: { nama: string; justifikasi: string };
  instrumen: string[];
  populasi_sampel: { deskripsi: string; jumlah: number | null };
  hasil_kunci: { klaim: string; angka: string; sumber: string }[];
  kesimpulan: string[];
  keterbatasan: string[];
  peta_bab: { judul: string; halaman_mulai: number | null }[];
  fakta_struktural: {
    jumlah_rumusan_masalah: number;
    jumlah_kesimpulan: number;
    rumusan_tanpa_kesimpulan: string[];
    sitasi_bab2_tidak_di_daftar_pustaka: string[];
    jumlah_tabel: number;
    jumlah_gambar: number;
  };
  modul_kritik_terpicu: string[];
  poin_serangan: string[];
}

// Nama modul hidup di questionBank.ts — satu sumber, supaya dossier tidak bisa
// menandai modul yang tidak punya isi.
export { CRITIQUE_TRIGGERS } from "./questionBank.js";

export function buildDossierSystem(): string {
  return `Anda adalah asisten analis yang membaca naskah skripsi S1 secara menyeluruh dan menghasilkan dossier terstruktur untuk dipakai dosen penguji.

Aturan keras:
- "rumusan_masalah", "kesimpulan", dan setiap "hasil_kunci.angka" WAJIB kutipan persis dari naskah. JANGAN memparafrase. Penguji akan menuntut mahasiswa kata per kata; parafrase membuat tuntutan itu salah sasaran.
- Jangan mengarang. Bila sebuah bagian tidak ada di naskah, isi dengan array kosong, string kosong, atau null.
- "poin_serangan" berisi inkonsistensi NYATA yang Anda temukan saat membaca: rumusan masalah yang tidak terjawab di kesimpulan, angka yang berbeda antar bab, klaim yang melampaui data, metode yang disebut di Bab 3 tetapi tidak tampak di Bab 4.
- "modul_kritik_terpicu" hanya diisi bila pemicunya benar-benar terpenuhi: "sistem" (skripsi membangun aplikasi/sistem), "kuesioner" (evaluasi memakai UAT/SUS/TAM/kuesioner), "ai" (memakai AI/LLM/chatbot), "domain_sensitif" (kesehatan, kesehatan mental, hukum, keuangan, anak).
- Ringkas. Seluruh dossier harus di bawah 3.500 token. Panjangkan hanya bagian kutipan verbatim.

Keluarkan HANYA JSON valid (tanpa teks lain, tanpa code fence) dengan bentuk persis:
{
  "judul": "<judul skripsi>",
  "rumusan_masalah": ["<verbatim>"],
  "tujuan": ["<verbatim>"],
  "batasan": ["<poin>"],
  "metode": { "nama": "<nama metode>", "justifikasi": "<alasan pemilihan menurut naskah>" },
  "instrumen": ["<instrumen/alat ukur>"],
  "populasi_sampel": { "deskripsi": "<siapa dan bagaimana dipilih>", "jumlah": <angka atau null> },
  "hasil_kunci": [{ "klaim": "<klaim>", "angka": "<angka verbatim>", "sumber": "<Tabel 4.3 / hlm. 62>" }],
  "kesimpulan": ["<verbatim>"],
  "keterbatasan": ["<poin>"],
  "peta_bab": [{ "judul": "<BAB I PENDAHULUAN>", "halaman_mulai": <angka atau null> }],
  "fakta_struktural": {
    "jumlah_rumusan_masalah": <angka>,
    "jumlah_kesimpulan": <angka>,
    "rumusan_tanpa_kesimpulan": ["<rumusan masalah yang tidak terjawab di kesimpulan>"],
    "sitasi_bab2_tidak_di_daftar_pustaka": ["<sitasi>"],
    "jumlah_tabel": <angka>,
    "jumlah_gambar": <angka>
  },
  "modul_kritik_terpicu": ["sistem"],
  "poin_serangan": ["<inkonsistensi konkret, sebut bab/angkanya>"]
}`;
}

export function buildDossierUser(fullText: string): string {
  return `NASKAH SKRIPSI LENGKAP:\n${fullText}`;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function intOrNull(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? Math.round(v) : null;
}

function int(v: unknown): number {
  return intOrNull(v) ?? 0;
}

export function parseDossier(text: string): Dossier {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("dossier JSON not found");
  const o = JSON.parse(text.slice(start, end + 1)) as any;

  const rumusan = strArray(o?.rumusan_masalah);
  const judul = str(o?.judul);
  // Dossier tanpa judul atau tanpa rumusan masalah bukan dossier yang lemah,
  // melainkan tanda pembacaan gagal. Meneruskannya berarti setiap sesi dokumen
  // ini berjalan tanpa dasar — lebih baik gagal keras dan minta bangun ulang.
  if (!judul || !rumusan.length) throw new Error("dossier missing judul/rumusan_masalah");

  const hasil = Array.isArray(o?.hasil_kunci)
    ? o.hasil_kunci
        .filter((h: any) => h && (str(h.klaim) || str(h.angka)))
        .map((h: any) => ({ klaim: str(h.klaim), angka: str(h.angka), sumber: str(h.sumber) }))
    : [];

  const peta = Array.isArray(o?.peta_bab)
    ? o.peta_bab
        .filter((b: any) => b && str(b.judul))
        .map((b: any) => ({ judul: str(b.judul), halaman_mulai: intOrNull(b.halaman_mulai) }))
    : [];

  const kesimpulan = strArray(o?.kesimpulan);
  const f = o?.fakta_struktural ?? {};

  return {
    judul,
    rumusan_masalah: rumusan,
    tujuan: strArray(o?.tujuan),
    batasan: strArray(o?.batasan),
    metode: { nama: str(o?.metode?.nama), justifikasi: str(o?.metode?.justifikasi) },
    instrumen: strArray(o?.instrumen),
    populasi_sampel: {
      deskripsi: str(o?.populasi_sampel?.deskripsi),
      jumlah: intOrNull(o?.populasi_sampel?.jumlah),
    },
    hasil_kunci: hasil,
    kesimpulan,
    keterbatasan: strArray(o?.keterbatasan),
    peta_bab: peta,
    fakta_struktural: {
      // Hitungan dari model kerap meleset; panjang array yang sudah terparse
      // adalah kebenaran yang lebih murah dan tidak bisa berbeda dari isinya.
      jumlah_rumusan_masalah: rumusan.length,
      jumlah_kesimpulan: kesimpulan.length,
      rumusan_tanpa_kesimpulan: strArray(f?.rumusan_tanpa_kesimpulan),
      sitasi_bab2_tidak_di_daftar_pustaka: strArray(f?.sitasi_bab2_tidak_di_daftar_pustaka),
      jumlah_tabel: int(f?.jumlah_tabel),
      jumlah_gambar: int(f?.jumlah_gambar),
    },
    modul_kritik_terpicu: strArray(o?.modul_kritik_terpicu).filter((m) =>
      CRITIQUE_TRIGGERS.includes(m),
    ),
    poin_serangan: strArray(o?.poin_serangan),
  };
}

/**
 * Membangun dossier dan menyimpannya. Dipanggil tanpa di-await oleh rute upload
 * — satu panggilan LLM atas naskah 145k token butuh puluhan detik, dan
 * menahannya di request upload berarti timeout.
 *
 * Tidak pernah melempar: kegagalan mendarat di `dossier_status = 'failed'`
 * berikut pesannya, karena itulah satu-satunya jalan UI memberi tahu user dan
 * menawarkan bangun ulang.
 */
export async function buildDossier(
  db: Database.Database,
  userId: number,
  key: Buffer,
  documentId: number,
  fullText: string,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  setDossierPending(db, documentId);
  try {
    const cfg = getEffectiveLlmConfig(db, userId, key);
    const provider = getProvider(cfg);
    const keyOwner = resolveSourceUser(db, userId, "ai");

    const attempt = async (): Promise<Dossier> => {
      const out = await provider.generate(
        buildDossierSystem(),
        buildDossierUser(fullText),
        DOSSIER_MAX_TOKENS,
      );
      recordUsage(db, userId, keyOwner, now(), cfg.provider, cfg.model, "dossier", out.usage);
      if (out.truncated) throw new Error(TRUNCATED);
      return parseDossier(out.text);
    };

    let dossier: Dossier;
    try {
      dossier = await attempt();
    } catch (e) {
      // Sama dengan jalur assessment: jawaban terpotong itu deterministik —
      // percobaan kedua dibayar penuh dan gagal identik. Hanya JSON rusak yang
      // pantas diulang.
      if ((e as Error).message === TRUNCATED) throw e;
      dossier = await attempt();
    }

    setDossierReady(db, documentId, JSON.stringify(dossier), DOSSIER_VERSION, cfg.model);
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[dossier build failed]", msg);
    setDossierFailed(
      db,
      documentId,
      msg === TRUNCATED
        ? "Model kehabisan token output sebelum dossier selesai. Coba model lain di Pengaturan."
        : "Gagal membaca skripsi menjadi dossier.",
    );
  }
}

const bullets = (label: string, items: string[]): string =>
  items.length ? `${label}:\n${items.map((x) => `- ${x}`).join("\n")}` : "";

/** Render dossier jadi teks prompt. Bagian kosong dibuang, bukan dicetak kosong. */
export function formatDossier(d: Dossier): string {
  const f = d.fakta_struktural;
  const parts = [
    `DOSSIER SKRIPSI (rujukan Anda tentang isi naskah)`,
    `Judul: ${d.judul}`,
    bullets("Rumusan masalah (verbatim)", d.rumusan_masalah),
    bullets("Tujuan", d.tujuan),
    bullets("Batasan", d.batasan),
    d.metode.nama ? `Metode: ${d.metode.nama}${d.metode.justifikasi ? ` — ${d.metode.justifikasi}` : ""}` : "",
    bullets("Instrumen", d.instrumen),
    d.populasi_sampel.deskripsi || d.populasi_sampel.jumlah !== null
      ? `Populasi/sampel: ${d.populasi_sampel.deskripsi}${d.populasi_sampel.jumlah !== null ? ` (n=${d.populasi_sampel.jumlah})` : ""}`
      : "",
    bullets(
      "Hasil kunci",
      d.hasil_kunci.map((h) => `${h.klaim} — ${h.angka}${h.sumber ? ` (${h.sumber})` : ""}`),
    ),
    bullets("Kesimpulan (verbatim)", d.kesimpulan),
    bullets("Keterbatasan", d.keterbatasan),
    bullets(
      "Peta bab",
      d.peta_bab.map((b) => `${b.judul}${b.halaman_mulai !== null ? ` — hlm. ${b.halaman_mulai}` : ""}`),
    ),
    [
      `Fakta struktural: ${f.jumlah_rumusan_masalah} rumusan masalah, ${f.jumlah_kesimpulan} kesimpulan, ${f.jumlah_tabel} tabel, ${f.jumlah_gambar} gambar.`,
      bullets("Rumusan masalah yang tidak terjawab di kesimpulan", f.rumusan_tanpa_kesimpulan),
      bullets("Sitasi Bab 2 yang tidak ada di Daftar Pustaka", f.sitasi_bab2_tidak_di_daftar_pustaka),
    ]
      .filter(Boolean)
      .join("\n"),
    bullets("POIN SERANGAN (prioritaskan)", d.poin_serangan),
  ];
  return parts.filter(Boolean).join("\n\n");
}
