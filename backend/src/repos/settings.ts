import type Database from "better-sqlite3";
import { encrypt, decrypt } from "../crypto.js";
import {
  DEFAULT_ATTACK_POINTS,
  DEFAULT_EXAMINER_MODE,
  DEFAULT_EXAMINER_TYPE,
  EXAMINER_MODES,
  EXAMINER_TYPES,
} from "../persona.js";

const DEFAULTS: Record<string, string> = {
  provider: "claude",
  model: "claude-sonnet-5",
  attack_points: DEFAULT_ATTACK_POINTS,
  examiner_mode: DEFAULT_EXAMINER_MODE,
  examiner_type: DEFAULT_EXAMINER_TYPE,
  tts_provider: "browser",
  tts_voice: "",
  stt_provider: "browser",
};

// Maps a TTS provider to the settings key holding its (encrypted) API key.
function ttsKeyName(provider: string): string | null {
  if (provider === "google") return "google_tts_key";
  if (provider === "openai") return "openai_tts_key";
  return null;
}

export function getSetting(db: Database.Database, userId: number, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
    .get(userId, key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(
  db: Database.Database,
  userId: number,
  key: string,
  value: string,
): void {
  db.prepare(
    "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
  ).run(userId, key, value);
}

export function seedDefaults(db: Database.Database, userId: number): void {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(db, userId, k) === null) setSetting(db, userId, k, v);
  }
}

export function getSettingsView(
  db: Database.Database,
  userId: number,
): {
  provider: string;
  model: string;
  base_url: string;
  has_api_key: boolean;
  attack_points: string;
  examiner_mode: string;
  examiner_modes: { value: string; label: string }[];
  examiner_type: string;
  examiner_types: { value: string; label: string }[];
  tts_provider: string;
  tts_voice: string;
  has_google_tts_key: boolean;
  has_openai_tts_key: boolean;
  stt_provider: string;
  has_openai_stt_key: boolean;
} {
  return {
    provider: getSetting(db, userId, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, userId, "model") ?? DEFAULTS.model,
    base_url: getSetting(db, userId, "base_url") ?? "",
    has_api_key: getSetting(db, userId, "api_key") !== null,
    attack_points: getSetting(db, userId, "attack_points") ?? DEFAULTS.attack_points,
    examiner_mode: getSetting(db, userId, "examiner_mode") ?? DEFAULTS.examiner_mode,
    examiner_modes: Object.entries(EXAMINER_MODES).map(([value, m]) => ({
      value,
      label: m.label,
    })),
    examiner_type: getSetting(db, userId, "examiner_type") ?? DEFAULTS.examiner_type,
    examiner_types: Object.entries(EXAMINER_TYPES).map(([value, t]) => ({
      value,
      label: t.label,
    })),
    tts_provider: getSetting(db, userId, "tts_provider") ?? DEFAULTS.tts_provider,
    tts_voice: getSetting(db, userId, "tts_voice") ?? DEFAULTS.tts_voice,
    has_google_tts_key: getSetting(db, userId, "google_tts_key") !== null,
    has_openai_tts_key: getSetting(db, userId, "openai_tts_key") !== null,
    stt_provider: getSetting(db, userId, "stt_provider") ?? DEFAULTS.stt_provider,
    has_openai_stt_key: getSetting(db, userId, "openai_stt_key") !== null,
  };
}

export function saveSettings(
  db: Database.Database,
  userId: number,
  key: Buffer,
  body: {
    provider?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
    attack_points?: string;
    examiner_mode?: string;
    examiner_type?: string;
    tts_provider?: string;
    tts_voice?: string;
    google_tts_key?: string;
    openai_tts_key?: string;
    stt_provider?: string;
    openai_stt_key?: string;
  },
): void {
  if (body.provider !== undefined) setSetting(db, userId, "provider", body.provider);
  if (body.model !== undefined) setSetting(db, userId, "model", body.model);
  if (body.base_url !== undefined) setSetting(db, userId, "base_url", body.base_url);
  if (body.attack_points !== undefined)
    setSetting(db, userId, "attack_points", body.attack_points);
  if (body.examiner_mode !== undefined)
    setSetting(db, userId, "examiner_mode", body.examiner_mode);
  if (body.examiner_type !== undefined)
    setSetting(db, userId, "examiner_type", body.examiner_type);
  if (body.api_key !== undefined && body.api_key !== "") {
    setSetting(db, userId, "api_key", encrypt(body.api_key, key));
  }
  if (body.tts_provider !== undefined)
    setSetting(db, userId, "tts_provider", body.tts_provider);
  if (body.tts_voice !== undefined) setSetting(db, userId, "tts_voice", body.tts_voice);
  if (body.google_tts_key !== undefined && body.google_tts_key !== "") {
    setSetting(db, userId, "google_tts_key", encrypt(body.google_tts_key, key));
  }
  if (body.openai_tts_key !== undefined && body.openai_tts_key !== "") {
    setSetting(db, userId, "openai_tts_key", encrypt(body.openai_tts_key, key));
  }
  if (body.stt_provider !== undefined)
    setSetting(db, userId, "stt_provider", body.stt_provider);
  if (body.openai_stt_key !== undefined && body.openai_stt_key !== "") {
    setSetting(db, userId, "openai_stt_key", encrypt(body.openai_stt_key, key));
  }
}

// Decrypted LLM API key, or null when unset.
export function getLlmKey(db: Database.Database, userId: number, key: Buffer): string | null {
  const enc = getSetting(db, userId, "api_key");
  return enc ? decrypt(enc, key) : null;
}

// Decrypted API key for a TTS provider, or null when unset / not applicable.
export function getTtsKey(
  db: Database.Database,
  userId: number,
  key: Buffer,
  provider: string,
): string | null {
  const name = ttsKeyName(provider);
  if (!name) return null;
  const enc = getSetting(db, userId, name);
  return enc ? decrypt(enc, key) : null;
}

// Decrypted API key for the server-side speech-to-text provider. Deliberately
// separate from the TTS key: the two can be different OpenAI accounts.
export function getSttKey(db: Database.Database, userId: number, key: Buffer): string | null {
  const enc = getSetting(db, userId, "openai_stt_key");
  return enc ? decrypt(enc, key) : null;
}

// Active server-side TTS config. Throws for the browser provider (handled
// client-side) or when the selected provider is missing its key or voice.
export function getActiveTtsConfig(
  db: Database.Database,
  userId: number,
  key: Buffer,
): { provider: string; voice: string; apiKey: string } {
  const provider = getSetting(db, userId, "tts_provider") ?? DEFAULTS.tts_provider;
  if (provider === "browser") {
    throw new Error("Provider TTS browser tidak menggunakan server");
  }
  const apiKey = getTtsKey(db, userId, key, provider);
  if (!apiKey) throw new Error(`API key TTS ${provider} belum diset`);
  const voice = getSetting(db, userId, "tts_voice") ?? "";
  if (!voice) throw new Error("Voice TTS belum dipilih");
  return { provider, voice, apiKey };
}

export function getPersona(
  db: Database.Database,
  userId: number,
): { attackPoints: string; examinerMode: string; examinerType: string } {
  return {
    attackPoints: getSetting(db, userId, "attack_points") ?? DEFAULTS.attack_points,
    examinerMode: getSetting(db, userId, "examiner_mode") ?? DEFAULTS.examiner_mode,
    examinerType: getSetting(db, userId, "examiner_type") ?? DEFAULTS.examiner_type,
  };
}

export function getActiveConfig(
  db: Database.Database,
  userId: number,
  key: Buffer,
): {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  attackPoints: string;
  examinerMode: string;
  examinerType: string;
} {
  const enc = getSetting(db, userId, "api_key");
  if (!enc) throw new Error("API key belum diset");
  return {
    provider: getSetting(db, userId, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, userId, "model") ?? DEFAULTS.model,
    baseUrl: getSetting(db, userId, "base_url") ?? "",
    apiKey: decrypt(enc, key),
    ...getPersona(db, userId),
  };
}
