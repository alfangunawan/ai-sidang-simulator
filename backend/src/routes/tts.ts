import { Router } from "express";
import type Database from "better-sqlite3";
import { getActiveTtsConfig, getTtsKey } from "../repos/settings.js";
import {
  synthesize,
  googleVoices,
  OPENAI_VOICES,
  type TtsVoice,
} from "../providers/tts/index.js";

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
    const text = (req.body?.text ?? "").toString();
    if (!text.trim()) return res.status(400).json({ error: "Teks kosong" });
    try {
      const cfg = getActiveTtsConfig(db, key);
      res.json(await synthesize(cfg, text));
    } catch (e) {
      // Missing key/voice or synth failure → 400, so the chat never 500s on audio.
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.get("/voices", async (req, res) => {
    const provider = (req.query.provider ?? "").toString();
    if (provider === "openai") return res.json({ voices: OPENAI_VOICES });
    if (provider === "google") {
      const gkey = getTtsKey(db, key, "google");
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
