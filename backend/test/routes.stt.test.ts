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

const WHISPER = { stt_provider: "whisper", openai_stt_key: "sk-stt" };

describe("POST /stt/transcribe", () => {
  it("sends the recording to Whisper and returns the transcript", async () => {
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        sent.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ text: " Metode saya kuantitatif. " }) };
      }) as any,
    );

    const res = await (await appWith(WHISPER))
      .post("/stt/transcribe")
      .attach("audio", Buffer.from("fake-audio"), "answer.webm");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Metode saya kuantitatif." });
    expect(sent[0].url).toContain("audio/transcriptions");
    // The key travels in the header, never in the body or the URL.
    expect(sent[0].init.headers.Authorization).toBe("Bearer sk-stt");
    expect(sent[0].url).not.toContain("sk-stt");
  });

  it("400s when no audio was uploaded", async () => {
    const res = await (await appWith(WHISPER)).post("/stt/transcribe").send();
    expect(res.status).toBe(400);
  });

  it("400s when the STT key is missing", async () => {
    const res = await (await appWith({ stt_provider: "whisper" }))
      .post("/stt/transcribe")
      .attach("audio", Buffer.from("x"), "a.webm");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/i);
  });

  it("400s for the browser provider — that one never reaches the server", async () => {
    const res = await (await appWith({ stt_provider: "browser" }))
      .post("/stt/transcribe")
      .attach("audio", Buffer.from("x"), "a.webm");
    expect(res.status).toBe(400);
  });

  it("400s with the upstream status when Whisper rejects the call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" })) as any,
    );
    const res = await (await appWith(WHISPER))
      .post("/stt/transcribe")
      .attach("audio", Buffer.from("x"), "a.webm");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("401");
  });
});

describe("POST /stt/test", () => {
  it("browser provider is always ok (no key)", async () => {
    const res = await (await appWith({})).post("/stt/test").send({ provider: "browser" });
    expect(res.body).toEqual({ ok: true });
  });

  it("whisper ok when the key authenticates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })) as any);
    const res = await (await appWith(WHISPER)).post("/stt/test").send({});
    expect(res.body).toEqual({ ok: true });
  });

  it("reports a missing key", async () => {
    const res = await (await appWith({ stt_provider: "whisper" })).post("/stt/test").send({});
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/key/i);
  });

  it("prefers the key typed in the form over the saved one", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        seen.push(init.headers.Authorization);
        return { ok: true, status: 200 };
      }) as any,
    );
    await (await appWith(WHISPER)).post("/stt/test").send({ key: "sk-typed" });
    expect(seen[0]).toBe("Bearer sk-typed");
  });
});
