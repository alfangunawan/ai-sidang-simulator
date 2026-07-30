import type Database from "better-sqlite3";

export function getActiveDocument(
  db: Database.Database,
  userId: number,
): {
  id: number;
  filename: string;
  full_text: string;
  char_count: number;
  created_at: string;
} | null {
  const row = db
    .prepare(
      "SELECT id, filename, full_text, char_count, created_at FROM documents WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as any;
  return row ?? null;
}

// Mengembalikan id baris baru: chunk dan (nanti) dossier menggantung padanya.
// Menghapus baris lama ikut menghapus chunk-nya lewat ON DELETE CASCADE.
export function replaceDocument(
  db: Database.Database,
  userId: number,
  filename: string,
  fullText: string,
  createdAt: string,
): number {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
    return db
      .prepare(
        "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
      )
      .run(userId, filename, fullText, fullText.length, createdAt).lastInsertRowid as number;
  });
  return tx();
}

export function deleteDocument(db: Database.Database, userId: number): void {
  db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
}

export type DossierStatus = "pending" | "ready" | "failed";

export interface DossierRow {
  dossier: string | null;
  dossier_status: DossierStatus | null;
  dossier_error: string | null;
  dossier_version: number | null;
  dossier_model: string | null;
}

export function getDossierRow(db: Database.Database, documentId: number): DossierRow | null {
  const row = db
    .prepare(
      "SELECT dossier, dossier_status, dossier_error, dossier_version, dossier_model FROM documents WHERE id = ?",
    )
    .get(documentId) as DossierRow | undefined;
  return row ?? null;
}

export function setDossierPending(db: Database.Database, documentId: number): void {
  db.prepare(
    "UPDATE documents SET dossier_status = 'pending', dossier_error = NULL WHERE id = ?",
  ).run(documentId);
}

export function setDossierReady(
  db: Database.Database,
  documentId: number,
  json: string,
  version: number,
  model: string,
): void {
  db.prepare(
    "UPDATE documents SET dossier = ?, dossier_status = 'ready', dossier_error = NULL, dossier_version = ?, dossier_model = ? WHERE id = ?",
  ).run(json, version, model, documentId);
}

export function setDossierFailed(
  db: Database.Database,
  documentId: number,
  error: string,
): void {
  db.prepare(
    "UPDATE documents SET dossier_status = 'failed', dossier_error = ? WHERE id = ?",
  ).run(error, documentId);
}
