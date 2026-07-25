import type Database from "better-sqlite3";
import type { Turn } from "../providers/types.js";

export function createSession(
  db: Database.Database,
  id: string,
  createdAt: string,
  label: string | null,
): void {
  db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
    id,
    createdAt,
    label,
  );
}

export interface SessionSummary {
  id: string;
  created_at: string;
  label: string | null;
  turn_count: number;
  status: string;
  final_score: number | null;
}

// Sessions that have at least one turn, newest first, with their turn count.
// The inner JOIN excludes empty (auto-created) sessions.
export function listSessions(db: Database.Database): SessionSummary[] {
  return db
    .prepare(
      `SELECT s.id, s.created_at, s.label, s.status,
              json_extract(s.assessment, '$.final_score') AS final_score,
              COUNT(t.id) AS turn_count
       FROM sessions s
       JOIN turns t ON t.session_id = s.id
       GROUP BY s.id, s.created_at, s.label, s.status
       ORDER BY s.created_at DESC`,
    )
    .all() as SessionSummary[];
}

export function sessionExists(db: Database.Database, sessionId: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId) !== undefined
  );
}

export function getTurns(db: Database.Database, sessionId: string): Turn[] {
  return db
    .prepare(
      "SELECT role, content FROM turns WHERE session_id = ? ORDER BY turn_number ASC",
    )
    .all(sessionId) as Turn[];
}

export function nextTurnNumber(db: Database.Database, sessionId: string): number {
  const row = db
    .prepare("SELECT MAX(turn_number) AS m FROM turns WHERE session_id = ?")
    .get(sessionId) as { m: number | null };
  return (row.m ?? 0) + 1;
}

export function addTurn(
  db: Database.Database,
  sessionId: string,
  turnNumber: number,
  role: "examiner" | "user",
  content: string,
  createdAt: string,
): void {
  db.prepare(
    "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
  ).run(sessionId, turnNumber, role, content, createdAt);
}

export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteTurn(
  db: Database.Database,
  sessionId: string,
  turnNumber: number,
): void {
  db.prepare("DELETE FROM turns WHERE session_id = ? AND turn_number = ?").run(
    sessionId,
    turnNumber,
  );
}

export function countExaminerTurns(db: Database.Database, sessionId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM turns WHERE session_id = ? AND role = 'examiner'")
    .get(sessionId) as { c: number };
  return row.c;
}

export interface SessionMeta {
  status: string;
  closed_at: string | null;
  assessment: string | null;
  close_declined_turn: number | null;
}

export function getSessionMeta(db: Database.Database, sessionId: string): SessionMeta | null {
  const row = db
    .prepare(
      "SELECT status, closed_at, assessment, close_declined_turn FROM sessions WHERE id = ?",
    )
    .get(sessionId) as SessionMeta | undefined;
  return row ?? null;
}

export function setCloseDeclined(
  db: Database.Database,
  sessionId: string,
  examinerTurn: number,
): void {
  db.prepare("UPDATE sessions SET close_declined_turn = ? WHERE id = ?").run(
    examinerTurn,
    sessionId,
  );
}

export function closeWithAssessment(
  db: Database.Database,
  sessionId: string,
  closedAt: string,
  assessmentJson: string,
): void {
  db.prepare(
    "UPDATE sessions SET status = 'closed', closed_at = ?, assessment = ? WHERE id = ?",
  ).run(closedAt, assessmentJson, sessionId);
}
