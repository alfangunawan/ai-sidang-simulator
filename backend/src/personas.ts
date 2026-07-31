export interface PersonaRow {
  key: string;
  name: string;
  initials: string;
  role: string;
  mode: string;
  type: string;
  color: string;
  trait: string;
  position: number;
  active: boolean;
}

/**
 * Enam preset yang dulu hanya hidup di frontend. Ini benih tabel `personas`;
 * frontend tetap menyimpan salinannya sebagai nilai render awal supaya picker
 * tidak pernah kosong saat fetch belum kembali.
 */
export const PERSONA_SEED: PersonaRow[] = [
  {
    key: "hendra",
    name: "Ir. Hendra Gunawan, M.Sc.",
    initials: "HG",
    role: "Pembimbing yang menenangkan",
    mode: "santai",
    type: "umum",
    color: "#0f9d6e",
    trait:
      "Bertanya pelan dan memberi arah bila Anda tersendat. Cocok untuk pemanasan atau latihan pertama.",
    position: 0,
    active: true,
  },
  {
    key: "ratna",
    name: "Dr. Ratna Wijaya, M.Kom.",
    initials: "RW",
    role: "Sang metodolog",
    mode: "standar",
    type: "metodolog",
    color: "#2563eb",
    trait:
      "Tenang tapi runtut. Mengejar justifikasi metode, validitas instrumen, dan batas generalisasi sampai dasar logikanya terlihat.",
    position: 1,
    active: true,
  },
  {
    key: "yusuf",
    name: "Dr. Yusuf Alfarizi, M.Kom.",
    initials: "YA",
    role: "Ketua sidang",
    mode: "standar",
    type: "ketua",
    color: "#7c5ab8",
    trait:
      "Menjaga agenda dan waktu. Menuntut jawaban ringkas serta meminta Anda merangkum sendiri poin kunci tiap fase.",
    position: 2,
    active: true,
  },
  {
    key: "anindya",
    name: "Dr. Anindya Kusuma, S.T., M.T.",
    initials: "AK",
    role: "Penguji teknis",
    mode: "kritis",
    type: "teknis",
    color: "#0e7490",
    trait:
      "Skeptis pada implementasi. Meminta Anda menelusuri cara kerja fitur langkah demi langkah, termasuk kasus tepi.",
    position: 3,
    active: true,
  },
  {
    key: "siti",
    name: "Dr. Siti Marhamah, M.Si.",
    initials: "SM",
    role: "Pemburu bukti",
    mode: "kritis",
    type: "umum",
    color: "#b45309",
    trait:
      "Menanyakan bab dan halaman untuk setiap klaim. Jawaban normatif akan dikembalikan sampai Anda menyebut data.",
    position: 4,
    active: true,
  },
  {
    key: "bambang",
    name: "Prof. Dr. Bambang Sutrisno",
    initials: "BS",
    role: "Penguji senior",
    mode: "galak",
    type: "domain",
    color: "#b42318",
    trait:
      "Tanpa kompromi. Menyerang kebaruan, posisi terhadap literatur, etika penelitian, dan setiap asumsi yang lemah.",
    position: 5,
    active: true,
  },
];
