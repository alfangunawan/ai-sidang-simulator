import type Database from "better-sqlite3";
import { QUESTION_BANK } from "../questionBank.js";

/**
 * Bank pertanyaan yang tersimpan, dengan konstanta sebagai jaring pengaman:
 * fase yang kosong di DB mengembalikan daftar bawaan, sehingga "hapus semua"
 * di editor tidak pernah membuat penguji kehilangan bahan di tengah sidang.
 */
export function listQuestions(db: Database.Database): Record<string, string[]> {
  const rows = db
    .prepare("SELECT phase, text FROM question_bank ORDER BY phase, position")
    .all() as { phase: string; text: string }[];

  const bank: Record<string, string[]> = {};
  for (const r of rows) (bank[r.phase] ??= []).push(r.text);
  for (const [phase, fallback] of Object.entries(QUESTION_BANK)) {
    if (!bank[phase]?.length) bank[phase] = fallback;
  }
  return bank;
}

export function replacePhase(db: Database.Database, phase: string, texts: string[]): void {
  db.transaction(() => {
    db.prepare("DELETE FROM question_bank WHERE phase = ?").run(phase);
    const insert = db.prepare(
      "INSERT INTO question_bank (phase, text, position) VALUES (?,?,?)",
    );
    texts.forEach((text, i) => {
      const trimmed = text.trim();
      if (trimmed) insert.run(phase, trimmed, i);
    });
  })();
}

/** Mengisi tabel dari konstanta hanya bila masih benar-benar kosong. */
export function seedQuestions(
  db: Database.Database,
  bank: Record<string, string[]> = QUESTION_BANK,
): void {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM question_bank").get() as { c: number };
  if (c > 0) return;
  for (const [phase, texts] of Object.entries(bank)) replacePhase(db, phase, texts);
}
