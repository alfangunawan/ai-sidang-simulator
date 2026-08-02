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
