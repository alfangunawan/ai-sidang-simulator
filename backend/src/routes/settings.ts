import { Router } from "express";
import type Database from "better-sqlite3";
import { getSettingsView, saveSettings } from "../repos/settings.js";

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
    ] as const;
    for (const field of fields) {
      if (field in body && typeof body[field] !== "string") {
        return res.status(400).json({ error: "Field harus berupa string" });
      }
    }
    saveSettings(db, key, body);
    res.json(getSettingsView(db));
  });

  return r;
}
