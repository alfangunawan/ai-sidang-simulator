# Auth + Multi-User Isolation — Design

**Date:** 2026-07-27
**Status:** Approved (design), pending implementation plan

## Goal

Add username/password auth (register + login + logout) so each user's data —
sessions, turns, uploaded documents, usage, and LLM/TTS/STT settings including
API keys — is private to that user and persists securely across visits. Today
the app is single-tenant: all data is global and unprotected.

## Decisions (locked)

- **Multi-user, full isolation.** Every user has their own sessions, documents,
  usage history, and settings (including their own API keys). No user can see
  another's data.
- **Open registration.** Anyone can register. API keys are per-user, so cost
  risk is low.
- **Identifier:** username + password. No email, no verification, no automated
  password reset (reset is manual/DB-level for now — YAGNI).
- **Zero new dependencies.** Auth built on Node stdlib (`crypto`).

## Approach

Stdlib-only session auth. Rejected alternatives: JWT + bcrypt (two deps, logout
needs a token blocklist), auth libraries like Lucia/Passport (overkill for
username+password).

| Concern | Choice |
|---|---|
| Password hashing | `crypto.scrypt` (N=16384) → store `salt:hash` hex; verify with `timingSafeEqual` |
| Session | opaque token `randomBytes(32).toString('hex')`, row in `auth_tokens`, 30-day expiry |
| Transport | httpOnly cookie, `SameSite=Lax`, `Path=/`, `Secure` when request is https (via `X-Forwarded-Proto` from nginx) |
| Logout | delete the token row |
| Data isolation | `user_id` column on scoped tables + a per-user `user_settings` table |

Same-origin in production (nginx serves the SPA and `/api` on one domain), so
the cookie is sent automatically with no CORS credential dance. In dev the Vite
proxy keeps requests same-origin (`localhost:5173`).

## Schema changes

New tables:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- "salt:hash" hex
  created_at TEXT NOT NULL
);

CREATE TABLE auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Add `user_id INTEGER` (via the existing `addColumnIfMissing` helper) to:
`sessions`, `documents`, `usage_events`.

Retire the global `settings` table — all config moves to `user_settings`. The
current `sibiru.sqlite` holds only throwaway test data and is wiped on deploy,
so no data migration is written. `addColumnIfMissing` keeps the schema forward-
compatible if the DB already exists.

## Backend

**New files**

- `src/auth.ts` — `hashPassword`, `verifyPassword` (scrypt); `newToken`;
  `setAuthCookie(res, token, secure)` / `clearAuthCookie(res)` /
  `readAuthCookie(req)` (manual `Cookie` header parse — no `cookie-parser` dep).
- `src/repos/users.ts` — `createUser`, `getUserByUsername`, `getUserById`,
  `createToken`, `getUserIdByToken` (returns null if missing/expired),
  `deleteToken`, `purgeExpiredTokens` (best-effort on login).
- `src/routes/auth.ts` —
  - `POST /auth/register` → validate username (3–32 chars, `[a-zA-Z0-9_]`),
    password (min 8), reject duplicate (409), create user, `seedDefaults(userId)`,
    issue token + cookie, return `{ user: { id, username } }`.
  - `POST /auth/login` → verify, issue token + cookie.
  - `POST /auth/logout` → delete token, clear cookie.
  - `GET /auth/me` → `{ user }` or 401.

**Middleware** `requireAuth(db)` — reads cookie token → `getUserIdByToken` →
sets `req.userId`; 401 `{ error: "Silakan login" }` otherwise. Mounted on
`/settings`, `/sessions`, `/skripsi`, `/tts`, `/stt`. `/health` and `/auth/*`
(except `/me`, `/logout`) stay public. `app.set("trust proxy", 1)` so `req.secure`
reflects the nginx TLS termination.

**Repo threading** — add a `userId` parameter to every scoped repo function and
its callers:

- `repos/sessions.ts`: `createSession`, `listSessions`, `sessionExists`,
  `getSessionMeta`, and the turn/close/continue helpers filter by `user_id`.
  Session-scoped routes (`/:id/*`) resolve ownership through `sessionExists(db,
  id, userId)` / `getSessionMeta(db, id, userId)`; a miss returns **404** (not
  403) so existence isn't leaked.
- `repos/documents.ts`: `getActiveDocument(db, userId)`,
  `replaceDocument(db, userId, …)` (deletes only that user's doc first),
  `deleteDocument(db, userId)`.
- `repos/usage.ts`: `recordUsage(db, userId, …)`, `getUsageView(db, userId)`,
  `resetUsage(db, userId)`.
- `repos/settings.ts`: all get/set + `getActiveConfig`, `getLlmKey`,
  `getActiveTtsConfig`, `getSttKey`, `getSettingsView`, `saveSettings`,
  `seedDefaults` take `userId` and read/write `user_settings`.

Encryption of API keys is unchanged (server `ENCRYPTION_KEY` via `crypto.ts`);
keys are just stored under the owning user's rows now.

## Frontend

- `src/pages/AuthPage.tsx` — single screen with a login/register toggle
  (username, password). Calls `/api/auth/login|register`, then loads the app.
- `App.tsx` — on mount `GET /api/auth/me`. `null`/401 → render `AuthPage`;
  otherwise render the app with the current user in context.
- `api.ts` — a shared 401 handler: any API 401 clears auth state and returns to
  `AuthPage` (session expired). Add `login`, `register`, `logout`, `me` calls.
- Header gets a logout button showing the username.

No change to how existing pages call the API — cookies ride along on same-origin
requests.

## Error handling

- Duplicate username → 409 `{ error: "Username sudah dipakai" }`.
- Bad credentials → 401 `{ error: "Username atau password salah" }` (same
  message for unknown user and wrong password — no user enumeration).
- Weak/invalid input → 400 with a specific message.
- Expired/absent token on protected route → 401 → frontend routes to login.
- Ownership miss on a session id → 404.

## Testing

- `auth.test.ts`: scrypt hash → verify round-trip (correct + wrong password);
  token expiry (`getUserIdByToken` returns null past `expires_at`).
- One route/integration test (supertest): register → me (200, scoped) →
  create session → second user cannot read the first user's session (404) →
  logout → me (401).

## Deploy

1. `git` merge to `main`.
2. Stop backend, **delete `backend/data/sibiru.sqlite`** (test data only).
3. `npm run build` (backend) + `npm run build` (frontend).
4. `pm2 restart sidang-backend`; nginx unchanged.

## Out of scope (YAGNI)

Email, password reset flow, roles/admin, rate limiting on login, "remember me"
vs session cookies, account deletion UI. Add when actually needed.
