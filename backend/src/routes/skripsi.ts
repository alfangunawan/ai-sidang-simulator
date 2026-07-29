import { Router } from "express";
import multer from "multer";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import {
  replaceDocument,
  getActiveDocument,
  deleteDocument,
  getDossierRow,
} from "../repos/documents.js";
import { chunkPages } from "../chunker.js";
import { replaceChunks, countChunks } from "../repos/chunks.js";
import { buildDossier } from "../dossier.js";

const upload = multer({ storage: multer.memoryStorage() });

export function skripsiRouter(
  db: Database.Database,
  key: Buffer,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.post("/", upload.single("file"), async (req, res) => {
    const userId = req.userId!;
    if (!req.file) return res.status(400).json({ error: "File PDF wajib diunggah" });
    try {
      const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer));
      // mergePages:false — batas halaman harus bertahan sampai chunker, karena
      // nomor halaman tidak bisa direkonstruksi setelah teks digabung.
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(text) ? text : [text];
      const fullText = pages.join("\n\n").trim();
      if (!fullText) {
        return res
          .status(422)
          .json({ error: "Tidak ada teks yang bisa diekstrak dari PDF ini" });
      }
      const createdAt = now();
      const documentId = replaceDocument(db, userId, req.file.originalname, fullText, createdAt);
      const chunks = chunkPages(pages);
      replaceChunks(db, documentId, chunks);

      // Sengaja tidak di-await: membaca 145k token butuh puluhan detik, jauh
      // melewati batas sabar sebuah request upload. Dipanggil SEBELUM respons
      // supaya status 'pending' sudah tertulis ketika klien mulai memantau —
      // buildDossier menulisnya sebelum await pertama.
      void buildDossier(db, userId, key, documentId, fullText, now);

      res.json({
        filename: req.file.originalname,
        char_count: fullText.length,
        chunk_count: chunks.length,
        dossier_status: getDossierRow(db, documentId)?.dossier_status ?? null,
        uploaded_at: createdAt,
      });
    } catch {
      res.status(422).json({ error: "Gagal membaca PDF" });
    }
  });

  r.get("/", (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId);
    if (!doc) return res.json(null);
    const d = getDossierRow(db, doc.id);
    res.json({
      filename: doc.filename,
      char_count: doc.char_count,
      chunk_count: countChunks(db, doc.id),
      dossier_status: d?.dossier_status ?? null,
      dossier_error: d?.dossier_error ?? null,
      uploaded_at: doc.created_at,
    });
  });

  // Jalan pemulihan ketika dossier gagal atau modelnya diganti. Tanpa ini,
  // satu kegagalan pembangunan mengunci dokumen sampai user mengunggah ulang.
  r.post("/dossier/rebuild", async (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId);
    if (!doc) return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    void buildDossier(db, userId, key, doc.id, doc.full_text, now);
    res.json({ dossier_status: getDossierRow(db, doc.id)?.dossier_status ?? null });
  });

  r.delete("/", (req, res) => {
    const userId = req.userId!;
    deleteDocument(db, userId);
    res.json({ ok: true });
  });

  return r;
}
