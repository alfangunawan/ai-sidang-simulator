import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument, setDossierPending } from "../src/repos/documents.js";
import { replaceChunks } from "../src/repos/chunks.js";
import { seedDossier } from "./fixtures/dossier.js";
import { CRITIQUE_MODULES, QUESTION_BANK } from "../src/questionBank.js";
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
  const documentId = replaceDocument(db, userId, "thesis.pdf", "ISI SKRIPSI", "2026-01-01T00:00:00Z");
  seedDossier(db, documentId);
  return { agent, db, documentId };
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
    expect(sent[1]).toContain("Skor SUS saya 78 dari 20 responden.");
    expect(sent[1]).not.toContain(NON_ANSWER_NUDGE);
    expect(getTurns(db, id)[2]).toEqual({
      role: "user",
      content: "Skor SUS saya 78 dari 20 responden.",
    });
  });

  // Tanpa ini model tidak tahu ada gerbang tutup: ia merangkum kapan pun merasa
  // cukup, server hanya membuang penandanya, dan penutup itu terkunci di
  // riwayat. Terlihat di 4 dari 13 sidang uji.
  it("tells the model how far it still is from the close floor, outside the transcript", async () => {
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

    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban pertama" });
    expect(sent[0]).toContain("BELUM boleh ditutup");
    expect(getTurns(db, id)[0].content).toBe("jawaban pertama");
  });

  // Rangkuman dini bukan cuma giliran terbuang: jatah rangkumannya habis di
  // situ, dan giliran penutup yang sebenarnya menyusut jadi "Saya catat."
  it("discards an early closing reply and asks again for a question", async () => {
    const sent: string[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        const msgs = JSON.parse(init.body).messages;
        sent.push(msgs[msgs.length - 1].content);
        call += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content:
                    call === 1
                      ? `Saya rangkum kelemahan utama Anda: metodologi tipis.\n${CLOSE_MARKER}`
                      : "Berapa iterasi prototyping yang Anda lakukan?",
                },
              },
            ],
          }),
        };
      }) as any,
    );
    const { agent, db } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban" });

    expect(call).toBe(2);
    expect(sent[1]).toContain("DIBUANG");
    expect(turn.body.reply).toBe("Berapa iterasi prototyping yang Anda lakukan?");
    expect(turn.body.propose_close).toBe(false);
    // Penutup dini tidak boleh tersimpan di transkrip.
    expect(getTurns(db, id).map((t) => t.content)).toEqual([
      "jawaban",
      "Berapa iterasi prototyping yang Anda lakukan?",
    ]);
  });

  it("keeps a closing reply once the floor is reached", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: `Saya rangkum kelemahan utama.\n${CLOSE_MARKER}` } }],
          }),
        };
      }) as any,
    );
    const { agent } = await ready();
    // Satu fase inti -> ambang 5 pertanyaan, jadi giliran ke-5 boleh menutup.
    const id = (await agent.post("/sessions").send({ phases: ["Metodologi"] })).body.session_id;

    for (let i = 0; i < 4; i++) {
      await agent.post(`/sessions/${id}/turn`).send({ transcript: `jawaban ${i}` });
    }
    const before = call;
    const last = await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban akhir" });

    expect(last.body.propose_close).toBe(true);
    expect(call - before).toBe(1); // gerbang sudah buka: penutup diterima apa adanya
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

  // Risiko §12 PRD: kutipan yang bocor ke system block mematikan cache setiap
  // giliran dan mengembalikan biaya yang justru sedang dihapus.
  it("puts retrieved excerpts in the user message, never in the system block", async () => {
    const captured: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        captured.push(JSON.parse(init.body).messages);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "Pertanyaan?" } }] }),
        };
      }) as any,
    );
    const { agent, db, documentId } = await ready();
    replaceChunks(db, documentId, [
      { idx: 0, page: 62, heading: "BAB IV HASIL", text: "Pengujian SUS melibatkan 113 responden mahasiswa." },
      { idx: 1, page: 12, heading: "BAB I", text: "Latar belakang membahas prevalensi kecemasan." },
    ]);
    const id = (await agent.post("/sessions").send({})).body.session_id;

    await agent.post(`/sessions/${id}/turn`).send({ transcript: "Pengujian saya pakai SUS." });

    const msgs = captured[0];
    const system = msgs.find((m: any) => m.role === "system").content;
    const lastUser = msgs[msgs.length - 1].content;
    expect(lastUser).toContain("BAB IV HASIL, hlm. 62");
    expect(lastUser).toContain("bukan ucapan mahasiswa");
    expect(system).not.toContain("bukan ucapan mahasiswa");
    expect(system).not.toContain("113 responden mahasiswa");
  });

  it("refuses a turn while the dossier is not ready", async () => {
    stubReply("Pertanyaan?");
    const { agent, db, documentId } = await ready();
    setDossierPending(db, documentId);
    const id = (await agent.post("/sessions").send({})).body.session_id;

    const turn = await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });
    expect(turn.status).toBe(400);
    expect(turn.body.error).toMatch(/masih dianalisis/);
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

describe("turn route — phase block", () => {
  function captureBody(sent: any[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        sent.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "Pertanyaan?" } }] }),
        };
      }) as any,
    );
  }

  it("sends only the critique modules this skripsi triggered", async () => {
    const sent: any[] = [];
    captureBody(sent);
    const { agent, db, documentId } = await ready();
    seedDossier(db, documentId, { modul_kritik_terpicu: ["kuesioner"] });
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });

    const system = sent[0].messages.find((m: any) => m.role === "system").content;
    expect(system).toContain(CRITIQUE_MODULES.kuesioner);
    // Penguji skripsi non-sensitif tidak boleh dibekali prompt etika klinis.
    expect(system).not.toContain(CRITIQUE_MODULES.domain_sensitif);
    expect(system).not.toContain(CRITIQUE_MODULES.ai);
  });

  // Urutan menentukan apakah cache kena: blok fase berubah beberapa kali per
  // sesi, jadi ia harus berada SESUDAH persona+dossier yang stabil.
  it("places the phase block after the persona and dossier", async () => {
    const sent: any[] = [];
    captureBody(sent);
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawab" });

    const system = sent[0].messages.find((m: any) => m.role === "system").content;
    expect(system.indexOf("DOSSIER SKRIPSI")).toBeLessThan(system.indexOf("BANK PERTANYAAN"));
    expect(system.indexOf("AGENDA SIDANG")).toBeLessThan(system.indexOf("BANK PERTANYAAN"));
  });

  it("moves the question bank forward as the sidang progresses", async () => {
    const sent: any[] = [];
    captureBody(sent);
    const { agent } = await ready();
    const id = (await agent.post("/sessions").send({})).body.session_id;
    for (let i = 0; i < 9; i++) {
      await agent.post(`/sessions/${id}/turn`).send({ transcript: `jawaban ke-${i}` });
    }
    const first = sent[0].messages.find((m: any) => m.role === "system").content;
    const later = sent[8].messages.find((m: any) => m.role === "system").content;
    expect(first).toContain(QUESTION_BANK["Pembukaan"][0]);
    expect(later).not.toContain(QUESTION_BANK["Pembukaan"][0]);
    expect(later).toContain(QUESTION_BANK["Hasil & Pembahasan"][0]);
  });
});
