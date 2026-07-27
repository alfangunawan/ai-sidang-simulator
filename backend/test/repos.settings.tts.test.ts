import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  saveSettings,
  getActiveTtsConfig,
  getTtsKey,
} from "../src/repos/settings.js";

function db() {
  const d = openDb(":memory:");
  const userId = createUser(d, "tester", "h", "2026-01-01T00:00:00Z");
  return { db: d, key: randomBytes(32), userId };
}

describe("getActiveTtsConfig", () => {
  it("throws for the browser provider (handled client-side)", () => {
    const { db: d, key, userId } = db();
    expect(() => getActiveTtsConfig(d, userId, key)).toThrow(); // default provider is browser
  });

  it("throws when the selected provider has no key", () => {
    const { db: d, key, userId } = db();
    saveSettings(d, userId, key, { tts_provider: "google", tts_voice: "id-ID-Standard-A" });
    expect(() => getActiveTtsConfig(d, userId, key)).toThrow(/key/i);
  });

  it("returns the decrypted config for a fully configured provider", () => {
    const { db: d, key, userId } = db();
    saveSettings(d, userId, key, {
      tts_provider: "openai",
      tts_voice: "nova",
      openai_tts_key: "sk-abc",
    });
    expect(getActiveTtsConfig(d, userId, key)).toEqual({
      provider: "openai",
      voice: "nova",
      apiKey: "sk-abc",
    });
  });
});

describe("getTtsKey", () => {
  it("returns the decrypted key for a provider, null when unset", () => {
    const { db: d, key, userId } = db();
    saveSettings(d, userId, key, { google_tts_key: "gcp-123" });
    expect(getTtsKey(d, userId, key, "google")).toBe("gcp-123");
    expect(getTtsKey(d, userId, key, "openai")).toBeNull();
    expect(getTtsKey(d, userId, key, "browser")).toBeNull();
  });
});
