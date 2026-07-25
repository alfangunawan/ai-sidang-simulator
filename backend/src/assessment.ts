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

const VERDICTS = ["Lulus", "Lulus dengan revisi", "Tidak lulus"];

function clamp(n: unknown): number {
  const x = typeof n === "number" && isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

export function deriveGrade(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function deriveVerdict(score: number): string {
  if (score >= 80) return "Lulus";
  if (score >= 60) return "Lulus dengan revisi";
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

Keluarkan HANYA JSON valid (tanpa teks lain, tanpa code fence) dengan bentuk persis:
{
  "scores": { "penguasaan_materi": <0-100>, "metodologi": <0-100>, "kualitas_orisinalitas": <0-100>, "argumentasi": <0-100> },
  "final_score": <0-100>,
  "grade": "A|B|C|D",
  "verdict": "Lulus | Lulus dengan revisi | Tidak lulus",
  "ringkasan": "<2-4 kalimat penilaian menyeluruh>",
  "kelebihan": ["<poin>"],
  "kekurangan": ["<poin>"],
  "saran": ["<saran perbaikan konkret>"]
}`;
}

export function buildAssessmentUser(skripsi: string, transcript: string): string {
  return `ISI SKRIPSI:\n${skripsi}\n\nTRANSKRIP SIDANG:\n${transcript}`;
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
  const verdict = VERDICTS.includes(obj?.verdict) ? obj.verdict : deriveVerdict(final_score);

  return {
    scores,
    final_score,
    grade: deriveGrade(final_score),
    verdict,
    ringkasan: typeof obj?.ringkasan === "string" ? obj.ringkasan.trim() : "",
    kelebihan: strArray(obj?.kelebihan),
    kekurangan: strArray(obj?.kekurangan),
    saran: strArray(obj?.saran),
  };
}
