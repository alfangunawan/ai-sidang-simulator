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

describe("GET /admin/users", () => {
  it("lists everyone with counts, spend, and who lends them a key", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);
    await budi.agent.post("/sessions").send({}).expect(200);

    const { body } = await admin.agent.get("/admin/users").expect(200);
    const row = body.users.find((u: any) => u.username === "budi");
    expect(row).toMatchObject({
      sessions: 1,
      suspended: false,
      is_admin: false,
      key_owner: "alfan",
    });
    expect(body.users.find((u: any) => u.username === "alfan")).toMatchObject({
      is_admin: true,
      key_owner: null,
    });
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const u = await reg(app, "budi");
    await u.agent.get("/admin/users").expect(403);
  });
});

describe("GET /admin/users/:id", () => {
  // Panel admin yang bisa membaca API key orang lain adalah pintu pencurian
  // kredensial demi kenyamanan satu orang. Yang boleh keluar hanya boolean.
  it("reports key presence but never key material", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await budi.agent
      .put("/settings")
      .send({ provider: "claude", api_key: "sk-ant-SECRETVALUE" })
      .expect(200);

    const { body, text } = await admin.agent.get(`/admin/users/${budi.id}`).expect(200);
    expect(body.settings.has_api_key).toBe(true);
    expect(body.settings).not.toHaveProperty("api_key");
    expect(text).not.toContain("SECRETVALUE");
  });

  it("404s for an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.get("/admin/users/9999").expect(404);
  });
});
