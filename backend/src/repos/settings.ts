import type Database from "better-sqlite3";
import { encrypt, decrypt } from "../crypto.js";
import {
  DEFAULT_ATTACK_POINTS,
  DEFAULT_EXAMINER_MODE,
  EXAMINER_MODES,
} from "../persona.js";

const DEFAULTS: Record<string, string> = {
  provider: "claude",
  model: "claude-sonnet-5",
  attack_points: DEFAULT_ATTACK_POINTS,
  examiner_mode: DEFAULT_EXAMINER_MODE,
};

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function seedDefaults(db: Database.Database): void {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(db, k) === null) setSetting(db, k, v);
  }
}

export function getSettingsView(db: Database.Database): {
  provider: string;
  model: string;
  has_api_key: boolean;
  attack_points: string;
  examiner_mode: string;
  examiner_modes: { value: string; label: string }[];
} {
  return {
    provider: getSetting(db, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, "model") ?? DEFAULTS.model,
    has_api_key: getSetting(db, "api_key") !== null,
    attack_points: getSetting(db, "attack_points") ?? DEFAULTS.attack_points,
    examiner_mode: getSetting(db, "examiner_mode") ?? DEFAULTS.examiner_mode,
    examiner_modes: Object.entries(EXAMINER_MODES).map(([value, m]) => ({
      value,
      label: m.label,
    })),
  };
}

export function saveSettings(
  db: Database.Database,
  key: Buffer,
  body: {
    provider?: string;
    api_key?: string;
    model?: string;
    attack_points?: string;
    examiner_mode?: string;
  },
): void {
  if (body.provider !== undefined) setSetting(db, "provider", body.provider);
  if (body.model !== undefined) setSetting(db, "model", body.model);
  if (body.attack_points !== undefined)
    setSetting(db, "attack_points", body.attack_points);
  if (body.examiner_mode !== undefined)
    setSetting(db, "examiner_mode", body.examiner_mode);
  if (body.api_key !== undefined && body.api_key !== "") {
    setSetting(db, "api_key", encrypt(body.api_key, key));
  }
}

export function getActiveConfig(
  db: Database.Database,
  key: Buffer,
): {
  provider: string;
  model: string;
  apiKey: string;
  attackPoints: string;
  examinerMode: string;
} {
  const enc = getSetting(db, "api_key");
  if (!enc) throw new Error("API key belum diset");
  return {
    provider: getSetting(db, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, "model") ?? DEFAULTS.model,
    apiKey: decrypt(enc, key),
    attackPoints: getSetting(db, "attack_points") ?? DEFAULTS.attack_points,
    examinerMode: getSetting(db, "examiner_mode") ?? DEFAULTS.examiner_mode,
  };
}
