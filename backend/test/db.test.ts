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

describe("sessions lifecycle columns", () => {
  it("adds status/closed_at/assessment/close_declined_turn with status default 'active'", () => {
    const db = openDb(":memory:");
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(
      expect.arrayContaining(["status", "closed_at", "assessment", "close_declined_turn"]),
    );

    db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
      "s1",
      "2026-01-01T00:00:00Z",
      null,
    );
    const row = db.prepare("SELECT status FROM sessions WHERE id = ?").get("s1") as {
      status: string;
    };
    expect(row.status).toBe("active");
  });
});

describe("schema", () => {
  it("creates auth tables and user_id columns", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["users", "auth_tokens", "user_settings"]));

    function cols(table: string): string[] {
      return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    }

    expect(cols("sessions")).toContain("user_id");
    expect(cols("documents")).toContain("user_id");
    expect(cols("usage_events")).toContain("user_id");
    expect(cols("users")).toEqual(expect.arrayContaining(["id", "username", "password_hash", "created_at"]));
  });
});
