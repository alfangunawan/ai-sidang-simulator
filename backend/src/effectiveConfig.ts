import type Database from "better-sqlite3";
import { getSetting, getActiveConfig, getActiveTtsConfig, getPersona } from "./repos/settings.js";
import { getMembership } from "./repos/collab.js";

type Cap = "ai" | "tts" | "stt";

function hostHasKey(db: Database.Database, hostId: number, cap: Cap): boolean {
  if (cap === "ai") return getSetting(db, hostId, "api_key") !== null;
  if (cap === "stt") return getSetting(db, hostId, "openai_stt_key") !== null;
  const prov = getSetting(db, hostId, "tts_provider") ?? "browser";
  if (prov === "browser") return false;
  const keyName = prov === "google" ? "google_tts_key" : prov === "openai" ? "openai_tts_key" : null;
  return keyName ? getSetting(db, hostId, keyName) !== null : false;
}

export function resolveSourceUser(db: Database.Database, userId: number, cap: Cap): number {
  const m = getMembership(db, userId);
  if (!m) return userId;
  const shared = cap === "ai" ? m.share_ai : cap === "tts" ? m.share_tts : m.share_stt;
  if (!shared) return userId;
  if (!hostHasKey(db, m.host_user_id, cap)) return userId;
  return m.host_user_id;
}

export function getEffectiveLlmConfig(db: Database.Database, userId: number, key: Buffer) {
  const src = resolveSourceUser(db, userId, "ai");
  const base = getActiveConfig(db, src, key); // throws "API key belum diset" if src has none
  return { provider: base.provider, model: base.model, apiKey: base.apiKey, ...getPersona(db, userId) };
}

export function getEffectiveTtsConfig(db: Database.Database, userId: number, key: Buffer) {
  return getActiveTtsConfig(db, resolveSourceUser(db, userId, "tts"), key);
}

export function resolveSttSource(db: Database.Database, userId: number): number {
  return resolveSourceUser(db, userId, "stt");
}
