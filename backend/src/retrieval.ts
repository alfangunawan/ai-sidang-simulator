/**
 * BM25 atas chunk satu skripsi. Tanpa embedding, tanpa vector DB: satu dokumen
 * menghasilkan ~200-400 chunk, dan pemindaian linier atas segitu selesai jauh
 * lebih cepat daripada satu panggilan embedding — penting untuk aplikasi suara
 * yang sudah menunggu STT dan LLM.
 */
import { Stemmer } from "sastrawijs";
import type { Chunk } from "./chunker.js";

const K1 = 1.5;
const B = 0.75;

/**
 * Kata fungsi Bahasa Indonesia, plus kata kerja perintah yang selalu muncul di
 * pertanyaan penguji ("coba jelaskan", "sebutkan", "tunjukkan").
 *
 * Kelompok kedua itu wajib. IDF dihitung atas isi skripsi, dan kata seperti
 * "jelaskan" hampir tidak pernah muncul di naskah — IDF-nya jadi tinggi dan
 * kueri malah didominasi kata perintah, bukan istilah yang dicari.
 */
const STOPWORDS = new Set(
  `ada adalah agar akan anda antara apa apakah atas atau bagaimana bagi bahwa banyak
   bawah belum berapa bisa boleh coba dalam dan dapat dari dengan di dia hanya harus
   hingga ini itu jelas jika juga kalau kami karena ke kepada ketika kita lagi lain
   lalu lebih maka masih mengapa mereka mungkin namun oleh pada para per saat saja
   sama sampai sangat saya sebagai sebut secara sehingga sekarang seperti serta
   setiap suatu sudah supaya tapi telah tentang terhadap tersebut tetapi tidak tiap
   tunjuk untuk yaitu yang`
    .split(/\s+/)
    .filter(Boolean),
);

const stemmer = new Stemmer();
// Stemming Nazief-Adriani menelusuri kamus akar kata; korpus skripsi mengulang
// kata yang sama ribuan kali, jadi cache ini menghapus hampir seluruh biayanya.
const stemCache = new Map<string, string>();

function stem(word: string): string {
  let s = stemCache.get(word);
  if (s === undefined) {
    s = stemmer.stem(word);
    stemCache.set(word, s);
  }
  return s;
}

/**
 * Tokenisasi yang sengaja mempertahankan angka: "71,7", "113", "2024" adalah
 * justru bahan yang membuat penguji bisa menuntut bukti. Token murni angka
 * tidak di-stem.
 */
export function terms(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+(?:[.,][0-9]+)*/g) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    if (t.length < 2 && !/[0-9]/.test(t)) continue;
    if (STOPWORDS.has(t)) continue;
    const s = /^[0-9]/.test(t) ? t : stem(t);
    if (!STOPWORDS.has(s)) out.push(s);
  }
  return out;
}

export interface Index {
  chunks: Chunk[];
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgdl: number;
}

export function buildIndex(chunks: Chunk[]): Index {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const c of chunks) {
    const ts = terms(c.text);
    const counts = new Map<string, number>();
    for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    len.push(ts.length);
  }
  const avgdl = len.length ? len.reduce((a, b) => a + b, 0) / len.length : 0;
  return { chunks, tf, len, df, avgdl };
}

export function search(index: Index, query: string, k = 3): Chunk[] {
  const { chunks, tf, len, df, avgdl } = index;
  if (!chunks.length || !avgdl) return [];
  const q = terms(query);
  if (!q.length) return [];
  const N = chunks.length;

  const scored = chunks.map((chunk, i) => {
    let score = 0;
    for (const t of new Set(q)) {
      const f = tf[i].get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * len[i]) / avgdl));
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.idx - b.chunk.idx)
    .slice(0, k)
    .map((s) => s.chunk);
}

/**
 * Index dibangun ulang tiap giliran, sengaja. Diukur pada 400 chunk x 180 kata:
 * 10 ms dengan stem cache panas — tidak terasa di giliran yang sudah menunggu
 * STT dan LLM berdetik-detik. Meng-cache index per dokumen hanya memindahkan
 * 10 ms itu menjadi satu keadaan yang bisa basi.
 */
export function retrieve(chunks: Chunk[], query: string, k = 3): Chunk[] {
  return search(buildIndex(chunks), query, k);
}

/**
 * Menyisakan chunk yang jatuh di bab yang sedang diuji. Rentang kosong berarti
 * agenda lengkap (atau peta bab tak terbaca) — kembalikan apa adanya.
 *
 * Chunk tanpa nomor halaman ikut dipertahankan: tidak bisa dipastikan letaknya,
 * dan membuangnya diam-diam lebih berbahaya daripada menyertakan satu kutipan
 * di luar bab. Bila penyaringan menyisakan nol chunk, penyaringan dibatalkan —
 * sidang tanpa kutipan sama sekali jauh lebih buruk daripada kutipan melenceng.
 */
export function scopeToPages(chunks: Chunk[], ranges: { from: number; to: number }[]): Chunk[] {
  if (!ranges.length) return chunks;
  const kept = chunks.filter(
    (c) => c.page === null || ranges.some((r) => c.page! >= r.from && c.page! <= r.to),
  );
  return kept.length ? kept : chunks;
}

/** Kutipan berlabel lokasi, siap disitir: "[BAB III METODOLOGI, hlm. 41] …". */
export function formatChunks(chunks: Chunk[]): string {
  return chunks
    .map((c) => {
      const where = [c.heading, c.page ? `hlm. ${c.page}` : null].filter(Boolean).join(", ");
      return `[${where || "naskah"}] ${c.text}`;
    })
    .join("\n\n");
}

/**
 * Kutipan ditempel ke pesan user, bukan system block (§4 keputusan #4 PRD).
 * Label "bukan ucapan mahasiswa" wajib: tanpa itu model berisiko membaca
 * kutipan sebagai jawaban mahasiswa dan melanggar DIALOGUE_RULES.
 */
export function formatExcerpts(chunks: Chunk[]): string {
  if (!chunks.length) return "";
  return `\n\n---\nKUTIPAN NASKAH YANG RELEVAN (rujukan Anda, bukan ucapan mahasiswa):\n${formatChunks(chunks)}`;
}
