import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";

afterEach(() => vi.restoreAllMocks());

function appWith(settings: Parameters<typeof saveSettings>[2]) {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  saveSettings(db, key, settings);
  return buildApp(db, key);
}

describe("POST /tts/speak", () => {
  it("synthesizes with the configured provider and returns base64 audio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ audioContent: "QUJD" }),
      })) as any,
    );
    const app = appWith({
      tts_provider: "google",
      tts_voice: "id-ID-Chirp3-HD-Kore",
      google_tts_key: "gcp-key",
    });

    const res = await request(app).post("/tts/speak").send({ text: "Halo" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audio: "QUJD", mime: "audio/mpeg" });
  });

  it("400s when the selected provider has no key", async () => {
    const app = appWith({ tts_provider: "google", tts_voice: "id-ID-Standard-A" });
    const res = await request(app).post("/tts/speak").send({ text: "Halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/i);
  });

  it("400s on empty text", async () => {
    const app = appWith({
      tts_provider: "openai",
      tts_voice: "nova",
      openai_tts_key: "sk",
    });
    const res = await request(app).post("/tts/speak").send({ text: "   " });
    expect(res.status).toBe(400);
  });
});

describe("GET /tts/voices", () => {
  it("returns the static OpenAI voice list", async () => {
    const app = appWith({});
    const res = await request(app).get("/tts/voices?provider=openai");
    expect(res.status).toBe(200);
    expect(res.body.voices.map((v: any) => v.name)).toContain("nova");
  });

  it("proxies Google voices for id-ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          voices: [{ name: "id-ID-Neural2-A", ssmlGender: "FEMALE" }],
        }),
      })) as any,
    );
    const app = appWith({ google_tts_key: "gcp-key" });
    const res = await request(app).get("/tts/voices?provider=google");
    expect(res.status).toBe(200);
    expect(res.body.voices).toEqual([
      { name: "id-ID-Neural2-A", gender: "FEMALE", type: "Neural2" },
    ]);
  });

  it("returns a non-empty fallback list when Google cannot be reached", async () => {
    const app = appWith({}); // no google key -> cannot call the API
    const res = await request(app).get("/tts/voices?provider=google");
    expect(res.status).toBe(200);
    expect(res.body.voices.length).toBeGreaterThan(0);
  });
});
