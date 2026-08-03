import type Database from "better-sqlite3";
import type { Chunk } from "../chunker.js";
import { encrypt, tryDecrypt } from "../crypto.js";

// `text` adalah potongan naskah verbatim — dienkripsi dengan alasan yang sama
// dengan documents.full_text. `page` dan `heading` dibiarkan terbuka: keduanya
// dipakai untuk menyaring per-bab sebelum apa pun didekripsi.
export function replaceChunks(
  db: Database.Database,
  documentId: number,
  chunks: Chunk[],
  key: Buffer,
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chunks WHERE document_id = ?").run(documentId);
    const insert = db.prepare(
      "INSERT INTO chunks (document_id, idx, page, heading, text) VALUES (?,?,?,?,?)",
    );
    for (const c of chunks) {
      insert.run(documentId, c.idx, c.page, c.heading, encrypt(c.text, key));
    }
  });
  tx();
}

export function getChunks(db: Database.Database, documentId: number, key: Buffer): Chunk[] {
  const rows = db
    .prepare("SELECT idx, page, heading, text FROM chunks WHERE document_id = ? ORDER BY idx")
    .all(documentId) as Chunk[];
  const out: Chunk[] = [];
  for (const r of rows) {
    const text = tryDecrypt(r.text, key);
    if (text !== null) out.push({ ...r, text });
  }
  return out;
}

export function countChunks(db: Database.Database, documentId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM chunks WHERE document_id = ?")
    .get(documentId) as { c: number };
  return row.c;
}
