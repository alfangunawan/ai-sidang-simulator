import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { SIDANG_PHASES } from "../src/phases.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("/admin/questions", () => {
  it("returns the phases and the seeded bank", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const { body } = await admin.agent.get("/admin/questions").expect(200);
    expect(body.phases).toEqual(SIDANG_PHASES);
    expect(body.bank["Pembukaan"].length).toBeGreaterThan(0);
  });

  it("replaces one phase and reads it back", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    await admin.agent
      .put("/admin/questions")
      .send({ phase: "Pembukaan", texts: ["Satu?", "  ", "Dua?"] })
      .expect(200);

    const { body } = await admin.agent.get("/admin/questions").expect(200);
    expect(body.bank["Pembukaan"]).toEqual(["Satu?", "Dua?"]); // baris kosong dibuang
  });

  it("rejects an unknown phase and a non-array body", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    await admin.agent.put("/admin/questions").send({ phase: "Ngawur", texts: ["x"] }).expect(400);
    await admin.agent.put("/admin/questions").send({ phase: "Pembukaan", texts: "x" }).expect(400);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/questions").expect(403);
  });
});
