import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setSuspended, isSuspended } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}

describe("suspension", () => {
  it("blocks every authenticated route through requireAuth, not just one", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);

    await agent.get("/sessions").expect(200);
    await agent.get("/settings").expect(200);

    setSuspended(db, body.user.id, 1);
    expect(isSuspended(db, body.user.id)).toBe(true);

    // Penjaganya duduk di requireAuth, jadi semua route ikut tanpa diubah.
    await agent.get("/sessions").expect(403);
    await agent.get("/settings").expect(403);
    const me = await agent.get("/auth/me").expect(403);
    expect(me.body.error).toBe("Akun ditangguhkan");
  });

  it("refuses a fresh login so a suspended user cannot mint a new token", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);
    setSuspended(db, body.user.id, 1);

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "budi", password: "password1" })
      .expect(403);
    expect(res.body.error).toBe("Akun ditangguhkan");
  });

  it("is reversible and leaves the user's data intact", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);
    await agent.post("/sessions").send({}).expect(200);

    setSuspended(db, body.user.id, 1);
    await agent.get("/sessions").expect(403);
    setSuspended(db, body.user.id, 0);
    const back = await agent.get("/sessions").expect(200);
    expect(back.body.sessions).toBeDefined();
  });
});
