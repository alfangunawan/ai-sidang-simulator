import { Router } from "express";
import type Database from "better-sqlite3";
import { getTtsKey, getSetting } from "../repos/settings.js";
import { getEffectiveTtsConfig, resolveSourceUser } from "../effectiveConfig.js";
import {
  synthesize,
  googleVoices,
  openaiCheckAuth,
  OPENAI_VOICES,
  type TtsVoice,
} from "../providers/tts/index.js";

const PREVIEW_SAMPLE = "Halo, ini contoh suara penguji sidang.";

// Shown when the live voices.list call can't run (no key / network error) so the
// picker is never empty. Names use the standard id-ID voice families.
const GOOGLE_FALLBACK: TtsVoice[] = [
  { name: "id-ID-Chirp3-HD-Kore", type: "Chirp3-HD", gender: "FEMALE" },
  { name: "id-ID-Chirp3-HD-Charon", type: "Chirp3-HD", gender: "MALE" },
  { name: "id-ID-Wavenet-A", type: "Wavenet", gender: "FEMALE" },
  { name: "id-ID-Wavenet-B", type: "Wavenet", gender: "MALE" },
  { name: "id-ID-Standard-A", type: "Standard", gender: "FEMALE" },
];

export function ttsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.post("/speak", async (req, res) => {
    const userId = req.userId!;
    const text = (req.body?.text ?? "").toString();
    if (!text.trim()) return res.status(400).json({ error: "Teks kosong" });
    try {
      const cfg = getEffectiveTtsConfig(db, userId, key);
      res.json(await synthesize(cfg, text));
    } catch (e) {
      // Missing key/voice or synth failure → 400, so the chat never 500s on audio.
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Global connection check for the TTS provider (no synthesis, no voice needed).
  // Uses the typed key if provided, else the saved one. Always 200; result in `ok`.
  r.post("/test", async (req, res) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const provider = (body.provider as string) ?? getSetting(db, userId, "tts_provider") ?? "browser";
    if (provider === "browser") return res.json({ ok: true });
    const apiKey =
      typeof body.key === "string" && body.key ? body.key : getTtsKey(db, userId, key, provider);
    if (!apiKey) return res.json({ ok: false, error: "API key TTS belum diisi" });
    try {
      if (provider === "google") await googleVoices(apiKey);
      else if (provider === "openai") await openaiCheckAuth(apiKey);
      else return res.json({ ok: false, error: `Provider TTS tidak dikenal: ${provider}` });
      res.json({ ok: true });
    } catch {
      res.json({ ok: false, error: "Koneksi TTS gagal — periksa API key / kuota" });
    }
  });

  // Preview a specific voice: synthesize a fixed sample and return the audio.
  r.post("/preview", async (req, res) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const provider = (body.provider as string) ?? getSetting(db, userId, "tts_provider") ?? "browser";
    const voice = (body.voice ?? "").toString();
    if (provider === "browser") {
      return res.status(400).json({ error: "Preview browser dijalankan di sisi klien" });
    }
    if (!voice) return res.status(400).json({ error: "Voice belum dipilih" });
    // Key diambil dari sumber efektif: anggota kolaborasi tidak punya key
    // sendiri, tapi berhak mendengar suara yang akan dipakai sidangnya.
    const apiKey =
      typeof body.key === "string" && body.key
        ? body.key
        : getTtsKey(db, resolveSourceUser(db, userId, "tts"), key, provider);
    if (!apiKey) return res.status(400).json({ error: "API key TTS belum diisi" });
    try {
      res.json(await synthesize({ provider, voice, apiKey }, PREVIEW_SAMPLE));
    } catch {
      res.status(400).json({ error: "Gagal membuat preview suara" });
    }
  });

  r.get("/voices", async (req, res) => {
    const userId = req.userId!;
    const provider = (req.query.provider ?? "").toString();
    if (provider === "openai") return res.json({ voices: OPENAI_VOICES });
    if (provider === "google") {
      const gkey = getTtsKey(db, resolveSourceUser(db, userId, "tts"), key, "google");
      if (gkey) {
        try {
          return res.json({ voices: await googleVoices(gkey) });
        } catch {
          // fall through to the fallback list
        }
      }
      return res.json({ voices: GOOGLE_FALLBACK });
    }
    res.json({ voices: [] });
  });

  return r;
}
