import type Database from "better-sqlite3";

export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
  createdAt: string,
): number {
  const info = db
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)")
    .run(username, passwordHash, createdAt);
  return Number(info.lastInsertRowid);
}

export function getUserByUsername(
  db: Database.Database,
  username: string,
): { id: number; username: string; password_hash: string } | null {
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; username: string; password_hash: string } | undefined;
  return row ?? null;
}

export function getUserById(
  db: Database.Database,
  id: number,
): { id: number; username: string; is_admin: boolean } | null {
  const row = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(id) as
    | { id: number; username: string; is_admin: number }
    | undefined;
  return row ? { id: row.id, username: row.username, is_admin: row.is_admin === 1 } : null;
}

export function createToken(
  db: Database.Database,
  token: string,
  userId: number,
  createdAt: string,
  expiresAt: string,
): void {
  db.prepare(
    "INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
  ).run(token, userId, createdAt, expiresAt);
}

export function getUserIdByToken(
  db: Database.Database,
  token: string,
  nowIso: string,
): number | null {
  const row = db
    .prepare("SELECT user_id, expires_at FROM auth_tokens WHERE token = ?")
    .get(token) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (row.expires_at <= nowIso) return null;
  return row.user_id;
}

export function deleteToken(db: Database.Database, token: string): void {
  db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
}

export function isAdmin(db: Database.Database, userId: number): boolean {
  const row = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId) as
    | { is_admin: number }
    | undefined;
  return row?.is_admin === 1;
}

export function setAdmin(db: Database.Database, userId: number, value: 0 | 1): void {
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(value, userId);
}

export function countAdmins(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1").get() as {
    c: number;
  };
  return row.c;
}
