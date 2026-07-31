// Named examiners the student picks from before a sidang starts.
//
// A persona is just a preset over the two settings the backend already knows:
// examiner_mode (how hard it pushes) and examiner_type (what it chases). The
// six pairs below are distinct, so the persona can be read back from settings
// instead of being stored separately.

export interface Persona {
  key: string;
  name: string;
  initials: string;
  role: string;
  mode: string;
  type: string;
  color: string;
  trait: string;
}

export const MODE_LABELS: Record<string, string> = {
  santai: "Santai",
  standar: "Standar",
  kritis: "Kritis",
  galak: "Galak",
};

export const TYPE_LABELS: Record<string, string> = {
  umum: "Umum (gabungan)",
  metodolog: "Metodolog",
  domain: "Ahli Domain",
  teknis: "Teknis (RPL/SI)",
  ketua: "Ketua Sidang",
};

const HEAT_ORDER = ["santai", "standar", "kritis", "galak"];
const HEAT_LABELS = [
  "Tekanan rendah",
  "Tekanan sedang",
  "Tekanan tinggi",
  "Tekanan maksimal",
];

export const PERSONAS: Persona[] = [
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
  },
];

export const DEFAULT_PERSONA =
  PERSONAS.find((p) => p.key === "ratna") ?? PERSONAS[0];

/** Pressure level 1–4, used for the heat bars on a persona card. */
export function heatOf(p: Persona): number {
  return HEAT_ORDER.indexOf(p.mode) + 1;
}

export function heatLabel(p: Persona): string {
  return HEAT_LABELS[heatOf(p) - 1] ?? HEAT_LABELS[1];
}

/**
 * Persona di balik pasangan mode/type tersimpan. Daftarnya dioper dari App
 * (hasil fetch, dengan PERSONAS sebagai nilai awal) supaya persona yang diedit
 * admin langsung terpakai tanpa deploy — dan pasangan yang tidak tercakup
 * tetap dapat penguji polos, bukan nama yang salah.
 */
export function personaFor(list: Persona[], mode: string, type: string): Persona {
  const hit = list.find((p) => p.mode === mode && p.type === type);
  if (hit) return hit;
  return {
    key: `${mode}-${type}`,
    name: "Penguji",
    initials: "P",
    role: TYPE_LABELS[type] ?? "Penguji sidang",
    mode,
    type,
    color: "#475569",
    trait: "",
  };
}
