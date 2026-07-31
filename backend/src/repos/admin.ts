import type Database from "better-sqlite3";

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
