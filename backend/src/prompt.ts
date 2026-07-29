import type { Turn } from "./providers/types.js";

/** Giliran terakhir yang dikirim apa adanya. 6 baris ≈ 3 tanya-jawab terakhir. */
const KEEP_FULL = 6;

/** Panjang jawaban mahasiswa lama yang dipertahankan sebelum dipotong. */
const OLD_ANSWER_CHARS = 200;

/**
 * Memangkas history sebelum dikirim ke model.
 *
 * Diukur dari transkrip nyata: pertanyaan penguji rata-rata 331 karakter,
 * jawaban mahasiswa 596 dan pernah 1.924 — jawaban lisan memang bertele-tele.
 * Pada sidang 15 tanya-jawab itu ~6.000 token, bagian terbesar yang tersisa di
 * anggaran per giliran.
 *
 * Yang dipotong hanya jawaban mahasiswa yang sudah lewat. Pertanyaan penguji
 * SELALU utuh: persona melarangnya mengulang pertanyaan yang sudah diajukan,
 * dan ia hanya bisa mematuhi itu kalau masih bisa membacanya.
 *
 * ponytail: pemotongan mengambil awal jawaban, tempat mahasiswa biasanya
 * menyebut intinya. Angka yang disebut di ekor jawaban lama akan hilang —
 * kalau konfrontasi lintas-giliran ternyata melemah, simpan angka jawaban
 * (regex) alih-alih memanjangkan potongannya.
 */
export function trimHistory(history: Turn[]): Turn[] {
  if (history.length <= KEEP_FULL) return history;
  const cut = history.length - KEEP_FULL;
  return history.map((t, i) => {
    if (i >= cut || t.role === "examiner") return t;
    if (t.content.length <= OLD_ANSWER_CHARS) return t;
    return { ...t, content: `${t.content.slice(0, OLD_ANSWER_CHARS).trimEnd()}…` };
  });
}

/**
 * Pemangkasan duduk di sini, bukan di pemanggil: kedua provider melewati
 * fungsi ini, jadi tidak ada jalur yang bisa lupa memangkas.
 */
export function mapHistory(
  history: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  return trimHistory(history).map((t) => ({
    role: t.role === "examiner" ? "assistant" : "user",
    content: t.content,
  }));
}
