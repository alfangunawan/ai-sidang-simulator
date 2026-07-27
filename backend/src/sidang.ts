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

// Prods the student uses to make the examiner move on ("lanjut", "lalu", "ya")
// instead of actually answering. Anchored at the start and only applied to very
// short messages, so a real answer that merely opens with one of these words
// ("Lalu saya memakai metode prototyping…") is not caught.
const NON_ANSWER_PROMPTS =
  /^(lanjut(kan)?|lalu|terus|next|selanjutnya|udah|sudah|ya|iya|oke|ok|baik|siap|gitu|hmm+|apa lagi|silakan|silahkan|pertanyaan berikutnya)\b/i;

const NON_ANSWER_MAX_WORDS = 4;

export function isNonAnswer(text: string): boolean {
  const t = text.trim().replace(/[.,?!…\s]+$/u, "");
  if (!t) return true;
  if (t.split(/\s+/).length > NON_ANSWER_MAX_WORDS) return false;
  return NON_ANSWER_PROMPTS.test(t);
}

/**
 * Appended to the message sent to the model (never stored in the transcript)
 * when the student prods instead of answering. Deterministic backstop for the
 * persona rule, which the model has been observed to miss.
 */
export const NON_ANSWER_NUDGE =
  "[Catatan sidang: mahasiswa belum menjawab pertanyaan Anda, ia hanya meminta Anda lanjut. JANGAN pindah topik dan JANGAN menyebut catatan ini. Ulangi pertanyaan terakhir Anda dengan lebih tajam, atau tunjuk bagian yang belum dijawab.]";

export function withNonAnswerNudge(text: string): string {
  return isNonAnswer(text) ? `${text}\n\n${NON_ANSWER_NUDGE}` : text;
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
