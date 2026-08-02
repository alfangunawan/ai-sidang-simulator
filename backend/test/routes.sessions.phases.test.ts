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
    replaceDocument(db, body.user.id, "thesis.pdf", "ISI SKRIPSI", "2026-01-01T00:00:00Z"),
  );
  return { agent, db };
}

/** Semua pesan yang dikirim ke provider pada giliran terakhir, digabung. */
function capture(sent: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: any) => {
      sent.push(
        JSON.parse(init.body)
          .messages.map((m: { content: string }) => m.content)
          .join("\n"),
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Pertanyaan?" } }] }),
      };
    }) as any,
  );
}

describe("sidang scoped to chosen bab", () => {
  it("keeps the examiner inside the chosen bab and lowers the close floor with it", async () => {
    const sent: string[] = [];
    capture(sent);
    const { agent } = await ready();

    const id = (await agent.post("/sessions").send({ phases: ["Metodologi"] })).body
      .session_id;
    expect(id).toBeTruthy();

    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban pertama" });
    expect(sent[0]).toContain("1. Pembukaan\n2. Metodologi\n3. Penutup");
    expect(sent[0]).toContain("DILARANG mengajukan pertanyaan di luar fase itu");
    // Floor 5, bukan 15: satu bab tidak menanggung target sidang penuh.
    expect(sent[0]).toContain("masih perlu minimal 5 pertanyaan lagi");
  });

  it("runs the full agenda when every bab is left on", async () => {
    const sent: string[] = [];
    capture(sent);
    const { agent } = await ready();

    const id = (
      await agent.post("/sessions").send({
        phases: [
          "Latar Belakang & Rumusan Masalah",
          "Tinjauan Pustaka",
          "Metodologi",
          "Hasil & Pembahasan",
          "Kesimpulan & Kontribusi",
        ],
      })
    ).body.session_id;

    await agent.post(`/sessions/${id}/turn`).send({ transcript: "jawaban pertama" });
    expect(sent[0]).toContain("7. Penutup");
    expect(sent[0]).not.toContain("DILARANG mengajukan pertanyaan di luar fase itu");
    expect(sent[0]).toContain("masih perlu minimal 15 pertanyaan lagi");
  });

  it("refuses a phase name it does not know rather than quietly running everything", async () => {
    const { agent } = await ready();
    const res = await agent.post("/sessions").send({ phases: ["Bab VI"] });
    expect(res.status).toBe(400);
  });
});
