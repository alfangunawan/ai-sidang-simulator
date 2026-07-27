import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";

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
