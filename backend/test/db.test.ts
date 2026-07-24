import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";

describe("db migrations", () => {
  it("creates all four tables", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of ["sessions", "turns", "settings", "documents"]) {
      expect(names).toContain(t);
    }
  });

  it("cascades turn deletion when a session is deleted", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
      "s1",
      "2026-01-01T00:00:00Z",
      "test",
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s1", 1, "user", "hi", "2026-01-01T00:00:00Z");
    db.prepare("DELETE FROM sessions WHERE id = ?").run("s1");
    const remaining = db
      .prepare("SELECT COUNT(*) AS c FROM turns WHERE session_id = ?")
      .get("s1") as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("is idempotent (re-running openDb does not throw)", () => {
    const db = openDb(":memory:");
    expect(() => openDb(":memory:")).not.toThrow();
    expect(db).toBeDefined();
  });
});
