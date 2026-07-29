import { Router } from "express";
import multer from "multer";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import {
  replaceDocument,
  getActiveDocument,
  deleteDocument,
} from "../repos/documents.js";
import { chunkPages } from "../chunker.js";
import { replaceChunks } from "../repos/chunks.js";

const upload = multer({ storage: multer.memoryStorage() });

export function skripsiRouter(
  db: Database.Database,
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
      res.json({
        filename: req.file.originalname,
        char_count: fullText.length,
        chunk_count: chunks.length,
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
    res.json({
      filename: doc.filename,
      char_count: doc.char_count,
      uploaded_at: doc.created_at,
    });
  });

  r.delete("/", (req, res) => {
    const userId = req.userId!;
    deleteDocument(db, userId);
    res.json({ ok: true });
  });

  return r;
}
