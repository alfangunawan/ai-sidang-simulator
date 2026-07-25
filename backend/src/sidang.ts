export const CLOSE_MARKER = "[[CUKUP]]";
export const MIN_EXAMINER_QUESTIONS = 10;
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
