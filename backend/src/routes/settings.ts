import { Router } from "express";
import type Database from "better-sqlite3";
import type * as express from "express";
import {
  getSettingsView,
  saveSettings,
  getSetting,
  getLlmKey,
} from "../repos/settings.js";
import { getProvider } from "../providers/index.js";
import { getUsageView, resetUsage } from "../repos/usage.js";
import { resolveSourceUser, getEffectiveTtsConfig } from "../effectiveConfig.js";

export function settingsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.get("/", (req, res) => {
    const userId = req.userId!;
    const view = getSettingsView(db, userId);
    const aiSrc = resolveSourceUser(db, userId, "ai");
    const ttsSrc = resolveSourceUser(db, userId, "tts");
    const sttSrc = resolveSourceUser(db, userId, "stt");
    let eff_tts_provider = view.tts_provider;
    let eff_tts_voice = view.tts_voice;
    if (ttsSrc !== userId) {
      try {
        const t = getEffectiveTtsConfig(db, userId, key);
        eff_tts_provider = t.provider;
        eff_tts_voice = t.voice;
      } catch {
        /* host cfg incomplete → keep own */
      }
    }
    res.json({
      ...view,
      // Yang benar-benar dipakai saat sidang berjalan. Untuk anggota kolaborasi
      // ini milik host, dan itulah yang harus dibaca UI — bukan setelan sendiri
      // yang selama tergabung diabaikan.
      effective_provider: getSetting(db, aiSrc, "provider") ?? view.provider,
      effective_model: getSetting(db, aiSrc, "model") ?? view.model,
      effective_base_url: getSetting(db, aiSrc, "base_url") ?? view.base_url,
      effective_ai_shared: aiSrc !== userId,
      effective_tts_shared: ttsSrc !== userId,
      effective_stt_shared: sttSrc !== userId,
      effective_tts_provider: eff_tts_provider,
      effective_tts_voice: eff_tts_voice,
      effective_stt_provider: getSetting(db, sttSrc, "stt_provider") ?? "browser",
    });
  });

  const handleSettingsSave = (req: express.Request, res: express.Response) => {
    const userId = req.userId!;
    const body = req.body ?? {};
    const fields = [
      "provider",
      "model",
      "base_url",
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
    // Base URL ini dipakai server untuk memanggil ke luar, jadi skemanya
    // dibatasi di sini — bukan di UI, yang bisa dilewati.
    if (body.base_url && !/^https?:\/\//i.test(body.base_url)) {
      return res.status(400).json({ error: "URL API harus diawali http:// atau https://" });
    }
    saveSettings(db, userId, key, body);
    res.json(getSettingsView(db, userId));
  };

  r.post("/", handleSettingsSave);
  r.put("/", handleSettingsSave);

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
    const baseUrl = (body.base_url as string) ?? getSetting(db, userId, "base_url") ?? "";
    const apiKey =
      typeof body.api_key === "string" && body.api_key
        ? body.api_key
        : getLlmKey(db, userId, key);
    if (!apiKey) {
      return res.json({ ok: false, error: "API key belum diisi" });
    }
    try {
      await getProvider({ provider, model, apiKey, baseUrl }).checkAuth();
      res.json({ ok: true });
    } catch (e) {
      // Sebab aslinya diteruskan, bukan diringkas jadi "koneksi gagal": yang
      // membedakan URL salah (404) dari key salah (401) justru pesan itu, dan
      // tanpanya user menebak-nebak kolom mana yang keliru. Key disaring dulu —
      // SDK pihak ketiga tidak menjanjikan pesannya bersih.
      // Panjang minimum penting: key sependek "k" akan mencacah kata biasa
      // ("tidak" jadi "tida***"). Key sungguhan tidak pernah sependek itu.
      const raw = e instanceof Error ? e.message : "";
      const msg = apiKey.length >= 8 ? raw.split(apiKey).join("***") : raw;
      res.json({
        ok: false,
        error: msg || "Koneksi gagal — periksa provider / URL / API key",
      });
    }
  });

  return r;
}
