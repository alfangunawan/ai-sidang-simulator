import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createSession,
  addTurn,
  listSessions,
} from "../src/repos/sessions.js";

function db() {
  return openDb(":memory:");
}

describe("listSessions", () => {
  it("returns only sessions with at least one turn, newest first, with turn counts", () => {
    const d = db();
    createSession(d, "old", "2026-07-24T09:00:00Z", null);
    createSession(d, "new", "2026-07-25T14:30:00Z", null);
    createSession(d, "empty", "2026-07-25T15:00:00Z", null);

    addTurn(d, "old", 1, "user", "halo", "2026-07-24T09:00:01Z");
    addTurn(d, "new", 1, "user", "hai", "2026-07-25T14:30:01Z");
    addTurn(d, "new", 2, "examiner", "pertanyaan?", "2026-07-25T14:30:02Z");

    const sessions = listSessions(d);

    expect(sessions).toEqual([
      { id: "new", created_at: "2026-07-25T14:30:00Z", label: null, turn_count: 2 },
      { id: "old", created_at: "2026-07-24T09:00:00Z", label: null, turn_count: 1 },
    ]);
  });

  it("returns an empty array when no session has turns", () => {
    const d = db();
    createSession(d, "s1", "2026-07-25T00:00:00Z", null);
    expect(listSessions(d)).toEqual([]);
  });
});
