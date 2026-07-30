// backend/test/routes.sessions.close.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";
import { seedDossier, SAMPLE_DOSSIER } from "./fixtures/dossier.js";
import { replaceChunks } from "../src/repos/chunks.js";
import { setDossierPending } from "../src/repos/documents.js";
import { ASSESSMENT_MAX_TOKENS } from "../src/providers/types.js";

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

async function ready() {
  return (await readyWithDb()).agent;
}

async function readyWithDb() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  const app = buildApp(db, key);
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username: "tester", password: "password1" });
  const userId = body.user.id;
  saveSettings(db, userId, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  const documentId = replaceDocument(
    db,
    userId,
    "thesis.pdf",
    "NASKAH LENGKAP YANG TIDAK BOLEH DIKIRIM",
    "2026-01-01T00:00:00Z",
  );
  seedDossier(db, documentId);
  return { agent, db, documentId };
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

// Like stubOnce, but each reply carries its own finish_reason and every request
// body is captured so a test can assert what was actually asked of the model.
function stubWithFinish(replies: { content: string; finish_reason?: string }[]) {
  const sent: any[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      const r = replies[Math.min(i++, replies.length - 1)];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            { message: { content: r.content }, finish_reason: r.finish_reason ?? "stop" },
          ],
        }),
      };
    }) as any,
  );
  return sent;
}

describe("close/continue/result routes", () => {
  it("close scores the transcript, persists it, and blocks further turns", async () => {
    // first fetch = the turn's examiner reply, second = the assessment
    stubOnce(["Pertanyaan penguji?", ASSESSMENT_JSON]);
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });

    const closed = await agent.post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(200);
    expect(closed.body.assessment.final_score).toBe(78);
    expect(closed.body.assessment.grade).toBe("AB"); // Telkom band: 75-85

    const result = await agent.get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("closed");
    expect(result.body.assessment.final_score).toBe(78);

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "lagi" });
    expect(turn.status).toBe(409);
  });

  it("close is idempotent — a second close returns the stored assessment without a new LLM call", async () => {
    const fetchFn = stubOnce([ASSESSMENT_JSON]);
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    // seed a turn directly is unnecessary; close works on an empty transcript too
    await agent.post(`/sessions/${id}/close`).send({});
    const callsAfterFirst = fetchFn.mock.calls.length;
    const again = await agent.post(`/sessions/${id}/close`).send({});
    expect(again.status).toBe(200);
    expect(again.body.assessment.final_score).toBe(78);
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst); // no extra LLM call
  });

  it("close 500s and stays active when the model never returns valid JSON", async () => {
    stubOnce(["bukan json", "masih bukan json"]); // both attempts fail
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    const closed = await agent.post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(500);
    const result = await agent.get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("active");
    expect(result.body.assessment).toBeNull();
  });

  it("asks for enough output tokens to cover a reasoning model's thinking", async () => {
    const sent = stubWithFinish([{ content: ASSESSMENT_JSON }]);
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const closed = await agent.post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(200);
    expect(sent[0].max_tokens).toBe(ASSESSMENT_MAX_TOKENS);
    // Reasoning tokens are billed inside the completion budget; 1536 starved it.
    expect(ASSESSMENT_MAX_TOKENS).toBeGreaterThanOrEqual(8000);
  });

  it("reports a truncated answer instead of paying for the same failing call twice", async () => {
    // Reasoning model burned the whole budget: no text, cut off at the ceiling.
    const sent = stubWithFinish([{ content: "", finish_reason: "length" }]);
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const closed = await agent.post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(500);
    expect(closed.body.error).toMatch(/token/i);
    expect(sent).toHaveLength(1); // a retry would fail identically and bill again
  });

  it("continue records the decline and returns ok", async () => {
    const agent = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    const cont = await agent.post(`/sessions/${id}/continue`).send({});
    expect(cont.status).toBe(200);
    expect(cont.body).toEqual({ ok: true });
  });
});

describe("close route — dossier instead of the full thesis", () => {
  it("sends the dossier and retrieved excerpts, never the full text", async () => {
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        sent.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: ASSESSMENT_JSON } }] }),
        };
      }) as any,
    );
    const { agent, db, documentId } = await readyWithDb();
    replaceChunks(db, documentId, [
      { idx: 0, page: 62, heading: "BAB IV HASIL", text: "Skor SUS 78 dari 20 responden mahasiswa." },
      { idx: 1, page: 9, heading: "BAB I", text: "Bagian yang tidak dibahas sama sekali di sidang." },
    ]);
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/close`).send({});

    const user = sent[0].messages.find((m: any) => m.role === "user").content;
    // Naskah utuh 147k token adalah yang justru sedang dihapus.
    expect(user).not.toContain("NASKAH LENGKAP YANG TIDAK BOLEH DIKIRIM");
    expect(user).toContain(SAMPLE_DOSSIER.judul);
    expect(user).toContain("TRANSKRIP SIDANG:");
  });

  it("picks excerpts by what the sidang actually discussed", async () => {
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        sent.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: ASSESSMENT_JSON } }] }),
        };
      }) as any,
    );
    const { agent, db, documentId } = await readyWithDb();
    replaceChunks(db, documentId, [
      { idx: 0, page: 62, heading: "BAB IV", text: "Pengujian SUS melibatkan 20 responden mahasiswa." },
      { idx: 1, page: 9, heading: "BAB I", text: "Kajian tentang fotosintesis tumbuhan tropis." },
    ]);
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "Skor SUS saya 78 dari 20 responden." });
    await agent.post(`/sessions/${id}/close`).send({});

    const user = sent[sent.length - 1].messages.find((m: any) => m.role === "user").content;
    expect(user).toContain("KUTIPAN NASKAH TERKAIT:");
    expect(user).toContain("responden mahasiswa");
    expect(user).not.toContain("fotosintesis");
  });

  it("refuses to score while the dossier is not ready", async () => {
    const { agent, db, documentId } = await readyWithDb();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    setDossierPending(db, documentId);
    const res = await agent.post(`/sessions/${id}/close`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Dossier skripsi belum siap/);
  });
});
