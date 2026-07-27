import { describe, it, expect } from "vitest";
import request from "supertest";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { randomBytes } from "node:crypto";

function ctx() {
  return buildApp(openDb(":memory:"), randomBytes(32));
}

describe("cross-user isolation", () => {
  it("blocks unauthenticated access and hides other users' sessions", async () => {
    const app = ctx();
    await request(app).get("/sessions").expect(401); // no cookie

    const u1 = request.agent(app);
    await u1.post("/auth/register").send({ username: "user1", password: "password1" }).expect(200);
    const created = await u1.post("/sessions").send({}).expect(200);
    const sid = created.body.session_id;
    expect((await u1.get("/sessions")).status).toBe(200);

    const u2 = request.agent(app);
    await u2.post("/auth/register").send({ username: "user2", password: "password1" }).expect(200);
    await u2.get(`/sessions/${sid}/turns`).expect(404); // ownership miss
    await u2.get(`/sessions/${sid}/result`).expect(404); // ownership miss
  });
});
