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

// Phases where the examiner must dig with more than one question.
export const CORE_PHASES = SIDANG_PHASES.slice(1, -1);
