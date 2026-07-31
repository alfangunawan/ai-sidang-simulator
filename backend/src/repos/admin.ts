import type Database from "better-sqlite3";
import type { Turn } from "../providers/types.js";
import { getSettingsView } from "./settings.js";
import { listMembers } from "./collab.js";
import { getKeyUsageView } from "./usage.js";

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

/**
 * `users` sudah cascade ke auth_tokens, user_settings, collaborations, dan
 * collaboration_members. TAPI sessions/documents/usage_events memakai kolom
 * user_id yang ditambahkan lewat ALTER TABLE — SQLite tidak bisa memasang
 * foreign key di sana, jadi tanpa hapus manual di bawah, setiap transkrip dan
 * naskah milik pengguna itu menggantung di DB selamanya.
 *
 * usage_events milik ORANG LAIN yang memakai key pengguna ini (key_owner_user_id)
 * sengaja dibiarkan: riwayat pengeluaran host harus selamat dari penghapusan member.
 */
export function deleteUserCompletely(db: Database.Database, userId: number): void {
  db.transaction(() => {
    db.prepare(
      "DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)",
    ).run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare(
      "DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE user_id = ?)",
    ).run(userId);
    db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM usage_events WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  })();
}

export interface AdminSessionRow {
  id: string;
  user_id: number;
  username: string;
  created_at: string;
  status: string;
  label: string | null;
  turn_count: number;
  final_score: number | null;
}

const SESSION_SELECT = `
  SELECT s.id, s.user_id, u.username, s.created_at, s.status, s.label,
         COUNT(t.id) AS turn_count,
         json_extract(s.assessment, '$.final_score') AS final_score
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN turns t ON t.session_id = s.id
`;

/**
 * LEFT JOIN, bukan JOIN seperti `repos/sessions.ts:30`: daftar mahasiswa
 * menyembunyikan sesi kosong, tapi justru sesi yang mandek tanpa satu giliran
 * pun yang paling perlu dilihat admin.
 */
export function listAllSessions(
  db: Database.Database,
  filter: { userId?: number } = {},
): AdminSessionRow[] {
  const where = filter.userId ? "WHERE s.user_id = ?" : "";
  const sql = `${SESSION_SELECT} ${where} GROUP BY s.id ORDER BY s.created_at DESC`;
  const stmt = db.prepare(sql);
  return (filter.userId ? stmt.all(filter.userId) : stmt.all()) as AdminSessionRow[];
}

export function getSessionForAdmin(
  db: Database.Database,
  sessionId: string,
): { session: AdminSessionRow; turns: Turn[]; assessment: unknown } | null {
  const session = db
    .prepare(`${SESSION_SELECT} WHERE s.id = ? GROUP BY s.id`)
    .get(sessionId) as AdminSessionRow | undefined;
  if (!session) return null;
  const turns = db
    .prepare("SELECT role, content FROM turns WHERE session_id = ? ORDER BY turn_number ASC")
    .all(sessionId) as Turn[];
  const raw = db.prepare("SELECT assessment FROM sessions WHERE id = ?").get(sessionId) as {
    assessment: string | null;
  };
  return {
    session,
    turns,
    assessment: raw.assessment ? JSON.parse(raw.assessment) : null,
  };
}

export interface AdminCodeRow {
  id: number;
  host_user_id: number;
  host_username: string;
  invite_code: string;
  created_at: string;
  shares: { share_ai: number; share_tts: number; share_stt: number };
  members: { member_user_id: number; username: string; joined_at: string }[];
  cost_usd: number;
  calls: number;
}

export function listAllCodes(db: Database.Database): AdminCodeRow[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.host_user_id, u.username AS host_username, c.invite_code,
              c.created_at, c.share_ai, c.share_tts, c.share_stt
       FROM collaborations c JOIN users u ON u.id = c.host_user_id
       ORDER BY c.created_at DESC`,
    )
    .all() as {
    id: number;
    host_user_id: number;
    host_username: string;
    invite_code: string;
    created_at: string;
    share_ai: number;
    share_tts: number;
    share_stt: number;
  }[];

  // Anggota dan pengeluaran dipinjam dari repo kolaborasi yang sudah ada
  // ketimbang ditulis ulang di sini.
  return rows.map((r) => {
    const usage = getKeyUsageView(db, r.host_user_id);
    return {
      id: r.id,
      host_user_id: r.host_user_id,
      host_username: r.host_username,
      invite_code: r.invite_code,
      created_at: r.created_at,
      shares: { share_ai: r.share_ai, share_tts: r.share_tts, share_stt: r.share_stt },
      members: listMembers(db, r.host_user_id),
      cost_usd: usage.total.cost_usd,
      calls: usage.total.calls,
    };
  });
}
