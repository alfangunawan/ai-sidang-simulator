import type Database from "better-sqlite3";

export function getActiveDocument(
  db: Database.Database,
  userId: number,
): { filename: string; full_text: string; char_count: number; created_at: string } | null {
  const row = db
    .prepare(
      "SELECT filename, full_text, char_count, created_at FROM documents WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as any;
  return row ?? null;
}

export function replaceDocument(
  db: Database.Database,
  userId: number,
  filename: string,
  fullText: string,
  createdAt: string,
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
    db.prepare(
      "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
    ).run(userId, filename, fullText, fullText.length, createdAt);
  });
  tx();
}

export function deleteDocument(db: Database.Database, userId: number): void {
  db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
}
