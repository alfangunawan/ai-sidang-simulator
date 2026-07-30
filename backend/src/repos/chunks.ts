import type Database from "better-sqlite3";
import type { Chunk } from "../chunker.js";

export function replaceChunks(
  db: Database.Database,
  documentId: number,
  chunks: Chunk[],
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chunks WHERE document_id = ?").run(documentId);
    const insert = db.prepare(
      "INSERT INTO chunks (document_id, idx, page, heading, text) VALUES (?,?,?,?,?)",
    );
    for (const c of chunks) insert.run(documentId, c.idx, c.page, c.heading, c.text);
  });
  tx();
}

export function getChunks(db: Database.Database, documentId: number): Chunk[] {
  return db
    .prepare("SELECT idx, page, heading, text FROM chunks WHERE document_id = ? ORDER BY idx")
    .all(documentId) as Chunk[];
}

export function countChunks(db: Database.Database, documentId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM chunks WHERE document_id = ?")
    .get(documentId) as { c: number };
  return row.c;
}
