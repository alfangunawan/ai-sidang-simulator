import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { getSetting } from "../src/repos/settings.js";

function app() {
  const db = openDb(":memory:");
  return { app: buildApp(db, randomBytes(32)), db };
}

describe("settings routes", () => {
  it("GET returns defaults with has_api_key false and no raw key", async () => {
    const { app: a } = app();
    const res = await request(a).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("claude");
    expect(res.body.model).toBe("claude-sonnet-5");
    expect(res.body.has_api_key).toBe(false);
    expect(res.body).not.toHaveProperty("api_key");
  });

  it("POST stores an encrypted key, never returns it, and flips has_api_key", async () => {
    const { app: a, db } = app();
    const res = await request(a)
      .post("/settings")
      .send({ provider: "openrouter", model: "x/y", api_key: "or-SECRET" });
    expect(res.status).toBe(200);
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.provider).toBe("openrouter");
    expect(JSON.stringify(res.body)).not.toContain("or-SECRET");
    // stored value is ciphertext, not plaintext
    const stored = getSetting(db, "api_key");
    expect(stored).not.toBeNull();
    expect(stored).not.toContain("or-SECRET");
  });

  it("POST without api_key preserves the existing key", async () => {
    const { app: a } = app();
    await request(a).post("/settings").send({ api_key: "keep-me" });
    const res = await request(a).post("/settings").send({ model: "claude-opus-4-8" });
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.model).toBe("claude-opus-4-8");
  });

  it("GET returns TTS defaults (browser, no keys)", async () => {
    const { app: a } = app();
    const res = await request(a).get("/settings");
    expect(res.body.tts_provider).toBe("browser");
    expect(res.body.tts_voice).toBe("");
    expect(res.body.has_google_tts_key).toBe(false);
    expect(res.body.has_openai_tts_key).toBe(false);
  });

  it("POST stores a TTS provider, voice, and an encrypted Google key without leaking it", async () => {
    const { app: a, db } = app();
    const res = await request(a).post("/settings").send({
      tts_provider: "google",
      tts_voice: "id-ID-Chirp3-HD-Kore",
      google_tts_key: "gcp-SECRET",
    });
    expect(res.body.tts_provider).toBe("google");
    expect(res.body.tts_voice).toBe("id-ID-Chirp3-HD-Kore");
    expect(res.body.has_google_tts_key).toBe(true);
    expect(res.body.has_openai_tts_key).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("gcp-SECRET");
    expect(getSetting(db, "google_tts_key")).not.toContain("gcp-SECRET");
  });
});
