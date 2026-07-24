import type Database from "better-sqlite3";

export function getActiveDocument(db: Database.Database): {
  filename: string;
  full_text: string;
  char_count: number;
  created_at: string;
} | null {
  const row = db
    .prepare(
      "SELECT filename, full_text, char_count, created_at FROM documents ORDER BY id DESC LIMIT 1",
    )
    .get() as any;
  return row ?? null;
}

export function replaceDocument(
  db: Database.Database,
  filename: string,
  fullText: string,
  createdAt: string,
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents").run();
    db.prepare(
      "INSERT INTO documents (filename, full_text, char_count, created_at) VALUES (?,?,?,?)",
    ).run(filename, fullText, fullText.length, createdAt);
  });
  tx();
}

export function deleteDocument(db: Database.Database): void {
  db.prepare("DELETE FROM documents").run();
}
