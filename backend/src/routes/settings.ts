import { Router } from "express";
import type Database from "better-sqlite3";
import {
  getSettingsView,
  saveSettings,
  getSetting,
  getLlmKey,
} from "../repos/settings.js";
import { getProvider } from "../providers/index.js";

export function settingsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json(getSettingsView(db));
  });

  r.post("/", (req, res) => {
    const body = req.body ?? {};
    const fields = [
      "provider",
      "model",
      "api_key",
      "attack_points",
      "examiner_mode",
      "tts_provider",
      "tts_voice",
      "google_tts_key",
      "openai_tts_key",
    ] as const;
    for (const field of fields) {
      if (field in body && typeof body[field] !== "string") {
        return res.status(400).json({ error: "Field harus berupa string" });
      }
    }
    saveSettings(db, key, body);
    res.json(getSettingsView(db));
  });

  // Auth/connection check for the LLM provider. Uses the typed key if provided,
  // else the saved one. Always 200; the result is in `ok`.
  r.post("/test-llm", async (req, res) => {
    const body = req.body ?? {};
    const provider = (body.provider as string) ?? getSetting(db, "provider") ?? "claude";
    const model = (body.model as string) ?? getSetting(db, "model") ?? "";
    const apiKey =
      typeof body.api_key === "string" && body.api_key
        ? body.api_key
        : getLlmKey(db, key);
    if (!apiKey) {
      return res.json({ ok: false, error: "API key belum diisi" });
    }
    try {
      await getProvider({ provider, model, apiKey }).checkAuth();
      res.json({ ok: true });
    } catch {
      res.json({ ok: false, error: "Koneksi gagal — periksa provider / API key" });
    }
  });

  return r;
}
