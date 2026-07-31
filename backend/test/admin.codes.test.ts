import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";

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

describe("GET /admin/codes", () => {
  it("lists every collaboration with its members and the spend on that key", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);
    db.prepare(
      `INSERT INTO usage_events
         (user_id, key_owner_user_id, created_at, provider, model, kind,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, 'x', 'y', 'turn', 10, 5, 0, 0, 0.75)`,
    ).run(budi.id, admin.id, "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/codes").expect(200);
    expect(body.codes).toHaveLength(1);
    expect(body.codes[0]).toMatchObject({ host_username: "alfan", invite_code: code });
    expect(body.codes[0].members.map((m: any) => m.username)).toEqual(["budi"]);
    expect(body.codes[0].cost_usd).toBeCloseTo(0.75);
  });

  it("kicks a member", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);

    await admin.agent.delete(`/admin/codes/${admin.id}/members/${budi.id}`).expect(200);
    const { body } = await admin.agent.get("/admin/codes").expect(200);
    expect(body.codes[0].members).toHaveLength(0);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/codes").expect(403);
  });
});
