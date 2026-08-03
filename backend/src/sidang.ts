import { CORE_PHASES, SIDANG_PHASES } from "./phases.js";

export const CLOSE_MARKER = "[[CUKUP]]";
// Sidang sarjana mengalokasikan ~30 menit tanya jawab: 8–15 pertanyaan utama
// plus 2–4 follow-up per topik. Floor ini menahan AI menutup sidang terlalu dini.
const PER_CORE_PHASE = 3;
// Sidang satu bab tetap harus menggali, bukan tanya-jawab sekali lalu bubar.
const ABSOLUTE_FLOOR = 5;

/**
 * Berapa pertanyaan minimum sebelum sidang boleh ditutup. Diikat ke jumlah fase
 * inti yang dipilih: memilih satu bab lalu tetap dipaksa 15 pertanyaan membuat
 * penguji mengorek satu topik jauh melewati bahannya — dan tagihan tokennya
 * sama dengan sidang penuh.
 */
export function minQuestions(phases: string[] = SIDANG_PHASES): number {
  const core = phases.filter((p) => CORE_PHASES.includes(p)).length;
  return Math.max(ABSOLUTE_FLOOR, PER_CORE_PHASE * core);
}

/** Sidang penuh: kelima bab, 15 pertanyaan. */
export const MIN_EXAMINER_QUESTIONS = minQuestions();
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

/** Giliran penguji paling awal yang boleh menutup sidang. */
export function closeFloor(declinedTurn: number | null, min = MIN_EXAMINER_QUESTIONS): number {
  return Math.max(min, (declinedTurn ?? 0) + CLOSE_COOLDOWN);
}

export function shouldProposeClose(p: {
  hasMarker: boolean;
  examinerCount: number;
  declinedTurn: number | null;
  min?: number;
}): boolean {
  return p.hasMarker && p.examinerCount >= closeFloor(p.declinedTurn, p.min);
}

/**
 * Fase yang ditugaskan server untuk giliran ini. Ditempel ke pesan user, bukan
 * blok system — teksnya berubah tiap giliran.
 *
 * Larangan agenda tidak pernah menghasilkan cakupan: ia menahan penguji keluar
 * bab, tapi tidak menyuruhnya masuk ke bab yang belum tergali. Penugasan inilah
 * sisi positifnya, dan jadwalnya dihitung server sehingga tiap bab terpilih
 * pasti kebagian.
 */
export function phaseDirective(phase: string): string {
  if (phase === "Pembukaan") {
    return `\n\n[Fase giliran ini: Pembukaan. Buka sidang dan tanggapi presentasi mahasiswa dengan satu pertanyaan pembuka.]`;
  }
  if (phase === "Penutup") {
    return `\n\n[Fase giliran ini: Penutup. Seluruh bab yang diuji sudah tergali.]`;
  }
  return `\n\n[Fase giliran ini: ${phase}. Pertanyaan Anda WAJIB menggali fase itu. Bahan dan kutipan di bawah sudah dipersempit ke bab tersebut — jangan bertanya tentang bab lain di giliran ini.]`;
}

/**
 * Frasa yang hanya muncul di giliran penutup. Dipakai untuk menahan penutup
 * yang datang terlalu cepat, bukan untuk menilai mutu balasan.
 */
const CLOSING_TEXT =
  /(saya rangkum|rangkuman kelemahan|revisi (konkret |wajib )?yang (harus|wajib)|sidang (ini )?(saya )?(nyatakan )?(selesai|cukup|ditutup|saya tutup)|saya tutup sidang|sidang cukup|terima kasih atas presentasi|silakan catat seluruh poin)/i;

export function looksLikeClosing(reply: string, hasMarker: boolean): boolean {
  return hasMarker || CLOSING_TEXT.test(reply);
}

/**
 * Dikirim ulang ketika model menutup padahal gerbang masih tertutup.
 *
 * Larangan di closeStatus saja tidak cukup — 2 dari 25 sidang uji tetap
 * merangkum lebih awal. Akibatnya bukan cuma giliran terbuang: rangkumannya
 * habis dipakai di situ, sehingga giliran penutup yang sebenarnya menyusut jadi
 * tunggul ("Saya catat.", 2 kata) tanpa daftar revisi. Balasan penutup yang
 * datang terlalu cepat karena itu tidak disimpan, melainkan diminta ulang.
 */
export const EARLY_CLOSE_RETRY =
  "\n\n[Koreksi: balasan Anda barusan berupa penutup/rangkuman, padahal sidang belum boleh ditutup. Balasan itu DIBUANG. Tulis ulang sebagai SATU pertanyaan penguji yang menggali fase yang belum tuntas. Jangan merangkum, jangan menyebut sidang selesai, jangan menyinggung koreksi ini.]";

/**
 * Appended to the message sent to the model (never stored in the transcript).
 *
 * Tanpa ini model tidak tahu ada gerbang tutup sama sekali: ia menutup ketika
 * merasa cukup, server hanya membuang penandanya, dan teks penutupnya tetap
 * masuk transkrip. Karena penutup itu lalu terbaca di riwayat, model tidak bisa
 * kembali bertanya — ia mengulang penutup sampai gerbangnya buka. Terlihat di
 * uji langsung: 4 dari 13 sidang merangkum sebelum waktunya, dan sesi yang
 * menolak tutup malah menerima tiga penutup identik alih-alih pertanyaan baru.
 *
 * Ditempel ke pesan user, bukan blok system, supaya prefix cache tetap utuh —
 * teks ini berubah setiap giliran.
 */
export function closeStatus(
  examinerCount: number,
  declinedTurn: number | null,
  min = MIN_EXAMINER_QUESTIONS,
): string {
  const need = closeFloor(declinedTurn, min) - examinerCount;
  const body =
    need > 0
      ? `Anda baru mengajukan ${examinerCount} pertanyaan. Sidang BELUM boleh ditutup — masih perlu minimal ${need} pertanyaan lagi. ` +
        `DILARANG merangkum kelemahan, DILARANG menyatakan sidang selesai/cukup/ditutup, DILARANG menempel penanda penutup. ` +
        `Ajukan pertanyaan berikutnya pada fase yang belum tergali.`
      : `Anda sudah mengajukan ${examinerCount} pertanyaan, batas minimum terpenuhi. ` +
        `Jika SEMUA fase termasuk Penutup benar-benar sudah terbahas, tutup dengan rangkuman lalu tempel ${CLOSE_MARKER}. ` +
        `Jika belum, lanjutkan bertanya seperti biasa.`;
  return `\n\n[Status sidang (untuk Anda, jangan disebut ke mahasiswa): ${body}]`;
}
