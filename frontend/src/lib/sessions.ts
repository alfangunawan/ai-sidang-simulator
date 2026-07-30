// Shared session-list formatting: Beranda's "Sesi terakhir" and Riwayat show
// the same rows, so date, tone and grade are derived in one place.

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scoreTone(score: number | null): string {
  if (score == null) return "";
  if (score >= 75) return "good";
  if (score >= 60) return "mid";
  return "low";
}

/** Mirrors deriveGrade in backend/src/assessment.ts (Telkom PU.022/AKD01/2024). */
export function gradeOf(score: number): string {
  if (score > 85) return "A";
  if (score >= 75) return "AB";
  if (score >= 65) return "B";
  if (score >= 60) return "BC";
  if (score >= 50) return "C";
  if (score > 40) return "D";
  return "E";
}
