import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { seedDefaults, getSettingsView, saveSettings, getLlmKey } from "../src/repos/settings.js";

const KEY = randomBytes(32);

describe("per-user settings", () => {
  it("isolates api keys and defaults between users", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    seedDefaults(db, u1);
    seedDefaults(db, u2);

    saveSettings(db, u1, KEY, { api_key: "sk-secret-1" });

    expect(getSettingsView(db, u1).has_api_key).toBe(true);
    expect(getSettingsView(db, u2).has_api_key).toBe(false);
    expect(getLlmKey(db, u1, KEY)).toBe("sk-secret-1");
    expect(getLlmKey(db, u2, KEY)).toBeNull();
    expect(getSettingsView(db, u2).model).toBe("claude-sonnet-5"); // default seeded
  });
});
