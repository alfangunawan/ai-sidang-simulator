import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import {
  saveSettings,
  getActiveTtsConfig,
  getTtsKey,
} from "../src/repos/settings.js";

function db() {
  return { db: openDb(":memory:"), key: randomBytes(32) };
}

describe("getActiveTtsConfig", () => {
  it("throws for the browser provider (handled client-side)", () => {
    const { db: d, key } = db();
    expect(() => getActiveTtsConfig(d, key)).toThrow(); // default provider is browser
  });

  it("throws when the selected provider has no key", () => {
    const { db: d, key } = db();
    saveSettings(d, key, { tts_provider: "google", tts_voice: "id-ID-Standard-A" });
    expect(() => getActiveTtsConfig(d, key)).toThrow(/key/i);
  });

  it("returns the decrypted config for a fully configured provider", () => {
    const { db: d, key } = db();
    saveSettings(d, key, {
      tts_provider: "openai",
      tts_voice: "nova",
      openai_tts_key: "sk-abc",
    });
    expect(getActiveTtsConfig(d, key)).toEqual({
      provider: "openai",
      voice: "nova",
      apiKey: "sk-abc",
    });
  });
});

describe("getTtsKey", () => {
  it("returns the decrypted key for a provider, null when unset", () => {
    const { db: d, key } = db();
    saveSettings(d, key, { google_tts_key: "gcp-123" });
    expect(getTtsKey(d, key, "google")).toBe("gcp-123");
    expect(getTtsKey(d, key, "openai")).toBeNull();
    expect(getTtsKey(d, key, "browser")).toBeNull();
  });
});
