export const CLOSE_MARKER = "[[CUKUP]]";
// Sidang sarjana mengalokasikan ~30 menit tanya jawab: 8–15 pertanyaan utama
// plus 2–4 follow-up per topik. Floor ini menahan AI menutup sidang terlalu dini.
export const MIN_EXAMINER_QUESTIONS = 15;
export const CLOSE_COOLDOWN = 3;

export function stripCloseMarker(reply: string): { reply: string; hasMarker: boolean } {
  const hasMarker = reply.includes(CLOSE_MARKER);
  const cleaned = reply.split(CLOSE_MARKER).join("").trim();
  return { reply: cleaned, hasMarker };
}

export function shouldProposeClose(p: {
  hasMarker: boolean;
  examinerCount: number;
  declinedTurn: number | null;
}): boolean {
  if (!p.hasMarker) return false;
  if (p.examinerCount < MIN_EXAMINER_QUESTIONS) return false;
  const floor = (p.declinedTurn ?? 0) + CLOSE_COOLDOWN;
  return p.examinerCount >= floor;
}
