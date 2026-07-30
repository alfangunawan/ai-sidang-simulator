import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { seedDefaults, saveSettings } from "../src/repos/settings.js";
import { createCollab, setShares, joinByCode } from "../src/repos/collab.js";
import { resolveSourceUser, getEffectiveLlmConfig } from "../src/effectiveConfig.js";

const KEY = randomBytes(32);

function ctx() {
  const db = openDb(":memory:");
  const host = createUser(db, "host", "h", "t");
  const member = createUser(db, "member", "h", "t");
  seedDefaults(db, host); seedDefaults(db, member);
  return { db, host, member };
}

describe("effective config resolution", () => {
  it("borrows the host's AI when shared and host has a key; persona stays the member's", () => {
    const { db, host, member } = ctx();
    saveSettings(db, host, KEY, { api_key: "sk-HOST", model: "claude-opus-5" });
    saveSettings(db, member, KEY, { attack_points: "metodologi", model: "claude-sonnet-5" });
    createCollab(db, host, "CODE", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 0 });
    joinByCode(db, member, "CODE", "t");

    expect(resolveSourceUser(db, member, "ai")).toBe(host);
    const cfg = getEffectiveLlmConfig(db, member, KEY);
    expect(cfg.apiKey).toBe("sk-HOST");       // host's key
    expect(cfg.model).toBe("claude-opus-5");  // host's model
    expect(cfg.attackPoints).toBe("metodologi"); // member's persona
  });

  it("falls back to own when not shared, or host has no key, or not a member", () => {
    const { db, host, member } = ctx();
    saveSettings(db, member, KEY, { api_key: "sk-OWN" });
    createCollab(db, host, "CODE", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 0 }); // host shares AI but has NO key
    joinByCode(db, member, "CODE", "t");
    expect(resolveSourceUser(db, member, "ai")).toBe(member); // host lacks key → fallback
    expect(getEffectiveLlmConfig(db, member, KEY).apiKey).toBe("sk-OWN");
  });

  it("stays with own config when never a member of any collab", () => {
    const { db, member } = ctx();
    saveSettings(db, member, KEY, { api_key: "sk-OWN2" });
    expect(resolveSourceUser(db, member, "ai")).toBe(member);
    expect(getEffectiveLlmConfig(db, member, KEY).apiKey).toBe("sk-OWN2");
  });

  it("stops borrowing once the host turns sharing off", () => {
    const { db, host, member } = ctx();
    saveSettings(db, host, KEY, { api_key: "sk-HOST2" });
    saveSettings(db, member, KEY, { api_key: "sk-OWN3" });
    createCollab(db, host, "CODE2", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 0 });
    joinByCode(db, member, "CODE2", "t");
    setShares(db, host, { share_ai: 0, share_tts: 0, share_stt: 0 }); // revoked
    expect(resolveSourceUser(db, member, "ai")).toBe(member);
    expect(getEffectiveLlmConfig(db, member, KEY).apiKey).toBe("sk-OWN3");
  });
});
