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
  tts_provider: "browser",
  tts_voice: "",
};

// Maps a TTS provider to the settings key holding its (encrypted) API key.
function ttsKeyName(provider: string): string | null {
  if (provider === "google") return "google_tts_key";
  if (provider === "openai") return "openai_tts_key";
  return null;
}

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
  tts_provider: string;
  tts_voice: string;
  has_google_tts_key: boolean;
  has_openai_tts_key: boolean;
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
    tts_provider: getSetting(db, "tts_provider") ?? DEFAULTS.tts_provider,
    tts_voice: getSetting(db, "tts_voice") ?? DEFAULTS.tts_voice,
    has_google_tts_key: getSetting(db, "google_tts_key") !== null,
    has_openai_tts_key: getSetting(db, "openai_tts_key") !== null,
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
    tts_provider?: string;
    tts_voice?: string;
    google_tts_key?: string;
    openai_tts_key?: string;
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
  if (body.tts_provider !== undefined)
    setSetting(db, "tts_provider", body.tts_provider);
  if (body.tts_voice !== undefined) setSetting(db, "tts_voice", body.tts_voice);
  if (body.google_tts_key !== undefined && body.google_tts_key !== "") {
    setSetting(db, "google_tts_key", encrypt(body.google_tts_key, key));
  }
  if (body.openai_tts_key !== undefined && body.openai_tts_key !== "") {
    setSetting(db, "openai_tts_key", encrypt(body.openai_tts_key, key));
  }
}

// Decrypted API key for a TTS provider, or null when unset / not applicable.
export function getTtsKey(
  db: Database.Database,
  key: Buffer,
  provider: string,
): string | null {
  const name = ttsKeyName(provider);
  if (!name) return null;
  const enc = getSetting(db, name);
  return enc ? decrypt(enc, key) : null;
}

// Active server-side TTS config. Throws for the browser provider (handled
// client-side) or when the selected provider is missing its key or voice.
export function getActiveTtsConfig(
  db: Database.Database,
  key: Buffer,
): { provider: string; voice: string; apiKey: string } {
  const provider = getSetting(db, "tts_provider") ?? DEFAULTS.tts_provider;
  if (provider === "browser") {
    throw new Error("Provider TTS browser tidak menggunakan server");
  }
  const apiKey = getTtsKey(db, key, provider);
  if (!apiKey) throw new Error(`API key TTS ${provider} belum diset`);
  const voice = getSetting(db, "tts_voice") ?? "";
  if (!voice) throw new Error("Voice TTS belum dipilih");
  return { provider, voice, apiKey };
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
