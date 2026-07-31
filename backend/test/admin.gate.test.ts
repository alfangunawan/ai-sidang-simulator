import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin, isAdmin, countAdmins, getUserByUsername } from "../src/repos/users.js";

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

describe("admin flag", () => {
  it("defaults to 0 and flips with setAdmin", () => {
    const { db, app } = ctx();
    return reg(app, "alfan").then(({ id }) => {
      expect(isAdmin(db, id)).toBe(false);
      expect(countAdmins(db)).toBe(0);
      setAdmin(db, id, 1);
      expect(isAdmin(db, id)).toBe(true);
      expect(countAdmins(db)).toBe(1);
    });
  });

  // Ikatannya ke user_id, bukan username: ganti username tidak boleh
  // mencabut atau memindahkan hak admin.
  it("survives a username change", () => {
    const { db, app } = ctx();
    return reg(app, "alfan").then(({ id }) => {
      setAdmin(db, id, 1);
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run("alfan2", id);
      expect(isAdmin(db, id)).toBe(true);
      expect(getUserByUsername(db, "alfan")).toBeNull();
    });
  });
});

describe("/auth/me exposes is_admin", () => {
  it("reports false for a plain user and true for an admin", async () => {
    const { db, app } = ctx();
    const u = await reg(app, "alfan");
    let me = await u.agent.get("/auth/me").expect(200);
    expect(me.body.user.is_admin).toBe(false);

    setAdmin(db, u.id, 1);
    me = await u.agent.get("/auth/me").expect(200);
    expect(me.body.user).toMatchObject({ id: u.id, username: "alfan", is_admin: true });
  });
});
