import { Router, type ErrorRequestHandler } from "express";
import multer, { MulterError } from "multer";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import {
  replaceDocument,
  getActiveDocument,
  deleteDocument,
  getDossierRow,
  setDossierReady,
} from "../repos/documents.js";
import { chunkPages } from "../chunker.js";
import { replaceChunks, countChunks } from "../repos/chunks.js";
import { buildDossier, parseDossier, DOSSIER_VERSION, type Dossier } from "../dossier.js";

/**
 * Di bawah `client_max_body_size 30m` nginx, supaya penolakan datang dari sini
 * dengan pesan yang bisa dibaca user — bukan halaman 413 nginx.
 */
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC = Buffer.from("%PDF-");

// memoryStorage berarti satu request memegang seluruh berkas di RAM; tanpa
// `limits` satu akun bisa menghabiskan memori proses. `files: 1` menutup
// bentuk yang sama lewat banyak field dalam satu request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  // mimetype dikirim klien, jadi ini hanya saringan murah lapis pertama — yang
  // menentukan adalah magic byte di handler. Gunanya: menolak di awal stream,
  // sebelum 25 MB sampah ikut masuk RAM.
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf"
      ? cb(null, true)
      : cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file")),
});

// Dipasang di router ini, bukan di app.ts: tanpa ini MulterError jatuh ke
// handler global dan muncul sebagai 500 "Kesalahan server" — user tidak tahu
// bahwa yang salah adalah ukuran berkasnya.
const uploadErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (!(err instanceof MulterError)) return next(err);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Ukuran PDF melebihi batas 25 MB" });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(415).json({ error: "File harus PDF" });
  }
  return res.status(400).json({ error: "Unggahan tidak valid" });
};

export function skripsiRouter(
  db: Database.Database,
  key: Buffer,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.post("/", upload.single("file"), async (req, res) => {
    const userId = req.userId!;
    if (!req.file) return res.status(400).json({ error: "File PDF wajib diunggah" });
    // Pemeriksaan yang menentukan: mimetype dan ekstensi keduanya dikirim klien,
    // isi berkasnya tidak. Tanpa ini byte apa pun sampai ke parser PDF.
    if (!req.file.buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      return res.status(415).json({ error: "File harus PDF" });
    }
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
      const documentId = replaceDocument(db, userId, req.file.originalname, fullText, createdAt, key);
      const chunks = chunkPages(pages);
      replaceChunks(db, documentId, chunks, key);

      // Sengaja tidak di-await: membaca 145k token butuh puluhan detik, jauh
      // melewati batas sabar sebuah request upload. Dipanggil SEBELUM respons
      // supaya status 'pending' sudah tertulis ketika klien mulai memantau —
      // buildDossier menulisnya sebelum await pertama.
      void buildDossier(db, userId, key, documentId, fullText, now);

      res.json({
        filename: req.file.originalname,
        char_count: fullText.length,
        chunk_count: chunks.length,
        dossier_status: getDossierRow(db, documentId, key)?.dossier_status ?? null,
        uploaded_at: createdAt,
      });
    } catch {
      res.status(422).json({ error: "Gagal membaca PDF" });
    }
  });

  r.get("/", (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId, key);
    if (!doc) return res.json(null);
    const d = getDossierRow(db, doc.id, key);
    res.json({
      filename: doc.filename,
      char_count: doc.char_count,
      chunk_count: countChunks(db, doc.id),
      dossier_status: d?.dossier_status ?? null,
      dossier_error: d?.dossier_error ?? null,
      uploaded_at: doc.created_at,
    });
  });

  r.get("/dossier", (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId, key);
    if (!doc) return res.json(null);
    const d = getDossierRow(db, doc.id, key);
    res.json({
      status: d?.dossier_status ?? null,
      error: d?.dossier_error ?? null,
      model: d?.dossier_model ?? null,
      dossier: d?.dossier ? (JSON.parse(d.dossier) as Dossier) : null,
    });
  });

  /**
   * Suntingan manual user. Divalidasi lewat parseDossier yang sama dengan
   * keluaran model — dossier hasil suntingan tidak boleh bisa melanggar bentuk
   * yang tidak akan diterima dari model.
   */
  r.put("/dossier", (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId, key);
    if (!doc) return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    try {
      const dossier = parseDossier(JSON.stringify(req.body ?? {}));
      setDossierReady(db, doc.id, JSON.stringify(dossier), DOSSIER_VERSION, "manual", key);
      res.json({ dossier });
    } catch (e) {
      res.status(400).json({
        error:
          (e as Error).message === "dossier missing judul/rumusan_masalah"
            ? "Dossier wajib punya judul dan minimal satu rumusan masalah"
            : "Dossier tidak valid",
      });
    }
  });

  // Jalan pemulihan ketika dossier gagal atau modelnya diganti. Tanpa ini,
  // satu kegagalan pembangunan mengunci dokumen sampai user mengunggah ulang.
  r.post("/dossier/rebuild", async (req, res) => {
    const userId = req.userId!;
    const doc = getActiveDocument(db, userId, key);
    if (!doc) return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    void buildDossier(db, userId, key, doc.id, doc.full_text, now);
    res.json({ dossier_status: getDossierRow(db, doc.id, key)?.dossier_status ?? null });
  });

  r.delete("/", (req, res) => {
    const userId = req.userId!;
    deleteDocument(db, userId);
    res.json({ ok: true });
  });

  r.use(uploadErrors);

  return r;
}
