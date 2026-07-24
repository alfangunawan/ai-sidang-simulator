import { Router } from "express";
import multer from "multer";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import {
  replaceDocument,
  getActiveDocument,
  deleteDocument,
} from "../repos/documents.js";

const upload = multer({ storage: multer.memoryStorage() });

export function skripsiRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.post("/", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File PDF wajib diunggah" });
    try {
      const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const fullText = (Array.isArray(text) ? text.join("\n") : text).trim();
      if (!fullText) {
        return res
          .status(422)
          .json({ error: "Tidak ada teks yang bisa diekstrak dari PDF ini" });
      }
      const createdAt = now();
      replaceDocument(db, req.file.originalname, fullText, createdAt);
      res.json({
        filename: req.file.originalname,
        char_count: fullText.length,
        uploaded_at: createdAt,
      });
    } catch {
      res.status(422).json({ error: "Gagal membaca PDF" });
    }
  });

  r.get("/", (_req, res) => {
    const doc = getActiveDocument(db);
    if (!doc) return res.json(null);
    res.json({
      filename: doc.filename,
      char_count: doc.char_count,
      uploaded_at: doc.created_at,
    });
  });

  r.delete("/", (_req, res) => {
    deleteDocument(db);
    res.json({ ok: true });
  });

  return r;
}
