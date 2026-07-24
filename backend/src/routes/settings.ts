import { Router } from "express";
import type Database from "better-sqlite3";
import { getSettingsView, saveSettings } from "../repos/settings.js";

export function settingsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json(getSettingsView(db));
  });

  r.post("/", (req, res) => {
    saveSettings(db, key, req.body ?? {});
    res.json(getSettingsView(db));
  });

  return r;
}
