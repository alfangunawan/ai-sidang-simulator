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

describe("GET /admin/sessions", () => {
  it("lists sessions from every user, including ones with no turns yet", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    // Sesi kosong sengaja ikut tampil: sesi yang mandek justru yang perlu dilihat.
    await budi.agent.post("/sessions").send({}).expect(200);
    db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
      "s-full", budi.id, "2026-07-30T00:00:00.000Z", "Sidang 1",
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s-full", 1, "examiner", "Silakan jelaskan.", "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/sessions").expect(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions.every((s: any) => s.username === "budi")).toBe(true);

    const sFull = body.sessions.find((s: any) => s.id === "s-full");
    expect(sFull).toBeDefined();
    expect(sFull.turn_count).toBe(1);

    const emptySession = body.sessions.find((s: any) => s.turn_count === 0);
    expect(emptySession).toBeDefined();

    const filtered = await admin.agent.get(`/admin/sessions?user_id=${admin.id}`).expect(200);
    expect(filtered.body.sessions).toHaveLength(0);
  });

  it("rejects invalid user_id parameters with 400", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await budi.agent.post("/sessions").send({}).expect(200);

    // Non-numeric user_id
    await admin.agent.get("/admin/sessions?user_id=abc").expect(400);

    // Empty user_id
    await admin.agent.get("/admin/sessions?user_id=").expect(400);

    // Multiple user_id parameters (Express parses as array)
    await admin.agent.get("/admin/sessions?user_id=1&user_id=2").expect(400);

    // Verify that the unfiltered list was not returned
    const allSessions = await admin.agent.get("/admin/sessions").expect(200);
    expect(allSessions.body.sessions).toHaveLength(1);
  });
});

describe("GET /admin/sessions/:id", () => {
  it("returns the transcript of a session belonging to someone else", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
      "s-x", budi.id, "2026-07-30T00:00:00.000Z", null,
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s-x", 1, "examiner", "Apa rumusan masalahnya?", "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/sessions/s-x").expect(200);
    expect(body.session.username).toBe("budi");
    expect(body.turns[0]).toMatchObject({ role: "examiner", content: "Apa rumusan masalahnya?" });
  });

  it("404s on an unknown session and 403s for a plain user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await admin.agent.get("/admin/sessions/nope").expect(404);
    await budi.agent.get("/admin/sessions").expect(403);
  });
});
