import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { getOverview } from "../src/repos/admin.js";

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

describe("GET /admin/overview", () => {
  it("is 403 for a plain user and 401 without a cookie", async () => {
    const { app } = ctx();
    await request(app).get("/admin/overview").expect(401);
    const u = await reg(app, "biasa");
    await u.agent.get("/admin/overview").expect(403);
  });

  it("counts users, sessions and spend across everyone", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const other = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await other.agent.post("/sessions").send({}).expect(200);
    db.prepare(
      `INSERT INTO usage_events
         (user_id, key_owner_user_id, created_at, provider, model, kind,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, 'openai_compat', 'x', 'turn', 100, 40, 0, 0, 0.25)`,
    ).run(other.id, admin.id, "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/overview").expect(200);
    expect(body.users).toBe(2);
    expect(body.sessions).toBe(1);
    expect(body.cost_usd).toBeCloseTo(0.25);
    expect(body.tokens).toBe(140);
    expect(body.top_spenders[0]).toMatchObject({ username: "budi", cost_usd: 0.25 });
  });
});

describe("getOverview signups", () => {
  it("returns exactly 14 days, oldest first, with gaps zero-filled", () => {
    const { db } = ctx();
    const at = (d: string) =>
      db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)")
        .run(`u${d}`, "x:y", d);
    at("2026-07-31T09:00:00.000Z");
    at("2026-07-31T10:00:00.000Z");
    at("2026-07-25T10:00:00.000Z");
    at("2026-06-01T10:00:00.000Z"); // di luar jendela

    const days = getOverview(db, "2026-07-31T23:00:00.000Z").signups;
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe("2026-07-18");
    expect(days.at(-1)).toEqual({ day: "2026-07-31", count: 2 });
    expect(days.find((d) => d.day === "2026-07-25")!.count).toBe(1);
    expect(days.find((d) => d.day === "2026-07-26")!.count).toBe(0);
  });
});
