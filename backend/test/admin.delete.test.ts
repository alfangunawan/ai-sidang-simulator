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
function seed(db: any, userId: number, tag: string) {
  db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
    `s-${tag}`, userId, "2026-07-30T00:00:00.000Z", null,
  );
  db.prepare(
    "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
  ).run(`s-${tag}`, 1, "examiner", "halo", "2026-07-30T00:00:00.000Z");
  const doc = db
    .prepare(
      "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
    )
    .run(userId, `${tag}.pdf`, "isi", 3, "2026-07-30T00:00:00.000Z");
  db.prepare("INSERT INTO chunks (document_id, idx, text) VALUES (?,?,?)").run(
    doc.lastInsertRowid, 0, "isi",
  );
  db.prepare(
    `INSERT INTO usage_events
       (user_id, key_owner_user_id, created_at, provider, model, kind,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?, ?, ?, 'x', 'y', 'turn', 1, 1, 0, 0, 0.5)`,
  ).run(userId, userId, "2026-07-30T00:00:00.000Z");
}
const rows = (db: any, sql: string, ...p: any[]) =>
  (db.prepare(sql).get(...p) as { c: number }).c;

describe("DELETE /admin/users/:id", () => {
  // sessions/documents/usage_events memakai user_id yang ditambahkan lewat
  // ALTER TABLE, jadi TIDAK punya foreign key cascade. Tanpa hapus manual,
  // transkrip dan naskah orang menggantung di DB selamanya.
  it("removes every row the user owns, across all six tables", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    seed(db, budi.id, "budi");

    await admin.agent.delete(`/admin/users/${budi.id}`).expect(200);

    expect(rows(db, "SELECT COUNT(*) c FROM users WHERE id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM sessions WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM turns WHERE session_id = 's-budi'")).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM documents WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM chunks")).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM usage_events WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM user_settings WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ?", budi.id)).toBe(0);
  });

  it("leaves another user's rows untouched", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    const citra = await reg(app, "citra");
    setAdmin(db, admin.id, 1);
    seed(db, budi.id, "budi");
    seed(db, citra.id, "citra");

    await admin.agent.delete(`/admin/users/${budi.id}`).expect(200);

    expect(rows(db, "SELECT COUNT(*) c FROM sessions WHERE user_id = ?", citra.id)).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM turns WHERE session_id = 's-citra'")).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM documents WHERE user_id = ?", citra.id)).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM chunks")).toBe(1);
  });

  it("refuses self-deletion and 404s on an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.delete(`/admin/users/${admin.id}`).expect(400);
    await admin.agent.delete("/admin/users/9999").expect(404);
    expect(rows(db, "SELECT COUNT(*) c FROM users WHERE id = ?", admin.id)).toBe(1);
  });
});
