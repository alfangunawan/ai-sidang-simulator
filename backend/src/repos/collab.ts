import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";

export function freshInviteCode(
  db: Database.Database,
  gen: () => string = () => randomBytes(6).toString("hex"),
): string {
  for (let i = 0; i < 5; i++) {
    const c = gen();
    if (!db.prepare("SELECT 1 FROM collaborations WHERE invite_code = ?").get(c)) return c;
  }
  throw new Error("Gagal membuat kode undangan");
}

export function getHostCollab(db: Database.Database, hostUserId: number) {
  return (db
    .prepare("SELECT id, invite_code, share_ai, share_tts, share_stt FROM collaborations WHERE host_user_id = ?")
    .get(hostUserId) as { id: number; invite_code: string; share_ai: number; share_tts: number; share_stt: number } | undefined) ?? null;
}

export function createCollab(db: Database.Database, hostUserId: number, code: string, createdAt: string): void {
  db.prepare("INSERT INTO collaborations (host_user_id, invite_code, created_at) VALUES (?,?,?)").run(hostUserId, code, createdAt);
}

export function setShares(db: Database.Database, hostUserId: number, s: { share_ai: 0 | 1; share_tts: 0 | 1; share_stt: 0 | 1 }): void {
  db.prepare("UPDATE collaborations SET share_ai=?, share_tts=?, share_stt=? WHERE host_user_id=?").run(s.share_ai, s.share_tts, s.share_stt, hostUserId);
}

export function regenerateCode(db: Database.Database, hostUserId: number, code: string): void {
  db.prepare("UPDATE collaborations SET invite_code=? WHERE host_user_id=?").run(code, hostUserId);
}

export function deleteCollab(db: Database.Database, hostUserId: number): void {
  db.prepare("DELETE FROM collaborations WHERE host_user_id=?").run(hostUserId);
}

export function getMembership(db: Database.Database, memberUserId: number) {
  return (db
    .prepare(
      `SELECT c.id AS collaboration_id, c.host_user_id, c.share_ai, c.share_tts, c.share_stt
       FROM collaboration_members m JOIN collaborations c ON c.id = m.collaboration_id
       WHERE m.member_user_id = ?`,
    )
    .get(memberUserId) as { collaboration_id: number; host_user_id: number; share_ai: number; share_tts: number; share_stt: number } | undefined) ?? null;
}

export function joinByCode(
  db: Database.Database, memberUserId: number, code: string, joinedAt: string,
): { ok: true } | { ok: false; reason: "not_found" | "own" | "already" } {
  const c = db.prepare("SELECT id, host_user_id FROM collaborations WHERE invite_code = ?").get(code) as { id: number; host_user_id: number } | undefined;
  if (!c) return { ok: false, reason: "not_found" };
  if (c.host_user_id === memberUserId) return { ok: false, reason: "own" };
  if (getMembership(db, memberUserId)) return { ok: false, reason: "already" };
  db.prepare("INSERT INTO collaboration_members (collaboration_id, member_user_id, joined_at) VALUES (?,?,?)").run(c.id, memberUserId, joinedAt);
  return { ok: true };
}

export function leave(db: Database.Database, memberUserId: number): void {
  db.prepare("DELETE FROM collaboration_members WHERE member_user_id = ?").run(memberUserId);
}

export function listMembers(db: Database.Database, hostUserId: number): { member_user_id: number; username: string; joined_at: string }[] {
  return db
    .prepare(
      `SELECT m.member_user_id, u.username, m.joined_at
       FROM collaboration_members m
       JOIN collaborations c ON c.id = m.collaboration_id
       JOIN users u ON u.id = m.member_user_id
       WHERE c.host_user_id = ?
       ORDER BY m.joined_at ASC`,
    )
    .all(hostUserId) as { member_user_id: number; username: string; joined_at: string }[];
}

export function kickMember(db: Database.Database, hostUserId: number, memberUserId: number): void {
  db.prepare(
    `DELETE FROM collaboration_members
     WHERE member_user_id = ?
       AND collaboration_id = (SELECT id FROM collaborations WHERE host_user_id = ?)`,
  ).run(memberUserId, hostUserId);
}
