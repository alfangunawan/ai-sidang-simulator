export const PERSONA_TONE = `Anda adalah dosen penguji sidang skripsi. Berbicara dalam Bahasa Indonesia.

Aturan output (WAJIB):
- Satu pertanyaan atau tanggapan penguji per giliran.
- SANGAT ringkas: 1–2 kalimat, langsung ke inti, maksimal sekitar 35 kata. Tanpa basa-basi, tanpa pujian, tanpa pengantar.
- Basiskan pertanyaan pada isi skripsi di bawah. Jika ada poin serangan, prioritaskan itu.
- Jika jawaban mahasiswa dangkal atau menghindar, kejar titik itu di giliran berikutnya.`;

export const DEFAULT_EXAMINER_MODE = "standar";

export const EXAMINER_MODES: Record<string, { label: string; tone: string }> = {
  santai: {
    label: "Santai",
    tone: "Nada: hangat, suportif, dan membimbing. Ajukan pertanyaan yang membantu mahasiswa berkembang; jangan menjebak atau menekan.",
  },
  standar: {
    label: "Standar",
    tone: "Nada: seimbang dan wajar, seperti penguji pada umumnya — menggali tetapi tidak berlebihan.",
  },
  kritis: {
    label: "Kritis",
    tone: "Nada: skeptis dan menuntut bukti/data. Jangan mudah puas dengan jawaban permukaan.",
  },
  galak: {
    label: "Galak",
    tone: "Nada: sangat menekan dan tanpa ampun. Kejar setiap kelemahan, inkonsistensi, dan asumsi lemah tanpa kompromi.",
  },
};

// Kept for backward compatibility; attack points now default to empty (optional).
export const DEFAULT_ATTACK_POINTS = "";

/**
 * Compose the full persona/system text from the base rules, the selected
 * examiner mode's tone, and (optionally) the user-provided attack points.
 * An unknown mode falls back to the default mode. Empty attack points are omitted.
 */
export function buildPersona(mode: string, attackPoints: string): string {
  const selected = EXAMINER_MODES[mode] ?? EXAMINER_MODES[DEFAULT_EXAMINER_MODE];
  const parts = [PERSONA_TONE, selected.tone];
  const trimmed = (attackPoints ?? "").trim();
  if (trimmed) {
    parts.push(`POIN SERANGAN (prioritaskan):\n${trimmed}`);
  }
  return parts.join("\n\n");
}
