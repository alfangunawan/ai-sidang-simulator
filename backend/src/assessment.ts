import type { Turn } from "./providers/types.js";

export interface Assessment {
  scores: {
    penguasaan_materi: number;
    metodologi: number;
    kualitas_orisinalitas: number;
    argumentasi: number;
  };
  final_score: number;
  grade: string;
  verdict: string;
  ringkasan: string;
  kelebihan: string[];
  kekurangan: string[];
  saran: string[];
}

function clamp(n: unknown): number {
  const x = typeof n === "number" && isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Skema huruf mutu Telkom University (Pedoman Akademik / PU.022/AKD01/AKD-BPA/2024):
 * A >85, AB 75–85, B 65–75, BC 60–65, C 50–60 (batas minimal lulus sarjana),
 * D 40–50, E <=40.
 */
export function deriveGrade(score: number): string {
  if (score > 85) return "A";
  if (score >= 75) return "AB";
  if (score >= 65) return "B";
  if (score >= 60) return "BC";
  if (score >= 50) return "C";
  if (score > 40) return "D";
  return "E";
}

// KD.0034/AKD9/EB-DEK/2020: lulus bila skor total >50 (minimal huruf mutu C).
export function deriveVerdict(score: number): string {
  if (score >= 75) return "Lulus";
  if (score > 50) return "Lulus dengan revisi";
  return "Tidak lulus";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => (x as string).trim());
}

export function formatTranscript(history: Turn[]): string {
  return history
    .map((t) => `${t.role === "examiner" ? "Penguji" : "Mahasiswa"}: ${t.content}`)
    .join("\n");
}

export function buildAssessmentSystem(): string {
  return `Anda dosen penguji sidang skripsi yang menilai jalannya sidang. Berdasarkan isi skripsi dan transkrip tanya-jawab, beri penilaian objektif dalam Bahasa Indonesia.

Nilai empat dimensi (skor 0-100 tiap dimensi):
- penguasaan_materi: pemahaman mahasiswa atas topik dan isi skripsi.
- metodologi: pemahaman dan ketepatan metode penelitian.
- kualitas_orisinalitas: mutu dan orisinalitas skripsi.
- argumentasi: kemampuan menjawab, mempertahankan, dan beralasan.

Dasar penilaian (nilai dari transkrip, bukan dari kesan umum):
- Jawaban yang menyebut data spesifik (angka, nama metode, bab/halaman, tabel) bernilai jauh lebih tinggi daripada jawaban umum atau normatif.
- Jawaban yang mengelak, berputar, atau bertentangan dengan isi naskah menurunkan skor argumentasi dan penguasaan_materi.
- Pertanyaan yang tidak terjawab sama sekali harus tercermin sebagai kekurangan, bukan diabaikan.
- Nilai penguasaan_materi dan argumentasi paling berat karena keduanya diuji langsung lewat tanya jawab.
- Yang dinilai adalah jawaban MAHASISWA, bukan gaya pengujinya. Penguji yang keras, banyak bertanya, atau memakai nada menekan TIDAK boleh menurunkan skor; penguji yang lunak TIDAK boleh menaikkannya. Sidang yang panjang belum tentu bernilai rendah.

Jangkar skor (pakai ini supaya penilaian sebanding antar sidang, jangan menumpuk semua nilai di 50-65):
- 85-100: hampir semua pertanyaan dijawab dengan data spesifik yang benar; klaim tetap bertahan saat dikonfrontasi naskah.
- 70-84: mayoritas jawaban spesifik dan tepat; ada satu-dua titik lemah, tetapi diakui dan dijelaskan dengan alasan yang masuk akal.
- 55-69: campuran — sebagian jawaban spesifik, sebagian umum atau normatif; kelemahan diakui tetapi tanpa penjelasan memadai.
- 40-54: mayoritas jawaban umum, mengelak, atau "tidak tahu"; sedikit sekali data spesifik; beberapa klaim runtuh saat dikejar.
- 0-39: hampir tidak ada jawaban substantif; kontradiksi dengan naskah dibiarkan; jelas tidak menguasai isi skripsinya sendiri.

Keluarkan HANYA JSON valid (tanpa teks lain, tanpa code fence) dengan bentuk persis:
{
  "scores": { "penguasaan_materi": <0-100>, "metodologi": <0-100>, "kualitas_orisinalitas": <0-100>, "argumentasi": <0-100> },
  "final_score": <0-100>,
  "grade": "A|AB|B|BC|C|D|E",
  "verdict": "Lulus | Lulus dengan revisi | Tidak lulus",
  "ringkasan": "<2-4 kalimat penilaian menyeluruh>",
  "kelebihan": ["<poin>"],
  "kekurangan": ["<poin, sebutkan pertanyaan mana yang tidak terjawab dengan baik>"],
  "saran": ["<revisi konkret: sebut bab/bagian yang harus diperbaiki dan apa yang harus ditambahkan>"]
}`;
}

/**
 * Transcript is untrusted user input embedded directly into the prompt; scores
 * are clamped and grade/verdict are re-derived in parseAssessment, so injection
 * can only influence free-text fields (ringkasan/kelebihan/kekurangan/saran).
 *
 * Naskah utuh diganti dossier. Penilaian memang bertumpu pada transkrip —
 * system prompt di atas menyuruhnya begitu — tetapi `kualitas_orisinalitas`
 * butuh sedikit naskah asli, maka kutipan paling relevan ikut dikirim.
 */
export function buildAssessmentUser(
  dossier: string,
  transcript: string,
  excerpts = "",
  phases?: string[],
): string {
  const parts = [`${dossier}`, `TRANSKRIP SIDANG:\n${transcript}`];
  if (phases?.length) {
    parts.push(
      `CAKUPAN SIDANG: mahasiswa memilih menguji sebagian agenda saja — ${phases.join(", ")}. ` +
        `Nilai hanya apa yang benar-benar ditanyakan. Dimensi yang tidak tersentuh tanya jawab dinilai dari isi naskah, ` +
        `dan tidak boleh diturunkan hanya karena topiknya tidak keluar. Jangan menuliskan fase yang tidak diuji sebagai kekurangan mahasiswa.`,
    );
  }
  if (excerpts) parts.push(`KUTIPAN NASKAH TERKAIT:\n${excerpts}`);
  return parts.join("\n\n");
}

export function parseAssessment(text: string): Assessment {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("assessment JSON not found");
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as any;

  const scores = {
    penguasaan_materi: clamp(obj?.scores?.penguasaan_materi),
    metodologi: clamp(obj?.scores?.metodologi),
    kualitas_orisinalitas: clamp(obj?.scores?.kualitas_orisinalitas),
    argumentasi: clamp(obj?.scores?.argumentasi),
  };
  const avg = Math.round(
    (scores.penguasaan_materi +
      scores.metodologi +
      scores.kualitas_orisinalitas +
      scores.argumentasi) /
      4,
  );
  const final_score =
    typeof obj?.final_score === "number" && isFinite(obj.final_score)
      ? clamp(obj.final_score)
      : avg;
  return {
    scores,
    final_score,
    grade: deriveGrade(final_score),
    // Diturunkan, tidak diambil dari model. Sebelumnya cukup ada di daftar
    // verdict yang sah untuk dipakai apa adanya, sehingga skor 41-50 keluar
    // sebagai "D" tetapi "Lulus dengan revisi" — 3 dari 13 sidang uji kena.
    verdict: deriveVerdict(final_score),
    ringkasan: typeof obj?.ringkasan === "string" ? obj.ringkasan.trim() : "",
    kelebihan: strArray(obj?.kelebihan),
    kekurangan: strArray(obj?.kekurangan),
    saran: strArray(obj?.saran),
  };
}
