import type Database from "better-sqlite3";
import { getSettingsView } from "./settings.js";

export interface AdminOverview {
  users: number;
  sessions: number;
  documents: number;
  turns: number;
  cost_usd: number;
  tokens: number;
  top_spenders: { user_id: number; username: string; cost_usd: number; tokens: number }[];
  signups: { day: string; count: number }[];
}

const SIGNUP_DAYS = 14;

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

/** `YYYY-MM-DD` untuk n hari sebelum `iso`, dihitung dalam UTC. */
function dayBefore(iso: string, n: number): string {
  return new Date(new Date(iso).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Semua query di file ini sengaja TIDAK di-scope per user — inilah satu-satunya
 * tempat SQL lintas-pengguna boleh hidup. Repo lain tetap `WHERE user_id = ?`.
 */
export function getOverview(db: Database.Database, todayIso: string): AdminOverview {
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS cost_usd,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
       FROM usage_events`,
    )
    .get() as { cost_usd: number; tokens: number };

  const top_spenders = db
    .prepare(
      `SELECT e.user_id, u.username,
              COALESCE(SUM(e.cost_usd), 0) AS cost_usd,
              COALESCE(SUM(e.input_tokens + e.output_tokens), 0) AS tokens
       FROM usage_events e JOIN users u ON u.id = e.user_id
       GROUP BY e.user_id, u.username
       ORDER BY cost_usd DESC, tokens DESC
       LIMIT 5`,
    )
    .all() as AdminOverview["top_spenders"];

  const from = dayBefore(todayIso, SIGNUP_DAYS - 1);
  const rows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM users WHERE substr(created_at, 1, 10) >= ?
       GROUP BY day`,
    )
    .all(from) as { day: string; count: number }[];
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const signups = Array.from({ length: SIGNUP_DAYS }, (_, i) => {
    const day = dayBefore(todayIso, SIGNUP_DAYS - 1 - i);
    return { day, count: byDay.get(day) ?? 0 };
  });

  return {
    users: count(db, "users"),
    sessions: count(db, "sessions"),
    documents: count(db, "documents"),
    turns: count(db, "turns"),
    cost_usd: totals.cost_usd,
    tokens: totals.tokens,
    top_spenders,
    signups,
  };
}

export interface AdminUserRow {
  id: number;
  username: string;
  created_at: string;
  suspended: boolean;
  is_admin: boolean;
  sessions: number;
  documents: number;
  cost_usd: number;
  tokens: number;
  key_owner: string | null;
}

export function listUsers(db: Database.Database): AdminUserRow[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.created_at, u.suspended, u.is_admin,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
              (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) AS documents,
              (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_events e WHERE e.user_id = u.id) AS cost_usd,
              (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM usage_events e WHERE e.user_id = u.id) AS tokens,
              (SELECT h.username
                 FROM collaboration_members m
                 JOIN collaborations c ON c.id = m.collaboration_id
                 JOIN users h ON h.id = c.host_user_id
                WHERE m.member_user_id = u.id) AS key_owner
       FROM users u
       ORDER BY u.created_at DESC`,
    )
    .all() as (Omit<AdminUserRow, "suspended" | "is_admin"> & {
    suspended: number;
    is_admin: number;
  })[];
  return rows.map((r) => ({ ...r, suspended: r.suspended === 1, is_admin: r.is_admin === 1 }));
}

export interface AdminUserDetail {
  user: AdminUserRow;
  settings: ReturnType<typeof getSettingsView>;
  sessions: { id: string; created_at: string; status: string; turn_count: number }[];
  documents: { id: number; filename: string; char_count: number; dossier_status: string | null }[];
}

export function getUserDetail(
  db: Database.Database,
  userId: number,
): AdminUserDetail | null {
  const user = listUsers(db).find((u) => u.id === userId);
  if (!user) return null;
  return {
    user,
    // Sengaja memakai getSettingsView yang sudah ada: ia hanya melaporkan
    // has_*_key sebagai boolean dan tidak pernah mendekripsi apa pun.
    settings: getSettingsView(db, userId),
    sessions: db
      .prepare(
        `SELECT s.id, s.created_at, s.status, COUNT(t.id) AS turn_count
         FROM sessions s LEFT JOIN turns t ON t.session_id = s.id
         WHERE s.user_id = ?
         GROUP BY s.id ORDER BY s.created_at DESC`,
      )
      .all(userId) as AdminUserDetail["sessions"],
    documents: db
      .prepare(
        "SELECT id, filename, char_count, dossier_status FROM documents WHERE user_id = ? ORDER BY id DESC",
      )
      .all(userId) as AdminUserDetail["documents"],
  };
}
