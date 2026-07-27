import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";

afterEach(() => vi.restoreAllMocks());

async function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  const app = buildApp(db, key);
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username: "tester", password: "password1" });
  const userId = body.user.id;
  // configure openrouter so the turn goes through global fetch (easy to stub)
  saveSettings(db, userId, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, userId, "thesis.pdf", "ISI SKRIPSI LENGKAP", "2026-01-01T00:00:00Z");
  return agent;
}

describe("sessions routes", () => {
  it("creates a session and returns a session_id", async () => {
    const agent = await ready();
    const res = await agent.post("/sessions").send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.session_id).toBe("string");
    expect(res.body.session_id.length).toBeGreaterThan(0);
  });

  it("runs a full turn and stores user + examiner turns in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Pertanyaan penguji?" } }] }),
      })) as any,
    );
    const agent = await ready();
    const created = await agent.post("/sessions").send({});
    const id = created.body.session_id;

    const turn = await agent
      .post(`/sessions/${id}/turn`)
      .send({ transcript: "Ini jawaban saya." });
    expect(turn.status).toBe(200);
    expect(turn.body.reply).toBe("Pertanyaan penguji?");

    const turns = await agent.get(`/sessions/${id}/turns`);
    expect(turns.body.turns).toEqual([
      { role: "user", content: "Ini jawaban saya." },
      { role: "examiner", content: "Pertanyaan penguji?" },
    ]);
  });

  it("400s a turn when no API key is set", async () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const app = buildApp(db, key);
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "tester", password: "password1" });
    replaceDocument(db, body.user.id, "t.pdf", "isi", "2026-01-01T00:00:00Z");
    const created = await agent.post("/sessions").send({});
    const res = await agent
      .post(`/sessions/${created.body.session_id}/turn`)
      .send({ transcript: "halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/API key/i);
  });

  it("400s a turn when no document is uploaded", async () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const app = buildApp(db, key);
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "tester", password: "password1" });
    saveSettings(db, body.user.id, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
    const created = await agent.post("/sessions").send({});
    const res = await agent
      .post(`/sessions/${created.body.session_id}/turn`)
      .send({ transcript: "halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skripsi/i);
  });

  it("provider failure leaves no orphaned user turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "err",
      })) as any,
    );
    const agent = await ready();
    const created = await agent.post("/sessions").send({});
    const id = created.body.session_id;

    const turn = await agent
      .post(`/sessions/${id}/turn`)
      .send({ transcript: "Ini jawaban saya." });
    expect(turn.status).toBe(500);
    expect(turn.body.error).toBeTruthy();

    const turns = await agent.get(`/sessions/${id}/turns`);
    expect(turns.body.turns).toEqual([]);
  });

  it("GET /sessions lists sessions that have turns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "q" } }] }),
      })) as any,
    );
    const agent = await ready();
    const created = await agent.post("/sessions").send({});
    await agent
      .post(`/sessions/${created.body.session_id}/turn`)
      .send({ transcript: "halo" });

    const res = await agent.get("/sessions");
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].id).toBe(created.body.session_id);
    expect(res.body.sessions[0].turn_count).toBe(2);
  });

  it("404s a turn for an unknown session", async () => {
    const agent = await ready();
    const res = await agent
      .post("/sessions/does-not-exist/turn")
      .send({ transcript: "halo" });
    expect(res.status).toBe(404);
  });

  it("deletes a session and cascades its turns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "q" } }] }),
      })) as any,
    );
    const agent = await ready();
    const created = await agent.post("/sessions").send({});
    const id = created.body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "hi" });

    const del = await agent.delete(`/sessions/${id}`);
    expect(del.body).toEqual({ ok: true });

    const turns = await agent.get(`/sessions/${id}/turns`);
    expect(turns.status).toBe(404); // deleted session is no longer owned
  });
});
