import type Database from "better-sqlite3";
import { encrypt, tryDecrypt } from "../crypto.js";

/**
 * `full_text` dan `dossier` berisi naskah skripsi yang belum terbit — milik
 * orang lain, bukan milik aplikasi. Keduanya disimpan terenkripsi (AES-256-GCM,
 * kunci sama dengan API key di settings) supaya file SQLite yang bocor, atau
 * salinan cadangan yang tertinggal, tidak sama dengan seluruh naskah terbaca.
 * `filename` dan `char_count` sengaja dibiarkan terbuka: dipakai untuk daftar
 * dan tidak mengungkap isi.
 */
export function getActiveDocument(
  db: Database.Database,
  userId: number,
  key: Buffer,
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
  if (!row) return null;
  const full_text = tryDecrypt(row.full_text, key);
  if (full_text === null) {
    console.warn(`[documents] naskah ${row.id} tidak bisa didekripsi — dianggap tidak ada`);
    return null;
  }
  return { ...row, full_text };
}

// Mengembalikan id baris baru: chunk dan (nanti) dossier menggantung padanya.
// Menghapus baris lama ikut menghapus chunk-nya lewat ON DELETE CASCADE.
export function replaceDocument(
  db: Database.Database,
  userId: number,
  filename: string,
  fullText: string,
  createdAt: string,
  key: Buffer,
): number {
  // char_count dihitung dari plaintext: yang dilihat user panjang naskah, bukan
  // panjang ciphertext.
  const charCount = fullText.length;
  const blob = encrypt(fullText, key);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
    return db
      .prepare(
        "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
      )
      .run(userId, filename, blob, charCount, createdAt).lastInsertRowid as number;
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

export function getDossierRow(
  db: Database.Database,
  documentId: number,
  key: Buffer,
): DossierRow | null {
  const row = db
    .prepare(
      "SELECT dossier, dossier_status, dossier_error, dossier_version, dossier_model FROM documents WHERE id = ?",
    )
    .get(documentId) as DossierRow | undefined;
  if (!row) return null;
  return { ...row, dossier: row.dossier === null ? null : tryDecrypt(row.dossier, key) };
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
  key: Buffer,
): void {
  db.prepare(
    "UPDATE documents SET dossier = ?, dossier_status = 'ready', dossier_error = NULL, dossier_version = ?, dossier_model = ? WHERE id = ?",
  ).run(encrypt(json, key), version, model, documentId);
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
