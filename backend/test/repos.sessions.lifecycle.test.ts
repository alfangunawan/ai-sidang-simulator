import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createSession,
  addTurn,
  countExaminerTurns,
  getSessionMeta,
  setCloseDeclined,
  closeWithAssessment,
  listSessions,
} from "../src/repos/sessions.js";

function seed() {
  const db = openDb(":memory:");
  createSession(db, "s1", "2026-01-01T00:00:00Z", null);
  return db;
}

describe("sessions lifecycle repo", () => {
  it("counts only examiner turns", () => {
    const db = seed();
    addTurn(db, "s1", 1, "user", "a", "t");
    addTurn(db, "s1", 2, "examiner", "q1", "t");
    addTurn(db, "s1", 3, "user", "b", "t");
    addTurn(db, "s1", 4, "examiner", "q2", "t");
    expect(countExaminerTurns(db, "s1")).toBe(2);
  });

  it("defaults to active meta then records a decline", () => {
    const db = seed();
    expect(getSessionMeta(db, "s1")).toMatchObject({
      status: "active",
      closed_at: null,
      assessment: null,
      close_declined_turn: null,
    });
    setCloseDeclined(db, "s1", 11);
    expect(getSessionMeta(db, "s1")?.close_declined_turn).toBe(11);
  });

  it("closeWithAssessment flips status and stores JSON", () => {
    const db = seed();
    closeWithAssessment(db, "s1", "2026-01-02T00:00:00Z", '{"final_score":80}');
    const meta = getSessionMeta(db, "s1");
    expect(meta?.status).toBe("closed");
    expect(meta?.closed_at).toBe("2026-01-02T00:00:00Z");
    expect(meta?.assessment).toBe('{"final_score":80}');
  });

  it("listSessions exposes status and final_score", () => {
    const db = seed();
    addTurn(db, "s1", 1, "user", "a", "t");
    addTurn(db, "s1", 2, "examiner", "q", "t");
    closeWithAssessment(db, "s1", "2026-01-02T00:00:00Z", '{"final_score":82}');
    const rows = listSessions(db);
    expect(rows[0].status).toBe("closed");
    expect(rows[0].final_score).toBe(82);
  });
});
