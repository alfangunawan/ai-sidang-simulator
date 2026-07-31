import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin, isAdmin, isSuspended, countAdmins } from "../src/repos/users.js";

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

describe("PATCH /admin/users/:id", () => {
  it("suspends and unsuspends another user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.patch(`/admin/users/${budi.id}`).send({ suspended: true }).expect(200);
    expect(isSuspended(db, budi.id)).toBe(true);
    await admin.agent.patch(`/admin/users/${budi.id}`).send({ suspended: false }).expect(200);
    expect(isSuspended(db, budi.id)).toBe(false);
  });

  it("promotes a second admin", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.patch(`/admin/users/${budi.id}`).send({ is_admin: true }).expect(200);
    expect(isAdmin(db, budi.id)).toBe(true);
    expect(countAdmins(db)).toBe(2);
  });

  // Satu salah klik tidak boleh mengunci founder keluar dari panelnya sendiri.
  it("refuses self-demotion and self-suspension", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const a = await admin.agent.patch(`/admin/users/${admin.id}`).send({ is_admin: false }).expect(400);
    expect(a.body.error).toMatch(/diri sendiri/i);
    await admin.agent.patch(`/admin/users/${admin.id}`).send({ suspended: true }).expect(400);
    expect(isAdmin(db, admin.id)).toBe(true);
    expect(isSuspended(db, admin.id)).toBe(false);
  });

  // Jalur dua-admin menuju kunci-keluar yang sama.
  it("refuses to demote the last admin", async () => {
    const { db, app } = ctx();
    const one = await reg(app, "alfan");
    const two = await reg(app, "budi");
    setAdmin(db, one.id, 1);
    setAdmin(db, two.id, 1);

    // two mencabut one: masih ada dua, jadi boleh.
    await two.agent.patch(`/admin/users/${one.id}`).send({ is_admin: false }).expect(200);
    expect(countAdmins(db)).toBe(1);
    // Sekarang two satu-satunya, dan tidak bisa dicabut lewat jalur mana pun.
    const res = await two.agent.patch(`/admin/users/${two.id}`).send({ is_admin: false }).expect(400);
    expect(res.body.error).toBeTruthy();
    expect(countAdmins(db)).toBe(1);
  });

  it("404s for an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.patch("/admin/users/9999").send({ suspended: true }).expect(404);
  });
});
