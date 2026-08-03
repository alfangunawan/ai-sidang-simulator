import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";
import { seedDossier } from "./fixtures/dossier.js";

afterEach(() => vi.restoreAllMocks());

async function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  const agent = request.agent(buildApp(db, key));
  const { body } = await agent
    .post("/auth/register")
    .send({ username: "tester", password: "password1" });
  saveSettings(db, body.user.id, key, {
    provider: "openrouter",
    model: "x/y",
    api_key: "or-key",
  });
  seedDossier(
    db,
    replaceDocument(db, body.user.id, "thesis.pdf", "ISI SKRIPSI", "2026-01-01T00:00:00Z", key),
    key,
  );
  return { agent, db };
}

function stubReply(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    })) as any,
  );
}

const ASSESSMENT = JSON.stringify({
  scores: {
    penguasaan_materi: 70,
    metodologi: 70,
    kualitas_orisinalitas: 70,
    argumentasi: 70,
  },
  final_score: 70,
  grade: "B",
  verdict: "Lulus dengan revisi",
  ringkasan: "Cukup.",
  kelebihan: ["a"],
  kekurangan: ["b"],
  saran: ["c"],
});

describe("leaving a sidang without a grade", () => {
  it("closes the session, keeps the transcript, and spends nothing on a provider", async () => {
    stubReply("Pertanyaan?");
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban" });

    const calls = (globalThis.fetch as any).mock.calls.length;
    expect((await agent.post(`/sessions/${id}/exit`)).status).toBe(200);
    expect((globalThis.fetch as any).mock.calls.length).toBe(calls);

    const result = await agent.get(`/sessions/${id}/result`);
    expect(result.body).toEqual({ status: "closed", assessment: null });
    expect((await agent.get(`/sessions/${id}/turns`)).body.turns).toHaveLength(2);

    // Ditutup berarti ditutup: giliran berikutnya ditolak, bukan menyambung diam-diam.
    expect((await agent.post(`/sessions/${id}/turn`)).status).toBe(409);
  });

  it("still grades that sidang later, when the student changes their mind", async () => {
    stubReply("Pertanyaan?");
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban" });
    await agent.post(`/sessions/${id}/exit`);

    stubReply(ASSESSMENT);
    const close = await agent.post(`/sessions/${id}/close`);
    expect(close.status).toBe(200);
    expect(close.body.assessment.final_score).toBe(70);
    expect((await agent.get(`/sessions/${id}/result`)).body.assessment.grade).toBe("B");
  });

  it("leaves an already graded sidang alone", async () => {
    stubReply("Pertanyaan?");
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban" });
    stubReply(ASSESSMENT);
    await agent.post(`/sessions/${id}/close`);

    expect((await agent.post(`/sessions/${id}/exit`)).status).toBe(200);
    expect((await agent.get(`/sessions/${id}/result`)).body.assessment.final_score).toBe(70);
  });

  it("does not touch someone else's session", async () => {
    const { agent } = await ready();
    expect((await agent.post("/sessions/tidak-ada/exit")).status).toBe(404);
  });
});
