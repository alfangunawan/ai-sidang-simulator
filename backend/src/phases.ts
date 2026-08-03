// Sidang agenda phases, kept in their own module so both the persona builder
// and the question bank can import them without a cycle.
export const SIDANG_PHASES = [
  "Pembukaan",
  "Latar Belakang & Rumusan Masalah",
  "Tinjauan Pustaka",
  "Metodologi",
  "Hasil & Pembahasan",
  "Kesimpulan & Kontribusi",
  "Penutup",
];

// Phases where the examiner must dig with more than one question. These are the
// five that map 1:1 onto the skripsi's chapters, so they — and only they — are
// what the student may switch off when starting a sitting. Pembukaan and Penutup
// are sidang ritual, not chapters: the opening presentation and the closing
// summary of weaknesses run in every sitting.
export const CORE_PHASES = SIDANG_PHASES.slice(1, -1);

/**
 * Fase yang dipilih user untuk satu sesi, dari body request. `null` berarti
 * "semua" — bentuk penyimpanan yang sama dipakai di DB, jadi memilih kelima bab
 * tidak dibedakan dari tidak memilih sama sekali.
 *
 * Nama yang tidak dikenal dilempar, bukan diam-diam dibuang: frontend menulis
 * nama fase ini sebagai konstanta sendiri, dan satu salah ketik yang lolos akan
 * menghasilkan sidang "semua bab" yang terlihat benar sampai transkripnya dibaca.
 */
export function normalizePhases(input: unknown): string[] | null {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) throw new Error("phases must be an array");
  const picked = new Set<string>();
  for (const p of input) {
    if (typeof p !== "string" || !CORE_PHASES.includes(p)) {
      throw new Error(`unknown phase: ${String(p)}`);
    }
    picked.add(p);
  }
  if (!picked.size) throw new Error("phases must not be empty");
  const kept = CORE_PHASES.filter((p) => picked.has(p));
  return kept.length === CORE_PHASES.length ? null : kept;
}

/** Agenda sesi: fase inti terpilih ditambah Pembukaan dan Penutup yang selalu ada. */
export function sessionPhases(stored: string | null | undefined): string[] {
  if (!stored) return SIDANG_PHASES;
  const on = new Set(stored.split(","));
  return SIDANG_PHASES.filter((p) => on.has(p) || !CORE_PHASES.includes(p));
}

/**
 * Jadwal fase per giliran. Server yang membagi jatah, bukan model.
 *
 * Larangan saja tidak pernah cukup: empat lapis larangan menahan penguji keluar
 * agenda, tetapi tak satu pun MEWAJIBKAN dia menyentuh tiap bab yang dipilih —
 * di uji langsung 11 dari 20 sidang punya bab terpilih yang tidak pernah
 * tergali, termasuk satu sidang yang melewatkan dua dari tiga babnya.
 *
 * Dengan jadwal, cakupan berhenti jadi statistik dan menjadi invariant: tiap
 * bab inti terpilih dijamin kebagian minimal dua giliran, dan itu dibuktikan
 * satu unit test atas fungsi ini — bukan dengan menjalankan ratusan sidang.
 *
 * Slot pertama Pembukaan, slot terakhir Penutup, sisanya dibagi rata ke bab
 * inti secara bergiliran. Sesudah jadwal habis (sidang boleh lebih panjang dari
 * ambang), fase berputar kembali ke bab inti supaya giliran tambahan tetap
 * punya tuan rumah.
 */
export function phaseSchedule(phases: string[], min: number): string[] {
  const core = phases.filter((p) => CORE_PHASES.includes(p));
  if (!core.length) return [phases[0] ?? "Pembukaan"];
  const middle = Math.max(core.length, min - 2);
  const slots: string[] = ["Pembukaan"];
  for (let i = 0; i < middle; i++) slots.push(core[i % core.length]);
  slots.push("Penutup");
  return slots;
}

/** Fase yang dijadwalkan untuk giliran ke-`examinerCount` (0-based). */
export function scheduledPhase(examinerCount: number, phases: string[], min: number): string {
  const s = phaseSchedule(phases, min);
  if (examinerCount < s.length) return s[examinerCount];
  // Sesudah slot inti habis, giliran tambahan berputar di bab inti; Penutup
  // hanya dipakai saat gerbang tutup benar-benar terbuka.
  const core = phases.filter((p) => CORE_PHASES.includes(p));
  if (!core.length) return "Penutup";
  return core[(examinerCount - 1) % core.length];
}

/**
 * Bab skripsi yang menjadi rumah tiap fase inti, mengikuti susunan baku skripsi
 * S1 Indonesia. Dipakai untuk membatasi kutipan retrieval pada bab yang memang
 * sedang diuji — tanpa ini, sidang satu bab tetap tersedot ke bab lain karena
 * kutipan yang paling cocok dengan kata kunci bisa datang dari mana saja.
 */
const PHASE_CHAPTERS: Record<string, string[]> = {
  "Latar Belakang & Rumusan Masalah": ["I"],
  "Tinjauan Pustaka": ["II"],
  Metodologi: ["III"],
  "Hasil & Pembahasan": ["IV", "V"],
  "Kesimpulan & Kontribusi": ["VI"],
};

export interface PageRange {
  from: number;
  to: number;
}

/**
 * Rentang halaman untuk fase terpilih, dihitung dari peta bab dossier: tiap bab
 * membentang dari halaman mulainya sampai sebelum bab berikutnya.
 *
 * Mengembalikan array kosong bila agenda lengkap, peta bab tidak terbaca, atau
 * judul babnya tidak memuat angka Romawi — pemanggil memperlakukan itu sebagai
 * "jangan batasi". Naskah dengan susunan bab tak lazim karena itu tidak pernah
 * kehilangan kutipannya, hanya tidak mendapat penyempitan.
 */
export function pagesForPhases(
  phases: string[],
  petaBab: { judul: string; halaman_mulai: number | null }[],
): PageRange[] {
  const core = phases.filter((p) => CORE_PHASES.includes(p));
  if (!core.length || core.length === CORE_PHASES.length) return [];

  const marked = petaBab
    .map((b) => ({ roman: /\bBAB\s+([IVX]+)\b/i.exec(b.judul)?.[1]?.toUpperCase(), start: b.halaman_mulai }))
    .filter((b): b is { roman: string; start: number } => !!b.roman && typeof b.start === "number")
    .sort((a, b) => a.start - b.start);
  if (!marked.length) return [];

  const wanted = new Set(core.flatMap((p) => PHASE_CHAPTERS[p] ?? []));
  const ranges: PageRange[] = [];
  marked.forEach((b, i) => {
    if (!wanted.has(b.roman)) return;
    ranges.push({ from: b.start, to: marked[i + 1] ? marked[i + 1].start - 1 : Number.MAX_SAFE_INTEGER });
  });
  return ranges;
}
