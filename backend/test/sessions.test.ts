import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  createSession, listSessions, sessionExists, getSessionMeta, deleteSession,
  addTurn,
} from "../src/repos/sessions.js";

describe("per-user sessions", () => {
  it("scopes listing and ownership by user", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    createSession(db, u1, "s1", "2026-07-27T00:00:00.000Z", "punya u1");
    addTurn(db, "s1", 1, "user", "halo", "t"); // listSessions JOINs turns

    expect(sessionExists(db, "s1", u1)).toBe(true);
    expect(sessionExists(db, "s1", u2)).toBe(false); // ownership miss
    expect(getSessionMeta(db, "s1", u2)).toBeNull();
    expect(listSessions(db, u1).map((s) => s.id)).toEqual(["s1"]);
    expect(listSessions(db, u2)).toEqual([]);

    deleteSession(db, "s1", u2); // wrong owner → no-op
    expect(sessionExists(db, "s1", u1)).toBe(true);
    deleteSession(db, "s1", u1);
    expect(sessionExists(db, "s1", u1)).toBe(false);
  });
});
