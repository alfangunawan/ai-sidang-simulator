import { Router } from "express";
import type Database from "better-sqlite3";
import {
  getSettingsView,
  saveSettings,
  getSetting,
  getLlmKey,
} from "../repos/settings.js";
import { getProvider } from "../providers/index.js";
import { getUsageView, resetUsage } from "../repos/usage.js";

export function settingsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.get("/", (req, res) => {
    const userId = req.userId!;
    res.json(getSettingsView(db, userId));
  });

  r.post("/", (req, res) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const fields = [
      "provider",
      "model",
      "api_key",
      "attack_points",
      "examiner_mode",
      "examiner_type",
      "tts_provider",
      "tts_voice",
      "google_tts_key",
      "openai_tts_key",
      "stt_provider",
      "openai_stt_key",
    ] as const;
    for (const field of fields) {
      if (field in body && typeof body[field] !== "string") {
        return res.status(400).json({ error: "Field harus berupa string" });
      }
    }
    saveSettings(db, userId, key, body);
    res.json(getSettingsView(db, userId));
  });

  r.get("/usage", (req, res) => {
    const userId = req.userId!;
    res.json(getUsageView(db, userId));
  });

  r.delete("/usage", (req, res) => {
    const userId = req.userId!;
    resetUsage(db, userId);
    res.json(getUsageView(db, userId));
  });

  // Auth/connection check for the LLM provider. Uses the typed key if provided,
  // else the saved one. Always 200; the result is in `ok`.
  r.post("/test-llm", async (req, res) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const provider = (body.provider as string) ?? getSetting(db, userId, "provider") ?? "claude";
    const model = (body.model as string) ?? getSetting(db, userId, "model") ?? "";
    const apiKey =
      typeof body.api_key === "string" && body.api_key
        ? body.api_key
        : getLlmKey(db, userId, key);
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
