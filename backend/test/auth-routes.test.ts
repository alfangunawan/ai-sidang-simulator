import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { openDb } from "../src/db.js";
import { authRouter, requireAuth } from "../src/routes/auth.js";

function app() {
  const db = openDb(":memory:");
  const a = express();
  a.use(express.json());
  a.use("/auth", authRouter(db));
  a.get("/whoami", requireAuth(db), (req, res) => res.json({ userId: req.userId }));
  return a;
}

describe("auth routes", () => {
  it("register → me → protected route, and logout clears access", async () => {
    const a = app();
    const agent = request.agent(a);

    const reg = await agent.post("/auth/register").send({ username: "alfan", password: "password1" });
    expect(reg.status).toBe(200);
    expect(reg.body.user.username).toBe("alfan");

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("alfan");

    const who = await agent.get("/whoami");
    expect(who.status).toBe(200);
    expect(who.body.userId).toBe(reg.body.user.id);

    await agent.post("/auth/logout").expect(200);
    await agent.get("/auth/me").expect(401);
    await agent.get("/whoami").expect(401);
  });

  it("rejects duplicate username, weak input, and bad credentials", async () => {
    const a = app();
    await request(a).post("/auth/register").send({ username: "u", password: "password1" }).expect(400); // short username
    await request(a).post("/auth/register").send({ username: "user", password: "short" }).expect(400);   // short password
    await request(a).post("/auth/register").send({ username: "dup", password: "password1" }).expect(200);
    await request(a).post("/auth/register").send({ username: "dup", password: "password1" }).expect(409);
    await request(a).post("/auth/login").send({ username: "dup", password: "wrongpass" }).expect(401);
    await request(a).post("/auth/login").send({ username: "ghost", password: "password1" }).expect(401);
  });
});
