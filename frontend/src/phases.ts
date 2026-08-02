/**
 * Fase inti sidang, satu per bab skripsi. Pembukaan dan Penutup tidak ada di
 * sini: keduanya ritual sidang, bukan bab, dan selalu dijalankan.
 *
 * `phase` WAJIB sama persis dengan CORE_PHASES di backend (src/phases.ts).
 * Server menolak nama yang tidak dikenal dengan 400, jadi salah ketik terlihat
 * saat sesi dibuat — bukan diam-diam berubah jadi sidang semua bab.
 */
export const PHASE_CHOICES = [
  {
    phase: "Latar Belakang & Rumusan Masalah",
    bab: "Bab I",
    hint: "Urgensi masalah, batasan, dan kecocokan rumusan dengan kesimpulan.",
  },
  {
    phase: "Tinjauan Pustaka",
    bab: "Bab II",
    hint: "Posisi terhadap penelitian terdahulu, landasan teori, kemutakhiran rujukan.",
  },
  {
    phase: "Metodologi",
    bab: "Bab III",
    hint: "Alasan pemilihan metode, validitas instrumen, cara pengambilan data.",
  },
  {
    phase: "Hasil & Pembahasan",
    bab: "Bab IV",
    hint: "Kecukupan pengujian, jumlah responden, tafsir angka, cara kerja sistem.",
  },
  {
    phase: "Kesimpulan & Kontribusi",
    bab: "Bab V",
    hint: "Kontribusi ilmiah, kebaruan, batas generalisasi kesimpulan.",
  },
];

export const ALL_PHASES = PHASE_CHOICES.map((p) => p.phase);
