import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { replaceDocument } from "../src/repos/documents.js";
import { seedDossier, SAMPLE_DOSSIER } from "./fixtures/dossier.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePdf = readFileSync(join(here, "fixtures/sample.pdf"));

async function app() {
  const a = buildApp(openDb(":memory:"), randomBytes(32));
  const agent = request.agent(a);
  await agent.post("/auth/register").send({ username: "tester", password: "password1" });
  return agent;
}

describe("skripsi routes", () => {
  it("GET returns null when no document uploaded", async () => {
    const agent = await app();
    const res = await agent.get("/skripsi");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("POST extracts text, stores it, and returns metadata", async () => {
    const a = await app();
    const res = await a
      .post("/skripsi")
      .attach("file", samplePdf, "thesis.pdf");
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("thesis.pdf");
    expect(res.body.char_count).toBeGreaterThan(0);
    expect(typeof res.body.uploaded_at).toBe("string");

    const get = await a.get("/skripsi");
    expect(get.body.filename).toBe("thesis.pdf");
  });

  it("400s when no file is attached", async () => {
    const agent = await app();
    const res = await agent.post("/skripsi");
    expect(res.status).toBe(400);
  });

  it("re-upload replaces the previous document (<=1 row)", async () => {
    const a = await app();
    await a.post("/skripsi").attach("file", samplePdf, "first.pdf");
    await a.post("/skripsi").attach("file", samplePdf, "second.pdf");
    const get = await a.get("/skripsi");
    expect(get.body.filename).toBe("second.pdf");
  });

  it("DELETE removes the active document", async () => {
    const a = await app();
    await a.post("/skripsi").attach("file", samplePdf, "x.pdf");
    await a.delete("/skripsi");
    const get = await a.get("/skripsi");
    expect(get.body).toBeNull();
  });
});

describe("dossier endpoints", () => {
  async function withDoc() {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const app = buildApp(db, key);
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "tester", password: "password1" });
    const documentId = replaceDocument(
      db,
      body.user.id,
      "thesis.pdf",
      "ISI",
      "2026-01-01T00:00:00Z",
    );
    return { agent, db, documentId };
  }

  it("returns null before any document is uploaded", async () => {
    const db = openDb(":memory:");
    const agent = request.agent(buildApp(db, randomBytes(32)));
    await agent.post("/auth/register").send({ username: "tester", password: "password1" });
    expect((await agent.get("/skripsi/dossier")).body).toBeNull();
  });

  it("serves the stored dossier with its status and model", async () => {
    const { agent, db, documentId } = await withDoc();
    seedDossier(db, documentId);
    const res = await agent.get("/skripsi/dossier");
    expect(res.body.status).toBe("ready");
    expect(res.body.model).toBe("test/model");
    expect(res.body.dossier.judul).toBe(SAMPLE_DOSSIER.judul);
  });

  it("accepts an edited dossier and serves it back", async () => {
    const { agent, db, documentId } = await withDoc();
    seedDossier(db, documentId);
    const edited = { ...SAMPLE_DOSSIER, poin_serangan: ["poin baru"] };
    expect((await agent.put("/skripsi/dossier").send(edited)).status).toBe(200);
    expect((await agent.get("/skripsi/dossier")).body.dossier.poin_serangan).toEqual(["poin baru"]);
  });

  // Suntingan manual lewat jalur validasi yang sama dengan keluaran model —
  // dossier hasil edit tidak boleh bisa melanggar bentuk yang ditolak dari model.
  it("rejects an edit that strips judul or rumusan_masalah", async () => {
    const { agent, db, documentId } = await withDoc();
    seedDossier(db, documentId);
    const res = await agent.put("/skripsi/dossier").send({ ...SAMPLE_DOSSIER, judul: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/judul dan minimal satu rumusan masalah/);
    // Yang tersimpan tetap versi lama, bukan yang cacat.
    expect((await agent.get("/skripsi/dossier")).body.dossier.judul).toBe(SAMPLE_DOSSIER.judul);
  });

  it("400s a rebuild when there is no document", async () => {
    const db = openDb(":memory:");
    const agent = request.agent(buildApp(db, randomBytes(32)));
    await agent.post("/auth/register").send({ username: "tester", password: "password1" });
    expect((await agent.post("/skripsi/dossier/rebuild")).status).toBe(400);
  });
});
