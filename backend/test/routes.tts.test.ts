import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";

afterEach(() => vi.restoreAllMocks());

async function appWith(settings: Parameters<typeof saveSettings>[3]) {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  const app = buildApp(db, key);
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username: "tester", password: "password1" });
  saveSettings(db, body.user.id, key, settings);
  return agent;
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
    const app = await appWith({
      tts_provider: "google",
      tts_voice: "id-ID-Chirp3-HD-Kore",
      google_tts_key: "gcp-key",
    });

    const res = await app.post("/tts/speak").send({ text: "Halo" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audio: "QUJD", mime: "audio/mpeg" });
  });

  it("400s when the selected provider has no key", async () => {
    const app = await appWith({ tts_provider: "google", tts_voice: "id-ID-Standard-A" });
    const res = await app.post("/tts/speak").send({ text: "Halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/i);
  });

  it("400s on empty text", async () => {
    const app = await appWith({
      tts_provider: "openai",
      tts_voice: "nova",
      openai_tts_key: "sk",
    });
    const res = await app.post("/tts/speak").send({ text: "   " });
    expect(res.status).toBe(400);
  });
});

describe("POST /tts/test", () => {
  it("browser provider is always ok (no key)", async () => {
    const res = await (await appWith({})).post("/tts/test").send({ provider: "browser" });
    expect(res.body).toEqual({ ok: true });
  });

  it("google ok when the voices call succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ voices: [] }) })) as any,
    );
    const app = await appWith({ tts_provider: "google", google_tts_key: "gk" });
    const res = await app.post("/tts/test").send({});
    expect(res.body).toEqual({ ok: true });
  });

  it("openai ok when the models call succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })) as any);
    const app = await appWith({ tts_provider: "openai", openai_tts_key: "sk" });
    const res = await app.post("/tts/test").send({});
    expect(res.body).toEqual({ ok: true });
  });

  it("reports a missing key", async () => {
    const app = await appWith({ tts_provider: "google" });
    const res = await app.post("/tts/test").send({});
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/key/i);
  });

  it("reports failure on a bad key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "no" })) as any,
    );
    const res = await (await appWith({ google_tts_key: "gk" }))
      .post("/tts/test")
      .send({ provider: "google" });
    expect(res.body.ok).toBe(false);
  });
});

describe("POST /tts/preview", () => {
  it("synthesizes the sample with the given voice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ audioContent: "QUJD" }) })) as any,
    );
    const res = await (await appWith({ google_tts_key: "gk" }))
      .post("/tts/preview")
      .send({ provider: "google", voice: "id-ID-Standard-A" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audio: "QUJD", mime: "audio/mpeg" });
  });

  it("400s without a voice", async () => {
    const res = await (await appWith({ google_tts_key: "gk" }))
      .post("/tts/preview")
      .send({ provider: "google" });
    expect(res.status).toBe(400);
  });

  it("400s for the browser provider", async () => {
    const res = await (await appWith({}))
      .post("/tts/preview")
      .send({ provider: "browser", voice: "x" });
    expect(res.status).toBe(400);
  });
});

describe("GET /tts/voices", () => {
  it("returns the static OpenAI voice list", async () => {
    const app = await appWith({});
    const res = await app.get("/tts/voices?provider=openai");
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
    const app = await appWith({ google_tts_key: "gcp-key" });
    const res = await app.get("/tts/voices?provider=google");
    expect(res.status).toBe(200);
    expect(res.body.voices).toEqual([
      { name: "id-ID-Neural2-A", gender: "FEMALE", type: "Neural2" },
    ]);
  });

  it("returns a non-empty fallback list when Google cannot be reached", async () => {
    const app = await appWith({}); // no google key -> cannot call the API
    const res = await app.get("/tts/voices?provider=google");
    expect(res.status).toBe(200);
    expect(res.body.voices.length).toBeGreaterThan(0);
  });
});
