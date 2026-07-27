# Auth + Multi-User Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password auth (register/login/logout) and scope every user's sessions, documents, usage, and settings (including API keys) to their own account.

**Architecture:** Stdlib-only auth — `crypto.scrypt` password hashing, an opaque random token stored in `auth_tokens` delivered as an httpOnly cookie. Data isolation via a `user_id` column on scoped tables plus a per-user `user_settings` table. A `requireAuth` middleware sets `req.userId`; every repo function takes `userId` and filters on it.

**Tech Stack:** TypeScript, Express 4, better-sqlite3, Node `crypto` (stdlib), React 18 + Vite, Vitest, supertest.

## Global Constraints

- **Zero new dependencies.** Auth uses Node stdlib only (`node:crypto`). No bcrypt, JWT, cookie-parser, or auth libraries.
- **Identifier:** username only. Regex `^[a-zA-Z0-9_]{3,32}$`. Password min length 8.
- **Open registration** — no invite code, no roles.
- **Cookie:** name `sid`, `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (30 days), plus `Secure` only when the request is https (`req.secure`, with `app.set("trust proxy", 1)` so nginx TLS is trusted).
- **Ownership misses return 404**, not 403 (no existence leak). **Bad credentials return 401 with one message** for both unknown user and wrong password (no user enumeration).
- **ISO-8601 UTC timestamp strings** everywhere (matches existing `() => new Date().toISOString()` pattern); token expiry compares these strings lexicographically.
- **Build note:** changing repo signatures (Tasks 4–8) leaves `npm run build` (tsc) temporarily failing because route callers aren't updated until Task 9. Per-task gates in Tasks 4–8 are the **Vitest** tests (Vitest does not typecheck). Full `npm run build` is verified in Task 9 and Task 11.
- **In-memory test DB:** `openDb(":memory:")` gives a fully-migrated throwaway DB for repo tests.

---

### Task 1: DB schema — users, auth_tokens, user_settings, user_id columns

**Files:**
- Modify: `backend/src/db.ts`
- Test: `backend/test/db.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `openDb(path)` now also creates tables `users(id, username, password_hash, created_at)`, `auth_tokens(token, user_id, created_at, expires_at)`, `user_settings(user_id, key, value)` and adds column `user_id INTEGER` to `sessions`, `documents`, `usage_events`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/db.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";

function cols(db: any, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("schema", () => {
  it("creates auth tables and user_id columns", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["users", "auth_tokens", "user_settings"]));
    expect(cols(db, "sessions")).toContain("user_id");
    expect(cols(db, "documents")).toContain("user_id");
    expect(cols(db, "usage_events")).toContain("user_id");
    expect(cols(db, "users")).toEqual(expect.arrayContaining(["id", "username", "password_hash", "created_at"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: FAIL (tables `users`/`auth_tokens`/`user_settings` don't exist; no `user_id` column).

- [ ] **Step 3: Write minimal implementation**

In `backend/src/db.ts`, append to the `MIGRATION` template string (before the closing backtick):

```sql
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
```

In `openDb`, after the existing `addColumnIfMissing` calls, add:

```ts
addColumnIfMissing(db, "sessions", "user_id", "user_id INTEGER");
addColumnIfMissing(db, "documents", "user_id", "user_id INTEGER");
addColumnIfMissing(db, "usage_events", "user_id", "user_id INTEGER");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.ts backend/test/db.test.ts
git commit -m "feat(db): auth tables and per-user columns"
```

---

### Task 2: `auth.ts` — password hashing, tokens, cookies

**Files:**
- Create: `backend/src/auth.ts`
- Test: `backend/test/auth.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hashPassword(pw: string): string` → `"saltHex:hashHex"`
  - `verifyPassword(pw: string, stored: string): boolean`
  - `newToken(): string`
  - `expiresAt(fromIso: string, days?: number): string`
  - `setAuthCookie(res: Response, token: string, secure: boolean): void`
  - `clearAuthCookie(res: Response): void`
  - `readAuthCookie(req: Request): string | null`
  - Express `Request.userId?: number` augmentation.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/auth.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, newToken, expiresAt, readAuthCookie } from "../src/auth.js";

describe("password", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const h = hashPassword("correct horse");
    expect(h).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("rejects a malformed stored hash without throwing", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("token + cookie", () => {
  it("newToken is 64 hex chars and unique", () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it("expiresAt adds days", () => {
    expect(expiresAt("2026-01-01T00:00:00.000Z", 30)).toBe("2026-01-31T00:00:00.000Z");
  });
  it("readAuthCookie parses the sid cookie", () => {
    expect(readAuthCookie({ headers: { cookie: "foo=1; sid=abc123; bar=2" } } as any)).toBe("abc123");
    expect(readAuthCookie({ headers: {} } as any)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/auth.test.ts`
Expected: FAIL ("Cannot find module '../src/auth.js'").

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/auth.ts
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

const KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pw, Buffer.from(saltHex, "hex"), KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function expiresAt(fromIso: string, days = 30): string {
  return new Date(new Date(fromIso).getTime() + days * 86_400_000).toISOString();
}

const COOKIE = "sid";
const MAX_AGE = 30 * 86_400; // seconds

export function setAuthCookie(res: Response, token: string, secure: boolean): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`,
  );
}

export function clearAuthCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function readAuthCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=") || null;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth.ts backend/test/auth.test.ts
git commit -m "feat(auth): scrypt password hashing, tokens, cookie helpers"
```

---

### Task 3: `repos/users.ts` — user + token persistence

**Files:**
- Create: `backend/src/repos/users.ts`
- Test: `backend/test/users.test.ts` (create)

**Interfaces:**
- Consumes: `openDb` (Task 1).
- Produces:
  - `createUser(db, username: string, passwordHash: string, createdAt: string): number`
  - `getUserByUsername(db, username: string): { id: number; username: string; password_hash: string } | null`
  - `getUserById(db, id: number): { id: number; username: string } | null`
  - `createToken(db, token: string, userId: number, createdAt: string, expiresAt: string): void`
  - `getUserIdByToken(db, token: string, nowIso: string): number | null` (null if missing or `expires_at <= now`)
  - `deleteToken(db, token: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/users.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createUser, getUserByUsername, getUserById,
  createToken, getUserIdByToken, deleteToken,
} from "../src/repos/users.js";

describe("users repo", () => {
  it("creates and fetches a user", () => {
    const db = openDb(":memory:");
    const id = createUser(db, "alfan", "salt:hash", "2026-07-27T00:00:00.000Z");
    expect(getUserByUsername(db, "alfan")).toMatchObject({ id, username: "alfan", password_hash: "salt:hash" });
    expect(getUserById(db, id)).toEqual({ id, username: "alfan" });
    expect(getUserByUsername(db, "nobody")).toBeNull();
  });

  it("resolves a live token and rejects an expired or deleted one", () => {
    const db = openDb(":memory:");
    const uid = createUser(db, "u", "salt:hash", "2026-07-27T00:00:00.000Z");
    createToken(db, "tok", uid, "2026-07-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBe(uid);
    expect(getUserIdByToken(db, "tok", "2026-09-01T00:00:00.000Z")).toBeNull(); // expired
    deleteToken(db, "tok");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/users.test.ts`
Expected: FAIL ("Cannot find module '../src/repos/users.js'").

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repos/users.ts
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
): { id: number; username: string } | null {
  const row = db.prepare("SELECT id, username FROM users WHERE id = ?").get(id) as
    | { id: number; username: string }
    | undefined;
  return row ?? null;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/users.ts backend/test/users.test.ts
git commit -m "feat(users): user and auth-token repository"
```

---

### Task 4: `repos/settings.ts` — per-user settings

**Files:**
- Modify: `backend/src/repos/settings.ts`
- Test: `backend/test/settings.test.ts` (create)

**Interfaces:**
- Consumes: `openDb` (Task 1), `createUser` (Task 3), existing `crypto.ts` `encrypt/decrypt`.
- Produces (every function gains a leading `userId: number` after `db`, and, where present, before `key: Buffer`):
  - `getSetting(db, userId, key: string): string | null`
  - `setSetting(db, userId, key: string, value: string): void`
  - `seedDefaults(db, userId): void`
  - `getSettingsView(db, userId): {…same shape as today…}`
  - `saveSettings(db, userId, encKey: Buffer, body): void`
  - `getLlmKey(db, userId, encKey: Buffer): string | null`
  - `getTtsKey(db, userId, encKey: Buffer, provider: string): string | null`
  - `getSttKey(db, userId, encKey: Buffer): string | null`
  - `getActiveTtsConfig(db, userId, encKey: Buffer): {provider, voice, apiKey}`
  - `getActiveConfig(db, userId, encKey: Buffer): {provider, model, apiKey, attackPoints, examinerMode, examinerType}`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/settings.test.ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { seedDefaults, getSettingsView, saveSettings, getLlmKey } from "../src/repos/settings.js";

const KEY = randomBytes(32);

describe("per-user settings", () => {
  it("isolates api keys and defaults between users", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    seedDefaults(db, u1);
    seedDefaults(db, u2);

    saveSettings(db, u1, KEY, { api_key: "sk-secret-1" });

    expect(getSettingsView(db, u1).has_api_key).toBe(true);
    expect(getSettingsView(db, u2).has_api_key).toBe(false);
    expect(getLlmKey(db, u1, KEY)).toBe("sk-secret-1");
    expect(getLlmKey(db, u2, KEY)).toBeNull();
    expect(getSettingsView(db, u2).model).toBe("claude-sonnet-5"); // default seeded
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/settings.test.ts`
Expected: FAIL (current `seedDefaults(db)` takes one arg / writes global `settings`).

- [ ] **Step 3: Write minimal implementation**

Rewrite the two primitives to hit `user_settings`, then thread `userId` through every exported function (signatures above). Only the primitives touch SQL; the rest just forward `userId`.

```ts
export function getSetting(db: Database.Database, userId: number, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
    .get(userId, key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(db: Database.Database, userId: number, key: string, value: string): void {
  db.prepare(
    "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
  ).run(userId, key, value);
}
```

Then update every other function in the file: add `userId` after `db`, and pass it into `getSetting`/`setSetting` calls. Examples:

```ts
export function seedDefaults(db: Database.Database, userId: number): void {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(db, userId, k) === null) setSetting(db, userId, k, v);
  }
}

export function getLlmKey(db: Database.Database, userId: number, key: Buffer): string | null {
  const enc = getSetting(db, userId, "api_key");
  return enc ? decrypt(enc, key) : null;
}
```

Apply the same mechanical change to `getSettingsView`, `saveSettings`, `getTtsKey`, `getSttKey`, `getActiveTtsConfig`, `getActiveConfig` — each `getSetting(db, "x")` becomes `getSetting(db, userId, "x")` and each `setSetting(db, "x", v)` becomes `setSetting(db, userId, "x", v)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/settings.test.ts`
Expected: PASS (ignore that `routes/*.ts` no longer typecheck — fixed in Task 9).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/settings.ts backend/test/settings.test.ts
git commit -m "feat(settings): scope settings and API keys per user"
```

---

### Task 5: `repos/documents.ts` — per-user document

**Files:**
- Modify: `backend/src/repos/documents.ts`
- Test: `backend/test/documents.test.ts` (create)

**Interfaces:**
- Consumes: `openDb`, `createUser`.
- Produces:
  - `getActiveDocument(db, userId): {filename, full_text, char_count, created_at} | null`
  - `replaceDocument(db, userId, filename, fullText, createdAt): void`
  - `deleteDocument(db, userId): void`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/documents.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { getActiveDocument, replaceDocument, deleteDocument } from "../src/repos/documents.js";

describe("per-user documents", () => {
  it("keeps each user's active document separate", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    replaceDocument(db, u1, "skripsi1.pdf", "isi satu", "t1");
    replaceDocument(db, u2, "skripsi2.pdf", "isi dua", "t2");
    expect(getActiveDocument(db, u1)?.filename).toBe("skripsi1.pdf");
    expect(getActiveDocument(db, u2)?.filename).toBe("skripsi2.pdf");
    deleteDocument(db, u1);
    expect(getActiveDocument(db, u1)).toBeNull();
    expect(getActiveDocument(db, u2)?.filename).toBe("skripsi2.pdf"); // untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/documents.test.ts`
Expected: FAIL (signatures take no `userId`).

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repos/documents.ts
import type Database from "better-sqlite3";

export function getActiveDocument(
  db: Database.Database,
  userId: number,
): { filename: string; full_text: string; char_count: number; created_at: string } | null {
  const row = db
    .prepare(
      "SELECT filename, full_text, char_count, created_at FROM documents WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as any;
  return row ?? null;
}

export function replaceDocument(
  db: Database.Database,
  userId: number,
  filename: string,
  fullText: string,
  createdAt: string,
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
    db.prepare(
      "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
    ).run(userId, filename, fullText, fullText.length, createdAt);
  });
  tx();
}

export function deleteDocument(db: Database.Database, userId: number): void {
  db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/documents.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/documents.ts backend/test/documents.test.ts
git commit -m "feat(documents): scope active document per user"
```

---

### Task 6: `repos/usage.ts` — per-user usage

**Files:**
- Modify: `backend/src/repos/usage.ts`
- Test: `backend/test/usage.test.ts` (create)

**Interfaces:**
- Consumes: `openDb`, `createUser`.
- Produces:
  - `recordUsage(db, userId, at, provider, model, kind, usage): void`
  - `getUsageView(db, userId): UsageView`
  - `resetUsage(db, userId): void`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/usage.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { recordUsage, getUsageView, resetUsage } from "../src/repos/usage.js";

const U = { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.01 };

describe("per-user usage", () => {
  it("counts only the caller's events", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    recordUsage(db, u1, "t", "claude", "m", "turn", U);
    recordUsage(db, u1, "t", "claude", "m", "turn", U);
    recordUsage(db, u2, "t", "claude", "m", "turn", U);
    expect(getUsageView(db, u1).total.calls).toBe(2);
    expect(getUsageView(db, u2).total.calls).toBe(1);
    resetUsage(db, u1);
    expect(getUsageView(db, u1).total.calls).toBe(0);
    expect(getUsageView(db, u2).total.calls).toBe(1); // untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/usage.test.ts`
Expected: FAIL (signatures take no `userId`).

- [ ] **Step 3: Write minimal implementation**

Add `userId: number` after `db` to all three functions. In `recordUsage`, add `user_id` to the INSERT column list and bind `userId` first. In `getUsageView`, add `WHERE user_id = ?` to all three queries (`total`, grouped `by_kind`, and `since`) and pass `userId`. In `resetUsage`, `DELETE FROM usage_events WHERE user_id = ?`.

```ts
export function recordUsage(
  db: Database.Database, userId: number, at: string, provider: string,
  model: string, kind: UsageKind, usage: TokenUsage | undefined,
): void {
  if (!usage) return;
  try {
    db.prepare(
      `INSERT INTO usage_events
         (user_id, created_at, provider, model, kind, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, at, provider, model, kind, usage.input_tokens, usage.output_tokens,
      usage.cache_read_tokens, usage.cache_write_tokens, usage.cost_usd);
  } catch (err) {
    console.error("[usage record failed]", (err as Error).message);
  }
}

export function getUsageView(db: Database.Database, userId: number): UsageView {
  const total = (db.prepare(`SELECT ${SUMS} FROM usage_events WHERE user_id = ?`).get(userId) as UsageTotals) ?? EMPTY;
  const rows = db.prepare(`SELECT kind, ${SUMS} FROM usage_events WHERE user_id = ? GROUP BY kind ORDER BY kind`).all(userId) as (UsageTotals & { kind: UsageKind })[];
  const since = db.prepare("SELECT MIN(created_at) AS since FROM usage_events WHERE user_id = ?").get(userId) as { since: string | null };
  return { total, by_kind: rows.map(({ kind, ...totals }) => ({ kind, totals })), since: since?.since ?? null };
}

export function resetUsage(db: Database.Database, userId: number): void {
  db.prepare("DELETE FROM usage_events WHERE user_id = ?").run(userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/usage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/usage.ts backend/test/usage.test.ts
git commit -m "feat(usage): scope usage accounting per user"
```

---

### Task 7: `repos/sessions.ts` — per-user sessions + ownership

**Files:**
- Modify: `backend/src/repos/sessions.ts`
- Test: `backend/test/sessions.test.ts` (create)

**Interfaces:**
- Consumes: `openDb`, `createUser`.
- Produces:
  - `createSession(db, userId, id: string, createdAt: string, label: string | null): void`
  - `listSessions(db, userId): SessionSummary[]`
  - `sessionExists(db, sessionId: string, userId: number): boolean`
  - `getSessionMeta(db, sessionId: string, userId: number): SessionMeta | null`
  - `deleteSession(db, sessionId: string, userId: number): void`
  - unchanged (operate by `session_id`, always called after an ownership check): `getTurns`, `nextTurnNumber`, `addTurn`, `deleteTurn`, `countExaminerTurns`, `setCloseDeclined`, `closeWithAssessment`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/sessions.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  createSession, listSessions, sessionExists, getSessionMeta, deleteSession,
  addTurn,
} from "../src/repos/sessions.js";

describe("per-user sessions", () => {
  it("scopes listing and ownership by user", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    createSession(db, u1, "s1", "2026-07-27T00:00:00.000Z", "punya u1");
    addTurn(db, "s1", 1, "user", "halo", "t"); // listSessions JOINs turns

    expect(sessionExists(db, "s1", u1)).toBe(true);
    expect(sessionExists(db, "s1", u2)).toBe(false); // ownership miss
    expect(getSessionMeta(db, "s1", u2)).toBeNull();
    expect(listSessions(db, u1).map((s) => s.id)).toEqual(["s1"]);
    expect(listSessions(db, u2)).toEqual([]);

    deleteSession(db, "s1", u2); // wrong owner → no-op
    expect(sessionExists(db, "s1", u1)).toBe(true);
    deleteSession(db, "s1", u1);
    expect(sessionExists(db, "s1", u1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/sessions.test.ts`
Expected: FAIL (signatures take no `userId`).

- [ ] **Step 3: Write minimal implementation**

```ts
export function createSession(db: Database.Database, userId: number, id: string, createdAt: string, label: string | null): void {
  db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(id, userId, createdAt, label);
}

export function listSessions(db: Database.Database, userId: number): SessionSummary[] {
  return db.prepare(
    `SELECT s.id, s.created_at, s.label, s.status,
            json_extract(s.assessment, '$.final_score') AS final_score,
            COUNT(t.id) AS turn_count
     FROM sessions s JOIN turns t ON t.session_id = s.id
     WHERE s.user_id = ?
     GROUP BY s.id, s.created_at, s.label, s.status
     ORDER BY s.created_at DESC`,
  ).all(userId) as SessionSummary[];
}

export function sessionExists(db: Database.Database, sessionId: string, userId: number): boolean {
  return db.prepare("SELECT 1 FROM sessions WHERE id = ? AND user_id = ?").get(sessionId, userId) !== undefined;
}

export function getSessionMeta(db: Database.Database, sessionId: string, userId: number): SessionMeta | null {
  const row = db.prepare(
    "SELECT status, closed_at, assessment, close_declined_turn FROM sessions WHERE id = ? AND user_id = ?",
  ).get(sessionId, userId) as SessionMeta | undefined;
  return row ?? null;
}

export function deleteSession(db: Database.Database, sessionId: string, userId: number): void {
  db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(sessionId, userId);
}
```

Leave `getTurns`, `nextTurnNumber`, `addTurn`, `deleteTurn`, `countExaminerTurns`, `setCloseDeclined`, `closeWithAssessment` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/sessions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/sessions.ts backend/test/sessions.test.ts
git commit -m "feat(sessions): scope sessions and ownership per user"
```

---

### Task 8: `routes/auth.ts` + `requireAuth` middleware

**Files:**
- Create: `backend/src/routes/auth.ts`
- Test: `backend/test/auth-routes.test.ts` (create)

**Interfaces:**
- Consumes: `auth.ts` (Task 2), `repos/users.ts` (Task 3), `seedDefaults` (Task 4).
- Produces:
  - `authRouter(db, now?): Router` mounting `POST /register`, `POST /login`, `POST /logout`, `GET /me`.
  - `requireAuth(db, now?): RequestHandler` — sets `req.userId` or responds 401.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/auth-routes.test.ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { openDb } from "../src/db.js";
import { authRouter, requireAuth } from "../src/routes/auth.js";

function app() {
  const db = openDb(":memory:");
  const a = express();
  a.use(express.json());
  a.use("/auth", authRouter(db));
  a.get("/whoami", requireAuth(db), (req, res) => res.json({ userId: req.userId }));
  return a;
}

describe("auth routes", () => {
  it("register → me → protected route, and logout clears access", async () => {
    const a = app();
    const agent = request.agent(a);

    const reg = await agent.post("/auth/register").send({ username: "alfan", password: "password1" });
    expect(reg.status).toBe(200);
    expect(reg.body.user.username).toBe("alfan");

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("alfan");

    const who = await agent.get("/whoami");
    expect(who.status).toBe(200);
    expect(who.body.userId).toBe(reg.body.user.id);

    await agent.post("/auth/logout").expect(200);
    await agent.get("/auth/me").expect(401);
    await agent.get("/whoami").expect(401);
  });

  it("rejects duplicate username, weak input, and bad credentials", async () => {
    const a = app();
    await request(a).post("/auth/register").send({ username: "u", password: "password1" }).expect(400); // short username
    await request(a).post("/auth/register").send({ username: "user", password: "short" }).expect(400);   // short password
    await request(a).post("/auth/register").send({ username: "dup", password: "password1" }).expect(200);
    await request(a).post("/auth/register").send({ username: "dup", password: "password1" }).expect(409);
    await request(a).post("/auth/login").send({ username: "dup", password: "wrongpass" }).expect(401);
    await request(a).post("/auth/login").send({ username: "ghost", password: "password1" }).expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/auth-routes.test.ts`
Expected: FAIL ("Cannot find module '../src/routes/auth.js'").

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/routes/auth.ts
import { Router, type RequestHandler } from "express";
import type Database from "better-sqlite3";
import {
  hashPassword, verifyPassword, newToken, expiresAt,
  setAuthCookie, clearAuthCookie, readAuthCookie,
} from "../auth.js";
import {
  createUser, getUserByUsername, getUserById,
  createToken, getUserIdByToken, deleteToken,
} from "../repos/users.js";
import { seedDefaults } from "../repos/settings.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function requireAuth(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): RequestHandler {
  return (req, res, next) => {
    const token = readAuthCookie(req);
    const userId = token ? getUserIdByToken(db, token, now()) : null;
    if (!userId) return res.status(401).json({ error: "Silakan login" });
    req.userId = userId;
    next();
  };
}

export function authRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  function issue(res: Parameters<RequestHandler>[1], req: Parameters<RequestHandler>[0], userId: number) {
    const token = newToken();
    const at = now();
    createToken(db, token, userId, at, expiresAt(at));
    setAuthCookie(res, token, req.secure);
  }

  r.post("/register", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Username 3–32 karakter, huruf/angka/underscore" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }
    if (getUserByUsername(db, username)) {
      return res.status(409).json({ error: "Username sudah dipakai" });
    }
    const userId = createUser(db, username, hashPassword(password), now());
    seedDefaults(db, userId);
    issue(res, req, userId);
    res.json({ user: { id: userId, username } });
  });

  r.post("/login", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    const user = getUserByUsername(db, username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Username atau password salah" });
    }
    issue(res, req, user.id);
    res.json({ user: { id: user.id, username: user.username } });
  });

  r.post("/logout", (req, res) => {
    const token = readAuthCookie(req);
    if (token) deleteToken(db, token);
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  r.get("/me", (req, res) => {
    const token = readAuthCookie(req);
    const userId = token ? getUserIdByToken(db, token, now()) : null;
    const user = userId ? getUserById(db, userId) : null;
    if (!user) return res.status(401).json({ error: "Belum login" });
    res.json({ user });
  });

  return r;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/auth-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/auth-routes.test.ts
git commit -m "feat(auth): register/login/logout/me routes and requireAuth"
```

---

### Task 9: Wire `app.ts` + thread `req.userId` through protected routes

**Files:**
- Modify: `backend/src/app.ts`, `backend/src/routes/settings.ts`, `backend/src/routes/sessions.ts`, `backend/src/routes/skripsi.ts`, `backend/src/routes/tts.ts`, `backend/src/routes/stt.ts`
- Modify: `backend/test/*` existing route tests that call these routers (update to register a user + agent first)
- Test: `backend/test/isolation.test.ts` (create)

**Interfaces:**
- Consumes: `authRouter`, `requireAuth` (Task 8); all per-user repos (Tasks 4–7).
- Produces: an app where `/settings`, `/sessions`, `/skripsi`, `/tts`, `/stt` require auth and operate on `req.userId!`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/isolation.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { randomBytes } from "node:crypto";

function ctx() {
  return buildApp(openDb(":memory:"), randomBytes(32));
}

describe("cross-user isolation", () => {
  it("blocks unauthenticated access and hides other users' sessions", async () => {
    const app = ctx();
    await request(app).get("/sessions").expect(401); // no cookie

    const u1 = request.agent(app);
    await u1.post("/auth/register").send({ username: "user1", password: "password1" }).expect(200);
    const created = await u1.post("/sessions").send({}).expect(200);
    const sid = created.body.session_id;
    expect((await u1.get("/sessions")).status).toBe(200);

    const u2 = request.agent(app);
    await u2.post("/auth/register").send({ username: "user2", password: "password1" }).expect(200);
    await u2.get(`/sessions/${sid}/turns`).expect(200); // returns empty for non-owner? see note
    await u2.get(`/sessions/${sid}/result`).expect(404); // ownership miss
  });
});
```

Note: `GET /:id/turns` currently has no existence check; add one so a non-owner gets 404 (see implementation). Adjust the test's `turns` line to `.expect(404)` after adding the guard.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/isolation.test.ts`
Expected: FAIL (routes don't compile / no auth mounted).

- [ ] **Step 3: Write minimal implementation**

**`app.ts`** — trust proxy, mount auth, guard the rest, drop the global `seedDefaults`:

```ts
import { authRouter, requireAuth } from "./routes/auth.js";
// ...
export function buildApp(db: Database.Database, key: Buffer): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter(db));

  const auth = requireAuth(db);
  app.use("/settings", auth, settingsRouter(db, key));
  app.use("/sessions", auth, sessionsRouter(db, key));
  app.use("/skripsi", auth, skripsiRouter(db));
  app.use("/tts", auth, ttsRouter(db, key));
  app.use("/stt", auth, sttRouter(db, key));
  // ...unchanged error handler...
}
```

Remove the `seedDefaults(db)` call and its import (seeding is per-user at register now).

**`routes/settings.ts`** — read `const userId = req.userId!;` at the top of each handler and pass it: `getSettingsView(db, userId)`, `saveSettings(db, userId, key, body)`, `getUsageView(db, userId)`, `resetUsage(db, userId)`, and in `/test-llm`: `getSetting(db, userId, "provider")`, `getLlmKey(db, userId, key)`.

**`routes/sessions.ts`** — `const userId = req.userId!;` in every handler; then:
- `createSession(db, userId, id, now(), label)`
- `listSessions(db, userId)`
- guard `/:id/turns`: `if (!sessionExists(db, req.params.id, userId)) return res.status(404).json({ error: "Sesi tidak ditemukan" });` before `getTurns`.
- `sessionExists(db, sessionId, userId)`, `getSessionMeta(db, sessionId, userId)`, `deleteSession(db, req.params.id, userId)`
- `getActiveConfig(db, userId, key)`, `getActiveDocument(db, userId)`, `getSetting(db, userId, "api_key")`
- `recordUsage(db, userId, now(), cfg.provider, cfg.model, "turn"|"assessment", …)`

**`routes/skripsi.ts`** — `const userId = req.userId!;`: `replaceDocument(db, userId, …)`, `getActiveDocument(db, userId)`, `deleteDocument(db, userId)`.

**`routes/tts.ts`** — `const userId = req.userId!;`: `getActiveTtsConfig(db, userId, key)`, `getTtsKey(db, userId, key, provider)`, `getSetting(db, userId, "tts_provider")`.

**`routes/stt.ts`** — `const userId = req.userId!;`: `getSetting(db, userId, "stt_provider")`, `getSttKey(db, userId, key)`.

Update any existing route tests (`backend/test/*.test.ts` that hit these routers directly) to register + use a `request.agent` so they carry the cookie.

- [ ] **Step 4: Run tests + full typecheck**

Run: `cd backend && npx vitest run && npm run build`
Expected: all tests PASS and `tsc` exits 0 (build no longer broken).

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(api): require auth and scope all routes to the current user"
```

---

### Task 10: Frontend — auth calls, gating, AuthPage, logout

**Files:**
- Modify: `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/types.ts`
- Create: `frontend/src/pages/AuthPage.tsx`
- Test: `frontend/src/pages/AuthPage.test.tsx` (create)

**Interfaces:**
- Consumes: backend `/auth/*` from Task 8.
- Produces:
  - `api.ts`: `me(): Promise<{id:number;username:string}|null>`, `login(username,password): Promise<User>`, `register(username,password): Promise<User>`, `logout(): Promise<void>`, `setUnauthorizedHandler(fn: () => void): void`.
  - `AuthPage({ onAuthed }: { onAuthed: (u: User) => void })`.
  - `types.ts`: `export interface User { id: number; username: string }`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/AuthPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthPage } from "./AuthPage.js";

beforeEach(() => {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ user: { id: 1, username: "alfan" } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  ) as any;
});

describe("AuthPage", () => {
  it("logs in and calls onAuthed with the user", async () => {
    const onAuthed = vi.fn();
    render(<AuthPage onAuthed={onAuthed} />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "alfan" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith({ id: 1, username: "alfan" }));
    expect((global.fetch as any).mock.calls[0][0]).toBe("/api/auth/login");
  });

  it("switches to register mode and posts to /api/auth/register", async () => {
    const onAuthed = vi.fn();
    render(<AuthPage onAuthed={onAuthed} />);
    fireEvent.click(screen.getByRole("button", { name: /daftar di sini/i }));
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "baru" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /buat akun/i }));
    await waitFor(() => expect(onAuthed).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls[0][0]).toBe("/api/auth/register");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/AuthPage.test.tsx`
Expected: FAIL ("Cannot find module './AuthPage.js'").

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/src/types.ts`:

```ts
export interface User { id: number; username: string; }
```

Add to `frontend/src/api.ts` (reuse existing `postJson`/`jsonOrThrow`):

```ts
import type { User } from "./types.js";

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void { onUnauthorized = fn; }

// Call inside jsonOrThrow BEFORE throwing when res.status === 401:
//   if (res.status === 401) onUnauthorized?.();

export async function me(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  return (await jsonOrThrow(res)).user as User;
}
export async function login(username: string, password: string): Promise<User> {
  return (await jsonOrThrow(await postJson("/api/auth/login", { username, password }))).user as User;
}
export async function register(username: string, password: string): Promise<User> {
  return (await jsonOrThrow(await postJson("/api/auth/register", { username, password }))).user as User;
}
export async function logout(): Promise<void> {
  await postJson("/api/auth/logout", {});
}
```

In `jsonOrThrow`, add at the top of the `if (!res.ok)` block: `if (res.status === 401) onUnauthorized?.();` (so any expired-session response bumps the user back to login). Guard against `me()`'s own 401 by having `me()` short-circuit before `jsonOrThrow` as written above.

Create `frontend/src/pages/AuthPage.tsx`:

```tsx
import { useState } from "react";
import { login, register } from "../api.js";
import type { User } from "../types.js";

export function AuthPage({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthed(u);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="wordmark">SiBiru</h1>
        <p className="tagline">{mode === "login" ? "Masuk ke akunmu" : "Buat akun baru"}</p>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} autoComplete="username"
          onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {mode === "login" ? "Masuk" : "Buat akun"}
        </button>
        <p className="auth-switch">
          {mode === "login" ? (
            <button type="button" className="linklike" onClick={() => setMode("register")}>Belum punya akun? Daftar di sini</button>
          ) : (
            <button type="button" className="linklike" onClick={() => setMode("login")}>Sudah punya akun? Masuk</button>
          )}
        </p>
      </form>
    </div>
  );
}
```

Wire `App.tsx`: gate on `me()`, register the unauthorized handler, add logout.

```tsx
import { useEffect, useState } from "react";
import { me, logout, setUnauthorizedHandler } from "./api.js";
import type { User } from "./types.js";
import { AuthPage } from "./pages/AuthPage.js";
// ...existing imports...

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  // ...existing view/result state...

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="app" />;
  if (!user) return <AuthPage onAuthed={setUser} />;

  // ...existing render, plus in the masthead nav add:
  //   <span className="whoami">{user.username}</span>
  //   <button onClick={async () => { await logout(); setUser(null); }}>Keluar</button>
}
```

Add minimal styles to `frontend/src/styles.css` for `.auth`, `.auth-card`, `.auth-error`, `.auth-switch`, `.linklike`, `.whoami` (centered card, stacked inputs — match existing look).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/AuthPage.test.tsx && npm run build`
Expected: PASS and Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(ui): login/register gate, logout, 401 handling"
```

---

### Task 11: Deploy — reset DB, build, restart, smoke test

**Files:** none (ops).

**Interfaces:**
- Consumes: everything above, merged to `main`.

- [ ] **Step 1: Merge the feature branch**

```bash
cd /var/www/ai-sidang-simulator
git checkout main && git merge --no-ff feat/auth-multi-user
```

- [ ] **Step 2: Stop backend and wipe throwaway test DB**

```bash
pm2 stop sidang-backend
rm -f backend/data/sibiru.sqlite
```

- [ ] **Step 3: Build both**

```bash
cd backend && npm run build && cd ../frontend && npm run build && cd ..
```
Expected: both exit 0.

- [ ] **Step 4: Restart backend and smoke test over https**

```bash
pm2 restart sidang-backend
# register a throwaway user, expect Set-Cookie: sid=...
curl -si -c /tmp/sid.txt https://sidang.anxietypha.my.id/api/auth/register \
  -H 'Content-Type: application/json' -d '{"username":"smoke_test","password":"password1"}' | grep -Ei 'HTTP|set-cookie'
# authenticated call using the saved cookie → expect 200 and a JSON settings view
curl -s -b /tmp/sid.txt https://sidang.anxietypha.my.id/api/settings | head -c 120; echo
# unauthenticated → expect 401
curl -s -o /dev/null -w '%{http_code}\n' https://sidang.anxietypha.my.id/api/sessions
```
Expected: register `200` + `set-cookie: sid=...`; `/api/settings` returns JSON (`has_api_key:false`); bare `/api/sessions` returns `401`.

- [ ] **Step 5: Clean up smoke user + persist pm2**

```bash
# remove the smoke_test account so it isn't left in the DB
cd backend && node -e "import('better-sqlite3').then(({default:D})=>{const db=new D('data/sibiru.sqlite');db.prepare('DELETE FROM users WHERE username=?').run('smoke_test');console.log('cleaned');})"
cd .. && pm2 save
```

---

## Self-Review

**Spec coverage:**
- Auth mechanism (scrypt, opaque cookie token) → Tasks 2, 8. ✓
- Schema (users, auth_tokens, user_settings, user_id columns) → Task 1. ✓
- Per-user settings incl. API keys → Task 4. ✓
- Per-user documents → Task 5. ✓
- Per-user usage → Task 6. ✓
- Per-user sessions + ownership 404 → Tasks 7, 9. ✓
- Auth routes + requireAuth + open registration + username rules → Task 8. ✓
- app wiring, trust proxy, cors credentials, drop global seed → Task 9. ✓
- Frontend gate/login/register/logout/401 → Task 10. ✓
- Deploy: wipe DB, build, restart, smoke → Task 11. ✓
- No-enumeration login message, ownership 404 → Tasks 8, 9. ✓

**Placeholder scan:** No TBD/TODO; every code step has real code. Route-threading in Task 9 is enumerated per file with exact call sites. ✓

**Type consistency:** `userId: number` param order (`db, userId, …`) consistent across repos; `req.userId?: number` augmentation defined in Task 2 and used in Tasks 8–9; `User` type defined in Task 10 and reused by `me/login/register`; `getUserIdByToken(db, token, nowIso)` signature identical in Tasks 3, 8. ✓
