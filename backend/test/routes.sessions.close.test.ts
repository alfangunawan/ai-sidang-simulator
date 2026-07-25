// backend/test/routes.sessions.close.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";

afterEach(() => vi.restoreAllMocks());

const ASSESSMENT_JSON = JSON.stringify({
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 85 },
  final_score: 78,
  verdict: "Lulus dengan revisi",
  ringkasan: "Solid.",
  kelebihan: ["a"],
  kekurangan: ["b"],
  saran: ["c"],
});

function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  saveSettings(db, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, "thesis.pdf", "ISI", "2026-01-01T00:00:00Z");
  return buildApp(db, key);
}

function stubOnce(contents: string[]) {
  const fn = vi.fn();
  contents.forEach((c) =>
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: c } }] }),
    }),
  );
  vi.stubGlobal("fetch", fn as any);
  return fn;
}

describe("close/continue/result routes", () => {
  it("close scores the transcript, persists it, and blocks further turns", async () => {
    // first fetch = the turn's examiner reply, second = the assessment
    stubOnce(["Pertanyaan penguji?", ASSESSMENT_JSON]);
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    await request(app).post(`/sessions/${id}/turn`).send({ transcript: "jawab" });

    const closed = await request(app).post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(200);
    expect(closed.body.assessment.final_score).toBe(78);
    expect(closed.body.assessment.grade).toBe("B");

    const result = await request(app).get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("closed");
    expect(result.body.assessment.final_score).toBe(78);

    const turn = await request(app).post(`/sessions/${id}/turn`).send({ transcript: "lagi" });
    expect(turn.status).toBe(409);
  });

  it("close is idempotent — a second close returns the stored assessment without a new LLM call", async () => {
    const fetchFn = stubOnce([ASSESSMENT_JSON]);
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    // seed a turn directly is unnecessary; close works on an empty transcript too
    await request(app).post(`/sessions/${id}/close`).send({});
    const callsAfterFirst = fetchFn.mock.calls.length;
    const again = await request(app).post(`/sessions/${id}/close`).send({});
    expect(again.status).toBe(200);
    expect(again.body.assessment.final_score).toBe(78);
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst); // no extra LLM call
  });

  it("close 500s and stays active when the model never returns valid JSON", async () => {
    stubOnce(["bukan json", "masih bukan json"]); // both attempts fail
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    const closed = await request(app).post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(500);
    const result = await request(app).get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("active");
    expect(result.body.assessment).toBeNull();
  });

  it("continue records the decline and returns ok", async () => {
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    const cont = await request(app).post(`/sessions/${id}/continue`).send({});
    expect(cont.status).toBe(200);
    expect(cont.body).toEqual({ ok: true });
  });
});
