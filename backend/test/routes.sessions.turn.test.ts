import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";
import { closeWithAssessment } from "../src/repos/sessions.js";
import { CLOSE_MARKER, NON_ANSWER_NUDGE } from "../src/sidang.js";
import { getTurns } from "../src/repos/sessions.js";

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
  saveSettings(db, userId, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, userId, "thesis.pdf", "ISI SKRIPSI", "2026-01-01T00:00:00Z");
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

describe("turn route — marker + close guard", () => {
  it("strips the close marker from the reply and does not propose below the floor", async () => {
    stubReply(`Baik.\n${CLOSE_MARKER}`);
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });
    expect(turn.status).toBe(200);
    expect(turn.body.reply).toBe("Baik.");
    expect(turn.body.propose_close).toBe(false); // only 1 examiner turn < floor
  });

  it("nudges the model when the student prods instead of answering, but stores the raw text", async () => {
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        const msgs = JSON.parse(init.body).messages;
        sent.push(msgs[msgs.length - 1].content);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "Pertanyaan?" } }] }),
        };
      }) as any,
    );
    const { agent, db } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    await agent.post(`/sessions/${id}/turn`).send({ transcript: "Lalu" });
    expect(sent[0]).toContain(NON_ANSWER_NUDGE);
    expect(getTurns(db, id)[0]).toEqual({ role: "user", content: "Lalu" });

    await agent
      .post(`/sessions/${id}/turn`)
      .send({ transcript: "Skor SUS saya 78 dari 20 responden." });
    expect(sent[1]).toBe("Skor SUS saya 78 dari 20 responden.");
  });

  it("rejects an empty reply and rolls back the student turn", async () => {
    stubReply("   "); // reasoning model burned its budget before writing text
    const { agent, db } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });
    expect(turn.status).toBe(500);
    expect(turn.body.error).toMatch(/tidak memberi jawaban/);
    expect(getTurns(db, id)).toEqual([]); // no empty bubble, no orphan user turn
  });

  it("409s a turn on a closed session", async () => {
    stubReply("Pertanyaan?");
    const { agent, db } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "hi" });
    closeWithAssessment(db, id, "2026-01-02T00:00:00Z", '{"final_score":80}');

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "lagi" });
    expect(turn.status).toBe(409);
  });
});
