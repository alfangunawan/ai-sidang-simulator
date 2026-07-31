import Database from "better-sqlite3";
import { seedQuestions } from "./repos/questions.js";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  label TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  full_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  idx         INTEGER NOT NULL,
  page        INTEGER,
  heading     TEXT,
  text        TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id, idx);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collaborations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_user_id INTEGER NOT NULL UNIQUE,
  invite_code TEXT NOT NULL UNIQUE,
  share_ai INTEGER NOT NULL DEFAULT 0,
  share_tts INTEGER NOT NULL DEFAULT 0,
  share_stt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collaboration_members (
  collaboration_id INTEGER NOT NULL,
  member_user_id INTEGER NOT NULL UNIQUE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (collaboration_id, member_user_id),
  FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_bank (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  phase    TEXT NOT NULL,
  text     TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_question_bank_phase ON question_bank(phase, position);
`;

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATION);
  addColumnIfMissing(db, "sessions", "status", "status TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing(db, "sessions", "closed_at", "closed_at TEXT");
  addColumnIfMissing(db, "sessions", "assessment", "assessment TEXT");
  addColumnIfMissing(db, "sessions", "close_declined_turn", "close_declined_turn INTEGER");
  addColumnIfMissing(db, "sessions", "user_id", "user_id INTEGER");
  addColumnIfMissing(db, "documents", "user_id", "user_id INTEGER");
  addColumnIfMissing(db, "documents", "dossier", "dossier TEXT");
  addColumnIfMissing(db, "documents", "dossier_status", "dossier_status TEXT");
  addColumnIfMissing(db, "documents", "dossier_error", "dossier_error TEXT");
  addColumnIfMissing(db, "documents", "dossier_version", "dossier_version INTEGER");
  addColumnIfMissing(db, "documents", "dossier_model", "dossier_model TEXT");
  addColumnIfMissing(db, "usage_events", "user_id", "user_id INTEGER");
  addColumnIfMissing(db, "usage_events", "key_owner_user_id", "key_owner_user_id INTEGER");
  addColumnIfMissing(db, "users", "is_admin", "is_admin INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "suspended", "suspended INTEGER NOT NULL DEFAULT 0");
  seedQuestions(db);
  return db;
}
