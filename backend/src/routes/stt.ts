import { Router } from "express";
import multer from "multer";
import type Database from "better-sqlite3";
import { getSetting, getSttKey } from "../repos/settings.js";
import { resolveSttSource } from "../effectiveConfig.js";
import { whisperTranscribe, whisperCheckAuth } from "../providers/stt/whisper.js";

// A single spoken answer, held in memory only — recordings are never stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // OpenAI's own per-file ceiling
});

export function sttRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.post("/transcribe", upload.single("audio"), async (req, res) => {
    const userId = req.userId!;
    const src = resolveSttSource(db, userId);
    const provider = getSetting(db, src, "stt_provider") ?? "browser";
    if (provider !== "whisper") {
      return res
        .status(400)
        .json({ error: "Provider STT browser diproses di sisi klien" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: "Rekaman audio kosong" });
    }
    const apiKey = getSttKey(db, src, key);
    if (!apiKey) return res.status(400).json({ error: "API key STT belum diisi" });

    try {
      const text = await whisperTranscribe(
        req.file.buffer,
        req.file.originalname || "answer.webm",
        req.file.mimetype || "audio/webm",
        apiKey,
      );
      res.json({ text });
    } catch (e) {
      // Transcription failures must not 500 the session — the student can
      // always type the answer instead.
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Connection check for the STT provider. Uses the typed key if provided, else
  // the saved one. Always 200; the result is in `ok`.
  r.post("/test", async (req, res) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const provider = (body.provider as string) ?? getSetting(db, userId, "stt_provider") ?? "browser";
    if (provider === "browser") return res.json({ ok: true });
    if (provider !== "whisper") {
      return res.json({ ok: false, error: `Provider STT tidak dikenal: ${provider}` });
    }
    const apiKey =
      typeof body.key === "string" && body.key ? body.key : getSttKey(db, userId, key);
    if (!apiKey) return res.json({ ok: false, error: "API key STT belum diisi" });
    try {
      await whisperCheckAuth(apiKey);
      res.json({ ok: true });
    } catch {
      res.json({ ok: false, error: "Koneksi STT gagal — periksa API key / kuota" });
    }
  });

  return r;
}
