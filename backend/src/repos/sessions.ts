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
