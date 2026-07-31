# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a founder/ops admin panel at `/admin` that lists users, sessions, and access codes; suspends and deletes users; and edits the examiner question bank and personas — with every guard enforced server-side.

**Architecture:** Admin status is a `users.is_admin` column read by a `requireAdmin` middleware that composes after the existing `requireAuth`. A new `/admin` Express router owns all cross-user queries in `repos/admin.ts`, leaving every existing `WHERE user_id = ?` repo untouched. The frontend branches on `window.location.pathname` in `App.tsx` — no router library — and renders a self-contained `pages/admin/` shell built from the `components/ui/` primitives already in the repo.

**Tech Stack:** Express 4 + better-sqlite3 (ESM, `.js` import suffixes) · React 18 + Vite 6 + Tailwind v4 + Radix · vitest + supertest (backend) · vitest + @testing-library/react (frontend)

Spec: `docs/superpowers/specs/2026-07-31-admin-dashboard-design.md`

## Global Constraints

- **Zero new npm dependencies.** No router, no chart library, no state library, no shadcn `sidebar` block. Everything is built from `frontend/src/components/ui/` as it exists today.
- **Backend is ESM.** Every relative import ends in `.js` even for `.ts` sources (e.g. `import { openDb } from "../src/db.js"`).
- **All user-facing copy is Indonesian.** Error strings returned by the API are Indonesian sentences, matching `"Silakan login"`, `"Username sudah dipakai"`.
- **Admin endpoints never call `decrypt()`.** Key presence is reported as a boolean only.
- **Schema changes use `addColumnIfMissing`** in `backend/src/db.ts` for columns and `CREATE TABLE IF NOT EXISTS` inside the `MIGRATION` string for tables. No separate migration runner.
- **Run backend tests with** `cd backend && npx vitest run <file>`; frontend with `cd frontend && npx vitest run <file>`.
- **Commit after every task.** Conventional Commits, subject ≤ 50 chars.
- **"Append to `<file>`" means append the declarations.** Any `import` shown in an append block belongs at the top of that file with the existing imports, merged into an existing import statement from the same module where one exists.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `backend/src/repos/admin.ts` | Every cross-user aggregate query. The only place unscoped SQL lives. |
| `backend/src/routes/admin.ts` | The `/admin/*` router; validation and guards. |
| `backend/src/repos/questions.ts` | Read/replace/seed `question_bank`. |
| `backend/src/repos/personas.ts` | Read/write/seed `personas`. |
| `backend/src/personas.ts` | Canonical persona seed data (moved server-side). |
| `backend/scripts/grant-admin.ts` | One-off CLI to make the first admin. |

**Backend — modified**

| File | Change |
|---|---|
| `backend/src/db.ts` | `+users.is_admin`, `+users.suspended`, `+question_bank`, `+personas` tables |
| `backend/src/repos/users.ts` | `+isAdmin`, `+setAdmin`, `+countAdmins`, `+isSuspended`, `+setSuspended`, `+getUserFlags` |
| `backend/src/routes/auth.ts` | suspension guard in `requireAuth` + `/auth/login`; `+requireAdmin`; `/auth/me` reuses `requireAuth` |
| `backend/src/app.ts` | mount `/admin` |
| `backend/src/questionBank.ts` | `buildPhaseBlock` takes an optional bank argument |
| `backend/src/routes/sessions.ts:120` | pass the DB-backed bank into `buildPhaseBlock` |
| `backend/src/routes/settings.ts` | `+GET /settings/personas` |

**Frontend — created**

| File | Responsibility |
|---|---|
| `frontend/src/pages/admin/AdminApp.tsx` | shell: `<aside>` nav + section state |
| `frontend/src/pages/admin/Overview.tsx` | stat cards + 14-day signup bars |
| `frontend/src/pages/admin/Users.tsx` | user table, detail dialog, suspend/admin/delete |
| `frontend/src/pages/admin/Sessions.tsx` | session table + transcript dialog |
| `frontend/src/pages/admin/Codes.tsx` | collaborations, members, kick |
| `frontend/src/pages/admin/Questions.tsx` | per-phase question editor |
| `frontend/src/pages/admin/Personas.tsx` | persona table + edit dialog |
| `frontend/src/adminApi.ts` | admin fetch wrappers |

**Frontend — modified**

| File | Change |
|---|---|
| `frontend/src/App.tsx` | `/admin` branch; hold `personas` state; pass to `SetupModal` + `SessionPage` |
| `frontend/src/api.ts` | export `jsonOrThrow` for `adminApi.ts`; `+getPersonas` |
| `frontend/src/types.ts` | `+User.is_admin`; `+Admin*` types |
| `frontend/src/personas.ts` | `personaFor` takes the persona list |
| `frontend/src/components/SetupModal.tsx` | take `personas` prop instead of importing `PERSONAS` |
| `frontend/src/pages/SessionPage.tsx` | take `personas` prop |

---

## Task 1: Admin flag and `requireAdmin`

**Files:**
- Modify: `backend/src/db.ts:118-131`
- Modify: `backend/src/repos/users.ts`
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/test/admin.gate.test.ts` (create)

**Interfaces:**
- Consumes: `openDb`, `buildApp`, `requireAuth` (existing)
- Produces:
  - `isAdmin(db, userId): boolean`
  - `setAdmin(db, userId, value: 0 | 1): void`
  - `countAdmins(db): number`
  - `requireAdmin(db): RequestHandler`
  - `GET /auth/me` → `{ user: { id, username, is_admin: boolean } }`

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin, isAdmin, countAdmins, getUserByUsername } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("admin flag", () => {
  it("defaults to 0 and flips with setAdmin", () => {
    const { db, app } = ctx();
    return reg(app, "alfan").then(({ id }) => {
      expect(isAdmin(db, id)).toBe(false);
      expect(countAdmins(db)).toBe(0);
      setAdmin(db, id, 1);
      expect(isAdmin(db, id)).toBe(true);
      expect(countAdmins(db)).toBe(1);
    });
  });

  // Ikatannya ke user_id, bukan username: ganti username tidak boleh
  // mencabut atau memindahkan hak admin.
  it("survives a username change", () => {
    const { db, app } = ctx();
    return reg(app, "alfan").then(({ id }) => {
      setAdmin(db, id, 1);
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run("alfan2", id);
      expect(isAdmin(db, id)).toBe(true);
      expect(getUserByUsername(db, "alfan")).toBeNull();
    });
  });
});

describe("/auth/me exposes is_admin", () => {
  it("reports false for a plain user and true for an admin", async () => {
    const { db, app } = ctx();
    const u = await reg(app, "alfan");
    let me = await u.agent.get("/auth/me").expect(200);
    expect(me.body.user.is_admin).toBe(false);

    setAdmin(db, u.id, 1);
    me = await u.agent.get("/auth/me").expect(200);
    expect(me.body.user).toMatchObject({ id: u.id, username: "alfan", is_admin: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.gate.test.ts`
Expected: FAIL — `setAdmin` / `isAdmin` / `countAdmins` are not exported from `repos/users.js`.

- [ ] **Step 3: Add the column**

In `backend/src/db.ts`, inside `openDb`, after the existing `addColumnIfMissing` calls:

```ts
  addColumnIfMissing(db, "users", "is_admin", "is_admin INTEGER NOT NULL DEFAULT 0");
```

- [ ] **Step 4: Add the repo functions**

Append to `backend/src/repos/users.ts`:

```ts
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
```

Then widen `getUserById` so `/auth/me` can report the flag without a second query:

```ts
export function getUserById(
  db: Database.Database,
  id: number,
): { id: number; username: string; is_admin: boolean } | null {
  const row = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(id) as
    | { id: number; username: string; is_admin: number }
    | undefined;
  return row ? { id: row.id, username: row.username, is_admin: row.is_admin === 1 } : null;
}
```

- [ ] **Step 5: Add `requireAdmin`**

In `backend/src/routes/auth.ts`, extend the import from `../repos/users.js` with `isAdmin`, and add below `requireAuth`:

```ts
/**
 * Pasang SESUDAH requireAuth. Gerbangnya membaca kolom `users.is_admin` lewat
 * `req.userId` — terikat ke id, bukan username, supaya ganti username tidak
 * diam-diam mencabut atau memindahkan hak admin.
 */
export function requireAdmin(db: Database.Database): RequestHandler {
  return (req, res, next) => {
    if (!isAdmin(db, req.userId!)) return res.status(403).json({ error: "Khusus admin" });
    next();
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.gate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the whole backend suite for regressions**

Run: `cd backend && npx vitest run`
Expected: PASS. `getUserById` gained a field; `routes/collab.ts:31` uses only `.username`, so it is unaffected.

- [ ] **Step 8: Commit**

```bash
git add backend/src/db.ts backend/src/repos/users.ts backend/src/routes/auth.ts backend/test/admin.gate.test.ts
git commit -m "feat(admin): gate admin on a user_id-bound flag"
```

---

## Task 2: `grant-admin` bootstrap script

**Files:**
- Create: `backend/scripts/grant-admin.ts`
- Test: `backend/test/admin.gate.test.ts` (extend)

**Interfaces:**
- Consumes: `setAdmin`, `getUserByUsername`, `countAdmins` (Task 1)
- Produces: `grantAdmin(db, username): { ok: true; id: number } | { ok: false; reason: "not_found" }`

- [ ] **Step 1: Write the failing test**

Append to `backend/test/admin.gate.test.ts`:

```ts
import { grantAdmin } from "../scripts/grant-admin.js";

describe("grant-admin script", () => {
  it("promotes an existing user and reports an unknown one", async () => {
    const { db, app } = ctx();
    const u = await reg(app, "alfan");

    expect(grantAdmin(db, "nobody")).toEqual({ ok: false, reason: "not_found" });
    expect(grantAdmin(db, "alfan")).toEqual({ ok: true, id: u.id });
    expect(isAdmin(db, u.id)).toBe(true);

    // Idempoten: menjalankannya dua kali tidak menggandakan apa pun.
    expect(grantAdmin(db, "alfan")).toEqual({ ok: true, id: u.id });
    expect(countAdmins(db)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.gate.test.ts`
Expected: FAIL — cannot resolve `../scripts/grant-admin.js`.

- [ ] **Step 3: Write the script**

Create `backend/scripts/grant-admin.ts`:

```ts
/**
 * Menjadikan seorang pengguna admin. Admin berikutnya dibuat lewat panel,
 * tapi yang pertama harus dari sini — panelnya sendiri butuh admin untuk dibuka.
 *
 *   npx tsx scripts/grant-admin.ts <username> [path/ke/sibiru.sqlite]
 */
import Database from "better-sqlite3";
import { openDb } from "../src/db.js";
import { getUserByUsername, setAdmin } from "../src/repos/users.js";

export function grantAdmin(
  db: Database.Database,
  username: string,
): { ok: true; id: number } | { ok: false; reason: "not_found" } {
  const user = getUserByUsername(db, username);
  if (!user) return { ok: false, reason: "not_found" };
  setAdmin(db, user.id, 1);
  return { ok: true, id: user.id };
}

function main(): void {
  const [username, path = "data/sibiru.sqlite"] = process.argv.slice(2);
  if (!username) {
    console.error("Pakai: npx tsx scripts/grant-admin.ts <username> [db]");
    process.exit(1);
  }
  const result = grantAdmin(openDb(path), username);
  if (!result.ok) {
    console.error(`Pengguna "${username}" tidak ditemukan di ${path}`);
    process.exit(1);
  }
  console.log(`OK — ${username} (id ${result.id}) sekarang admin`);
}

// Hanya jalan sebagai CLI; saat di-import tes, hanya fungsinya yang dipakai.
if (process.argv[1]?.endsWith("grant-admin.ts")) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/grant-admin.ts backend/test/admin.gate.test.ts
git commit -m "feat(admin): add grant-admin bootstrap script"
```

---

## Task 3: Overview endpoint

**Files:**
- Create: `backend/src/repos/admin.ts`
- Create: `backend/src/routes/admin.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/admin.overview.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin` (Task 1)
- Produces:
  - `getOverview(db, todayIso: string): AdminOverview`
  - `adminRouter(db): Router`
  - `GET /admin/overview`

```ts
export interface AdminOverview {
  users: number;
  sessions: number;
  documents: number;
  turns: number;
  cost_usd: number;
  tokens: number;
  top_spenders: { user_id: number; username: string; cost_usd: number; tokens: number }[];
  signups: { day: string; count: number }[]; // exactly 14, oldest first, zero-filled
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.overview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { getOverview } from "../src/repos/admin.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /admin/overview", () => {
  it("is 403 for a plain user and 401 without a cookie", async () => {
    const { app } = ctx();
    await request(app).get("/admin/overview").expect(401);
    const u = await reg(app, "biasa");
    await u.agent.get("/admin/overview").expect(403);
  });

  it("counts users, sessions and spend across everyone", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const other = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await other.agent.post("/sessions").send({}).expect(200);
    db.prepare(
      `INSERT INTO usage_events
         (user_id, key_owner_user_id, created_at, provider, model, kind,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, 'openai_compat', 'x', 'turn', 100, 40, 0, 0, 0.25)`,
    ).run(other.id, admin.id, "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/overview").expect(200);
    expect(body.users).toBe(2);
    expect(body.sessions).toBe(1);
    expect(body.cost_usd).toBeCloseTo(0.25);
    expect(body.tokens).toBe(140);
    expect(body.top_spenders[0]).toMatchObject({ username: "budi", cost_usd: 0.25 });
  });
});

describe("getOverview signups", () => {
  it("returns exactly 14 days, oldest first, with gaps zero-filled", () => {
    const { db } = ctx();
    const at = (d: string) =>
      db
        .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)")
        .run(`u${d}`, "x:y", d);
    at("2026-07-31T09:00:00.000Z");
    at("2026-07-31T10:00:00.000Z");
    at("2026-07-25T10:00:00.000Z");
    at("2026-06-01T10:00:00.000Z"); // di luar jendela

    const days = getOverview(db, "2026-07-31T23:00:00.000Z").signups;
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe("2026-07-18");
    expect(days.at(-1)).toEqual({ day: "2026-07-31", count: 2 });
    expect(days.find((d) => d.day === "2026-07-25")!.count).toBe(1);
    expect(days.find((d) => d.day === "2026-07-26")!.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.overview.test.ts`
Expected: FAIL — cannot resolve `../src/repos/admin.js`.

- [ ] **Step 3: Write the repo**

Create `backend/src/repos/admin.ts`:

```ts
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
```

- [ ] **Step 4: Write the router**

Create `backend/src/routes/admin.ts`:

```ts
import { Router } from "express";
import type Database from "better-sqlite3";
import { getOverview } from "../repos/admin.js";

export function adminRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.get("/overview", (_req, res) => {
    res.json(getOverview(db, now()));
  });

  return r;
}
```

- [ ] **Step 5: Mount it**

In `backend/src/app.ts`, add the imports and the mount line after `/collab`:

```ts
import { authRouter, requireAuth, requireAdmin } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
```

```ts
  app.use("/admin", auth, requireAdmin(db), adminRouter(db));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.overview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/repos/admin.ts backend/src/routes/admin.ts backend/src/app.ts backend/test/admin.overview.test.ts
git commit -m "feat(admin): add cross-user overview endpoint"
```

---

## Task 4: Admin shell and Overview page

**Files:**
- Create: `frontend/src/adminApi.ts`
- Create: `frontend/src/pages/admin/AdminApp.tsx`
- Create: `frontend/src/pages/admin/Overview.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/types.ts:1`
- Modify: `frontend/src/App.tsx:149-156`
- Test: `frontend/src/pages/admin/AdminApp.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /admin/overview` (Task 3), `GET /auth/me` `is_admin` (Task 1)
- Produces:
  - `types.ts`: `User { id, username, is_admin }`, `AdminOverview`
  - `adminApi.ts`: `getOverview(): Promise<AdminOverview>`
  - `AdminApp({ user }: { user: User })`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/AdminApp.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminApp } from "./AdminApp.js";
import * as adminApi from "../../adminApi.js";

const OVERVIEW = {
  users: 12,
  sessions: 34,
  documents: 9,
  turns: 210,
  cost_usd: 1.5,
  tokens: 4000,
  top_spenders: [{ user_id: 2, username: "budi", cost_usd: 1.5, tokens: 4000 }],
  signups: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-07-${String(i + 18).padStart(2, "0")}`,
    count: i,
  })),
};

describe("AdminApp", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getOverview").mockResolvedValue(OVERVIEW as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the section nav and the overview counters", async () => {
    render(<AdminApp user={{ id: 1, username: "alfan", is_admin: true }} />);
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pengguna" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ringkasan" })).toBeTruthy();
  });

  // Angka biaya tidak boleh dibaca sebagai kebenaran: provider Claude langsung
  // selalu menulis cost_usd 0, jadi labelnya harus menyebut batasannya.
  it("labels the cost figure as router-only", async () => {
    render(<AdminApp user={{ id: 1, username: "alfan", is_admin: true }} />);
    expect(await screen.findByText(/router saja/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/AdminApp.test.tsx`
Expected: FAIL — cannot resolve `./AdminApp.js`.

- [ ] **Step 3: Add the types**

In `frontend/src/types.ts`, replace line 1 and append:

```ts
export interface User { id: number; username: string; is_admin: boolean; }
```

```ts
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
```

- [ ] **Step 4: Export the fetch helper**

In `frontend/src/api.ts`, change `async function jsonOrThrow` to `export async function jsonOrThrow`. It already routes 401s to the shared handler, so `adminApi.ts` inherits the sign-out behaviour for free.

- [ ] **Step 5: Write the admin API client**

Create `frontend/src/adminApi.ts`:

```ts
import { jsonOrThrow } from "./api.js";
import type { AdminOverview } from "./types.js";

export async function getOverview(): Promise<AdminOverview> {
  return jsonOrThrow(await fetch("/api/admin/overview"));
}
```

- [ ] **Step 6: Write the Overview page**

Create `frontend/src/pages/admin/Overview.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getOverview } from "../../adminApi.js";
import type { AdminOverview } from "../../types.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOverview().then(setData).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  const peak = Math.max(1, ...data.signups.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pengguna" value={data.users} />
        <Stat label="Sesi sidang" value={data.sessions} />
        <Stat label="Naskah diunggah" value={data.documents} />
        <Stat label="Token terpakai" value={data.tokens.toLocaleString("id-ID")} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Biaya (router saja)</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            ${data.cost_usd.toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Provider Claude langsung menulis cost_usd 0, jadi angka ini hanya
              mencakup pemakaian lewat router OpenAI-compatible. */}
          <p className="text-xs text-muted-foreground">
            Hanya pemakaian lewat router OpenAI-compatible yang melaporkan biaya.
            Pengguna Claude langsung selalu tercatat $0.00 — pakai kolom token
            sebagai ukuran yang jujur.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendaftar 14 hari terakhir</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-1">
            {data.signups.map((s) => (
              <div key={s.day} className="flex-1" title={`${s.day}: ${s.count}`}>
                <div
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${(s.count / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.signups[0].day} → {data.signups.at(-1)!.day}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Write the shell**

Create `frontend/src/pages/admin/AdminApp.tsx`:

```tsx
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Overview } from "./Overview.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "../../types.js";

type Section = "ringkasan" | "pengguna" | "sesi" | "kode" | "pertanyaan" | "persona";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "pengguna", label: "Pengguna" },
  { key: "sesi", label: "Sesi" },
  { key: "kode", label: "Kode Akses" },
  { key: "pertanyaan", label: "Bank Pertanyaan" },
  { key: "persona", label: "Persona" },
];

/**
 * Navigasi antar bagian pakai state, bukan URL. Deep link seperti
 * /admin/users/42 sengaja belum didukung — tambahkan kalau debug jadi repot.
 */
export function AdminApp({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("ringkasan");

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <h1 className="font-serif text-lg font-semibold tracking-tight">SiBiru Admin</h1>
          <span className="ml-auto text-sm text-muted-foreground">{user.username}</span>
          <Button variant="ghost" size="sm" onClick={() => window.location.assign("/")}>
            <ArrowLeft />
            Aplikasi
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-48 md:shrink-0">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-current={section === s.key ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  section === s.key
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {section === "ringkasan" && <Overview />}
          {section !== "ringkasan" && (
            <p className="text-sm text-muted-foreground">Bagian ini belum dibuat.</p>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Wire the `/admin` branch**

In `frontend/src/App.tsx`, import `AdminApp`, then insert immediately after the existing `if (!user) { ... }` block (currently ending at line 156):

```tsx
  // Panel admin punya kerangka sendiri: tab mahasiswa tidak berlaku di sini.
  // Ditaruh SESUDAH gerbang login supaya pengunjung /admin yang belum masuk
  // tetap melihat halaman login, bukan lemparan balik yang membingungkan.
  if (window.location.pathname.startsWith("/admin")) {
    if (!user.is_admin) {
      window.location.replace("/");
      return null;
    }
    return <AdminApp user={user} />;
  }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/AdminApp.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 10: Run the whole frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS. `User` gained `is_admin`; fix any test fixture that constructs a `User` literal by adding `is_admin: false`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/adminApi.ts frontend/src/pages/admin frontend/src/api.ts frontend/src/types.ts frontend/src/App.tsx
git commit -m "feat(admin): add /admin shell and overview page"
```

---

## Task 5: Account suspension

**Files:**
- Modify: `backend/src/db.ts`
- Modify: `backend/src/repos/users.ts`
- Modify: `backend/src/routes/auth.ts:19-26`, `:59-68`, `:77-83`
- Test: `backend/test/admin.suspend.test.ts` (create)

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `isSuspended(db, userId): boolean`
  - `setSuspended(db, userId, value: 0 | 1): void`
  - `requireAuth` → 403 `{ error: "Akun ditangguhkan" }` for suspended users
  - `POST /auth/login` → 403 for suspended users

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.suspend.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setSuspended, isSuspended } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}

describe("suspension", () => {
  it("blocks every authenticated route through requireAuth, not just one", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);

    await agent.get("/sessions").expect(200);
    await agent.get("/settings").expect(200);

    setSuspended(db, body.user.id, 1);
    expect(isSuspended(db, body.user.id)).toBe(true);

    // Penjaganya duduk di requireAuth, jadi semua route ikut tanpa diubah.
    await agent.get("/sessions").expect(403);
    await agent.get("/settings").expect(403);
    const me = await agent.get("/auth/me").expect(403);
    expect(me.body.error).toBe("Akun ditangguhkan");
  });

  it("refuses a fresh login so a suspended user cannot mint a new token", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);
    setSuspended(db, body.user.id, 1);

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "budi", password: "password1" })
      .expect(403);
    expect(res.body.error).toBe("Akun ditangguhkan");
  });

  it("is reversible and leaves the user's data intact", async () => {
    const { db, app } = ctx();
    const agent = request.agent(app);
    const { body } = await agent
      .post("/auth/register")
      .send({ username: "budi", password: "password1" })
      .expect(200);
    await agent.post("/sessions").send({}).expect(200);

    setSuspended(db, body.user.id, 1);
    await agent.get("/sessions").expect(403);
    setSuspended(db, body.user.id, 0);
    const back = await agent.get("/sessions").expect(200);
    expect(back.body.sessions).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.suspend.test.ts`
Expected: FAIL — `setSuspended` is not exported.

- [ ] **Step 3: Add the column**

In `backend/src/db.ts`, next to the `is_admin` line:

```ts
  addColumnIfMissing(db, "users", "suspended", "suspended INTEGER NOT NULL DEFAULT 0");
```

- [ ] **Step 4: Add the repo functions**

Append to `backend/src/repos/users.ts`:

```ts
export function isSuspended(db: Database.Database, userId: number): boolean {
  const row = db.prepare("SELECT suspended FROM users WHERE id = ?").get(userId) as
    | { suspended: number }
    | undefined;
  return row?.suspended === 1;
}

export function setSuspended(db: Database.Database, userId: number, value: 0 | 1): void {
  db.prepare("UPDATE users SET suspended = ? WHERE id = ?").run(value, userId);
}
```

- [ ] **Step 5: Guard `requireAuth`**

In `backend/src/routes/auth.ts`, extend the `../repos/users.js` import with `isSuspended`, then change the body of `requireAuth`:

```ts
  return (req, res, next) => {
    const token = readAuthCookie(req);
    const userId = token ? getUserIdByToken(db, token, now()) : null;
    if (!userId) return res.status(401).json({ error: "Silakan login" });
    // Satu penjaga di sini menutup /sessions, /skripsi, /tts, /stt, /settings,
    // /collab dan apa pun yang ditambahkan nanti — jangan disalin per route.
    if (isSuspended(db, userId)) return res.status(403).json({ error: "Akun ditangguhkan" });
    req.userId = userId;
    next();
  };
```

- [ ] **Step 6: Guard login and route `/auth/me` through `requireAuth`**

In the same file, in `POST /auth/login`, after the password check:

```ts
    if (isSuspended(db, user.id)) {
      return res.status(403).json({ error: "Akun ditangguhkan" });
    }
```

Then replace the whole `/auth/me` handler — it duplicated the token logic, which is exactly how a guard gets missed on one path:

```ts
  r.get("/me", requireAuth(db, now), (req, res) => {
    const user = getUserById(db, req.userId!);
    if (!user) return res.status(401).json({ error: "Belum login" });
    res.json({ user });
  });
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.suspend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Run the whole backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS. `/auth/me` still answers 401 when no cookie is present, so `test/auth-routes.test.ts` is unaffected.

- [ ] **Step 9: Commit**

```bash
git add backend/src/db.ts backend/src/repos/users.ts backend/src/routes/auth.ts backend/test/admin.suspend.test.ts
git commit -m "feat(admin): suspend accounts at the auth boundary"
```

---

## Task 6: User list and detail endpoints

**Files:**
- Modify: `backend/src/repos/admin.ts`
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.users.test.ts` (create)

**Interfaces:**
- Consumes: `getSettingsView` (`repos/settings.ts:54`), `listMembers`/`getMembership` (`repos/collab.ts`)
- Produces:
  - `listUsers(db): AdminUserRow[]`
  - `getUserDetail(db, userId, key): AdminUserDetail | null`
  - `GET /admin/users`, `GET /admin/users/:id`

```ts
export interface AdminUserRow {
  id: number; username: string; created_at: string;
  suspended: boolean; is_admin: boolean;
  sessions: number; documents: number;
  cost_usd: number; tokens: number;
  key_owner: string | null;   // username of the host whose key they borrow
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.users.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /admin/users", () => {
  it("lists everyone with counts, spend, and who lends them a key", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);
    await budi.agent.post("/sessions").send({}).expect(200);

    const { body } = await admin.agent.get("/admin/users").expect(200);
    const row = body.users.find((u: any) => u.username === "budi");
    expect(row).toMatchObject({
      sessions: 1,
      suspended: false,
      is_admin: false,
      key_owner: "alfan",
    });
    expect(body.users.find((u: any) => u.username === "alfan")).toMatchObject({
      is_admin: true,
      key_owner: null,
    });
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const u = await reg(app, "budi");
    await u.agent.get("/admin/users").expect(403);
  });
});

describe("GET /admin/users/:id", () => {
  // Panel admin yang bisa membaca API key orang lain adalah pintu pencurian
  // kredensial demi kenyamanan satu orang. Yang boleh keluar hanya boolean.
  it("reports key presence but never key material", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await budi.agent
      .put("/settings")
      .send({ provider: "claude", api_key: "sk-ant-SECRETVALUE" })
      .expect(200);

    const { body, text } = await admin.agent.get(`/admin/users/${budi.id}`).expect(200);
    expect(body.settings.has_api_key).toBe(true);
    expect(body.settings).not.toHaveProperty("api_key");
    expect(text).not.toContain("SECRETVALUE");
  });

  it("404s for an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.get("/admin/users/9999").expect(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.users.test.ts`
Expected: FAIL — 404 on `/admin/users`.

- [ ] **Step 3: Add the repo functions**

Append to `backend/src/repos/admin.ts`:

```ts
import { getSettingsView } from "./settings.js";

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
```

- [ ] **Step 4: Add the routes**

In `backend/src/routes/admin.ts`, extend the import and add:

```ts
import { getOverview, listUsers, getUserDetail } from "../repos/admin.js";
```

```ts
  r.get("/users", (_req, res) => {
    res.json({ users: listUsers(db) });
  });

  r.get("/users/:id", (req, res) => {
    const detail = getUserDetail(db, Number(req.params.id));
    if (!detail) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    res.json(detail);
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.users.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repos/admin.ts backend/src/routes/admin.ts backend/test/admin.users.test.ts
git commit -m "feat(admin): list users and expose safe detail"
```

---

## Task 7: Suspend / promote endpoint with guards

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.guards.test.ts` (create)

**Interfaces:**
- Consumes: `setSuspended`, `setAdmin`, `countAdmins`, `isAdmin`, `getUserById`
- Produces: `PATCH /admin/users/:id` accepting `{ suspended?: boolean; is_admin?: boolean }`

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin, isAdmin, isSuspended, countAdmins } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("PATCH /admin/users/:id", () => {
  it("suspends and unsuspends another user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.patch(`/admin/users/${budi.id}`).send({ suspended: true }).expect(200);
    expect(isSuspended(db, budi.id)).toBe(true);
    await admin.agent.patch(`/admin/users/${budi.id}`).send({ suspended: false }).expect(200);
    expect(isSuspended(db, budi.id)).toBe(false);
  });

  it("promotes a second admin", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.patch(`/admin/users/${budi.id}`).send({ is_admin: true }).expect(200);
    expect(isAdmin(db, budi.id)).toBe(true);
    expect(countAdmins(db)).toBe(2);
  });

  // Satu salah klik tidak boleh mengunci founder keluar dari panelnya sendiri.
  it("refuses self-demotion and self-suspension", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const a = await admin.agent.patch(`/admin/users/${admin.id}`).send({ is_admin: false }).expect(400);
    expect(a.body.error).toMatch(/diri sendiri/i);
    await admin.agent.patch(`/admin/users/${admin.id}`).send({ suspended: true }).expect(400);
    expect(isAdmin(db, admin.id)).toBe(true);
    expect(isSuspended(db, admin.id)).toBe(false);
  });

  // Jalur dua-admin menuju kunci-keluar yang sama.
  it("refuses to demote the last admin", async () => {
    const { db, app } = ctx();
    const one = await reg(app, "alfan");
    const two = await reg(app, "budi");
    setAdmin(db, one.id, 1);
    setAdmin(db, two.id, 1);

    // two mencabut one: masih ada dua, jadi boleh.
    await two.agent.patch(`/admin/users/${one.id}`).send({ is_admin: false }).expect(200);
    expect(countAdmins(db)).toBe(1);
    // Sekarang two satu-satunya, dan tidak bisa dicabut lewat jalur mana pun.
    const res = await two.agent.patch(`/admin/users/${two.id}`).send({ is_admin: false }).expect(400);
    expect(res.body.error).toBeTruthy();
    expect(countAdmins(db)).toBe(1);
  });

  it("404s for an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.patch("/admin/users/9999").send({ suspended: true }).expect(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.guards.test.ts`
Expected: FAIL — 404 on `PATCH /admin/users/:id`.

- [ ] **Step 3: Implement the route**

In `backend/src/routes/admin.ts`, add the import and handler:

```ts
import { getUserById, setAdmin, setSuspended, countAdmins, isAdmin } from "../repos/users.js";
```

```ts
  /**
   * Pagarnya di sini, bukan di UI: menyembunyikan tombol bukan batas keamanan.
   * Dua aturan menutup dua jalur ke kunci-keluar yang sama — mencabut diri
   * sendiri, dan mencabut admin terakhir yang tersisa.
   */
  r.patch("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    const target = getUserById(db, id);
    if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });

    const self = id === req.userId;
    const { suspended, is_admin } = req.body ?? {};

    if (self && (suspended === true || is_admin === false)) {
      return res.status(400).json({ error: "Tidak bisa menangguhkan atau mencabut diri sendiri" });
    }
    if (is_admin === false && isAdmin(db, id) && countAdmins(db) <= 1) {
      return res.status(400).json({ error: "Admin terakhir tidak bisa dicabut" });
    }

    if (suspended !== undefined) setSuspended(db, id, suspended ? 1 : 0);
    if (is_admin !== undefined) setAdmin(db, id, is_admin ? 1 : 0);
    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.guards.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.ts backend/test/admin.guards.test.ts
git commit -m "feat(admin): guard suspend and promote actions"
```

---

## Task 8: Delete a user without orphaning data

**Files:**
- Modify: `backend/src/repos/admin.ts`
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.delete.test.ts` (create)

**Interfaces:**
- Produces:
  - `deleteUserCompletely(db, userId): void`
  - `DELETE /admin/users/:id`

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.delete.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}
function seed(db: any, userId: number, tag: string) {
  db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
    `s-${tag}`, userId, "2026-07-30T00:00:00.000Z", null,
  );
  db.prepare(
    "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
  ).run(`s-${tag}`, 1, "examiner", "halo", "2026-07-30T00:00:00.000Z");
  const doc = db
    .prepare(
      "INSERT INTO documents (user_id, filename, full_text, char_count, created_at) VALUES (?,?,?,?,?)",
    )
    .run(userId, `${tag}.pdf`, "isi", 3, "2026-07-30T00:00:00.000Z");
  db.prepare("INSERT INTO chunks (document_id, idx, text) VALUES (?,?,?)").run(
    doc.lastInsertRowid, 0, "isi",
  );
  db.prepare(
    `INSERT INTO usage_events
       (user_id, key_owner_user_id, created_at, provider, model, kind,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?, ?, ?, 'x', 'y', 'turn', 1, 1, 0, 0, 0.5)`,
  ).run(userId, userId, "2026-07-30T00:00:00.000Z");
}
const rows = (db: any, sql: string, ...p: any[]) =>
  (db.prepare(sql).get(...p) as { c: number }).c;

describe("DELETE /admin/users/:id", () => {
  // sessions/documents/usage_events memakai user_id yang ditambahkan lewat
  // ALTER TABLE, jadi TIDAK punya foreign key cascade. Tanpa hapus manual,
  // transkrip dan naskah orang menggantung di DB selamanya.
  it("removes every row the user owns, across all six tables", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    seed(db, budi.id, "budi");

    await admin.agent.delete(`/admin/users/${budi.id}`).expect(200);

    expect(rows(db, "SELECT COUNT(*) c FROM users WHERE id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM sessions WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM turns WHERE session_id = 's-budi'")).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM documents WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM chunks")).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM usage_events WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM user_settings WHERE user_id = ?", budi.id)).toBe(0);
    expect(rows(db, "SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ?", budi.id)).toBe(0);
  });

  it("leaves another user's rows untouched", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    const citra = await reg(app, "citra");
    setAdmin(db, admin.id, 1);
    seed(db, budi.id, "budi");
    seed(db, citra.id, "citra");

    await admin.agent.delete(`/admin/users/${budi.id}`).expect(200);

    expect(rows(db, "SELECT COUNT(*) c FROM sessions WHERE user_id = ?", citra.id)).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM turns WHERE session_id = 's-citra'")).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM documents WHERE user_id = ?", citra.id)).toBe(1);
    expect(rows(db, "SELECT COUNT(*) c FROM chunks")).toBe(1);
  });

  it("refuses self-deletion and 404s on an unknown user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.delete(`/admin/users/${admin.id}`).expect(400);
    await admin.agent.delete("/admin/users/9999").expect(404);
    expect(rows(db, "SELECT COUNT(*) c FROM users WHERE id = ?", admin.id)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.delete.test.ts`
Expected: FAIL — 404 on `DELETE /admin/users/:id`.

- [ ] **Step 3: Write the transaction**

Append to `backend/src/repos/admin.ts`:

```ts
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
```

- [ ] **Step 4: Add the route**

In `backend/src/routes/admin.ts`, extend the `../repos/admin.js` import with `deleteUserCompletely` and add:

```ts
  r.delete("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!getUserById(db, id)) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    if (id === req.userId) {
      return res.status(400).json({ error: "Tidak bisa menghapus diri sendiri" });
    }
    deleteUserCompletely(db, id);
    res.json({ ok: true });
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.delete.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repos/admin.ts backend/src/routes/admin.ts backend/test/admin.delete.test.ts
git commit -m "feat(admin): delete a user without orphaning rows"
```

---

## Task 9: Users page

**Files:**
- Create: `frontend/src/pages/admin/Users.tsx`
- Modify: `frontend/src/adminApi.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/pages/admin/AdminApp.tsx`
- Test: `frontend/src/pages/admin/Users.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id`
- Produces:
  - `types.ts`: `AdminUserRow`
  - `adminApi.ts`: `listUsers()`, `patchUser(id, body)`, `deleteUser(id)`
  - `Users({ selfId }: { selfId: number })`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/Users.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Users } from "./Users.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    id: 1, username: "alfan", created_at: "2026-07-01T00:00:00.000Z",
    suspended: false, is_admin: true, sessions: 2, documents: 1,
    cost_usd: 0, tokens: 500, key_owner: null,
  },
  {
    id: 2, username: "budi", created_at: "2026-07-02T00:00:00.000Z",
    suspended: false, is_admin: false, sessions: 5, documents: 1,
    cost_usd: 1.25, tokens: 9000, key_owner: "alfan",
  },
];

describe("Users", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listUsers").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "patchUser").mockResolvedValue(undefined as any);
    vi.spyOn(adminApi, "deleteUser").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders a row per user with who lends them a key", async () => {
    render(<Users selfId={1} />);
    expect(await screen.findByText("budi")).toBeTruthy();
    expect(screen.getByText("alfan (key)")).toBeTruthy();
  });

  it("suspends a user", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("budi");
    fireEvent.click(screen.getByRole("button", { name: "Tangguhkan budi" }));
    await waitFor(() =>
      expect(adminApi.patchUser).toHaveBeenCalledWith(2, { suspended: true }),
    );
  });

  // Hapus itu tak bisa dibatalkan dan membawa serta seluruh transkrip serta
  // naskah orang, jadi tombolnya tidak boleh cukup diklik sekali.
  it("requires the username to be typed before deleting", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("budi");
    fireEvent.click(screen.getByRole("button", { name: "Hapus budi" }));

    const confirm = await screen.findByRole("button", { name: "Hapus permanen" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Ketik username/), { target: { value: "bud" } });
    expect(screen.getByRole("button", { name: "Hapus permanen" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Ketik username/), { target: { value: "budi" } });
    fireEvent.click(screen.getByRole("button", { name: "Hapus permanen" }));
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith(2));
  });

  it("offers no destructive action against yourself", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("alfan");
    expect(screen.queryByRole("button", { name: "Hapus alfan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tangguhkan alfan" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/Users.test.tsx`
Expected: FAIL — cannot resolve `./Users.js`.

- [ ] **Step 3: Add the type and API calls**

Append to `frontend/src/types.ts`:

```ts
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
```

Append to `frontend/src/adminApi.ts`:

```ts
import type { AdminUserRow } from "./types.js";

export async function listUsers(): Promise<AdminUserRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/users"))).users;
}

export async function patchUser(
  id: number,
  body: { suspended?: boolean; is_admin?: boolean },
): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteUser(id: number): Promise<void> {
  await jsonOrThrow(await fetch(`/api/admin/users/${id}`, { method: "DELETE" }));
}
```

- [ ] **Step 4: Write the page**

Create `frontend/src/pages/admin/Users.tsx`:

```tsx
import { useEffect, useState } from "react";
import { listUsers, patchUser, deleteUser } from "../../adminApi.js";
import type { AdminUserRow } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export function Users({ selfId }: { selfId: number }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<AdminUserRow | null>(null);
  const [typed, setTyped] = useState("");

  function reload() {
    listUsers().then(setRows).catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  async function act(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pengguna</TableHead>
              <TableHead className="text-right">Sesi</TableHead>
              <TableHead className="text-right">Token</TableHead>
              <TableHead className="text-right">Biaya*</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const self = u.id === selfId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.username}</span>
                      {u.is_admin && <Badge>admin</Badge>}
                      {u.suspended && <Badge variant="destructive">ditangguhkan</Badge>}
                      {u.key_owner && (
                        <span className="text-xs text-muted-foreground">
                          {u.key_owner} (key)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {u.created_at.slice(0, 10)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.sessions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {u.tokens.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${u.cost_usd.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {/* Aksi merusak terhadap diri sendiri tidak ditawarkan sama
                        sekali; backend juga menolaknya, ini hanya agar tombolnya
                        tidak menggoda. */}
                    {!self && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            act(() => patchUser(u.id, { suspended: !u.suspended }))
                          }
                        >
                          {u.suspended ? `Pulihkan ${u.username}` : `Tangguhkan ${u.username}`}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => act(() => patchUser(u.id, { is_admin: !u.is_admin }))}
                        >
                          {u.is_admin ? `Cabut admin ${u.username}` : `Jadikan admin ${u.username}`}
                        </Button>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => {
                            setTyped("");
                            setDoomed(u);
                          }}
                        >
                          Hapus {u.username}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        *Biaya hanya terisi untuk pemakaian lewat router OpenAI-compatible.
        Pengguna Claude langsung selalu $0.00 — baca kolom token.
      </p>

      <Dialog open={doomed !== null} onOpenChange={(next) => !next && setDoomed(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus {doomed?.username}?</DialogTitle>
            <DialogDescription>
              Semua sesi, transkrip, naskah, dan catatan pemakaian miliknya ikut
              terhapus permanen. Tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="confirm-username">Ketik username untuk memastikan</Label>
            <Input
              id="confirm-username"
              value={typed}
              autoFocus
              className="mt-2"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoomed(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== doomed?.username}
              onClick={() => {
                const id = doomed!.id;
                setDoomed(null);
                act(() => deleteUser(id));
              }}
            >
              Hapus permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the shell**

In `frontend/src/pages/admin/AdminApp.tsx`, import `Users` and replace the placeholder branch:

```tsx
          {section === "ringkasan" && <Overview />}
          {section === "pengguna" && <Users selfId={user.id} />}
          {!["ringkasan", "pengguna"].includes(section) && (
            <p className="text-sm text-muted-foreground">Bagian ini belum dibuat.</p>
          )}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/pages/admin && npm run typecheck`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin frontend/src/adminApi.ts frontend/src/types.ts
git commit -m "feat(admin): add the users page"
```

---

## Task 10: Session list and transcript endpoints

**Files:**
- Modify: `backend/src/repos/admin.ts`
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.sessions.test.ts` (create)

**Interfaces:**
- Produces:
  - `listAllSessions(db, filter: { userId?: number }): AdminSessionRow[]`
  - `getSessionForAdmin(db, id): { session: AdminSessionRow; turns: Turn[]; assessment: unknown } | null`
  - `GET /admin/sessions?user_id=`, `GET /admin/sessions/:id`

```ts
export interface AdminSessionRow {
  id: string; user_id: number; username: string;
  created_at: string; status: string; label: string | null;
  turn_count: number; final_score: number | null;
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.sessions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /admin/sessions", () => {
  it("lists sessions from every user, including ones with no turns yet", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    // Sesi kosong sengaja ikut tampil: sesi yang mandek justru yang perlu dilihat.
    await budi.agent.post("/sessions").send({}).expect(200);
    db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
      "s-full", budi.id, "2026-07-30T00:00:00.000Z", "Sidang 1",
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s-full", 1, "examiner", "Silakan jelaskan.", "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/sessions").expect(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions.every((s: any) => s.username === "budi")).toBe(true);

    const filtered = await admin.agent.get(`/admin/sessions?user_id=${admin.id}`).expect(200);
    expect(filtered.body.sessions).toHaveLength(0);
  });
});

describe("GET /admin/sessions/:id", () => {
  it("returns the transcript of a session belonging to someone else", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    db.prepare("INSERT INTO sessions (id, user_id, created_at, label) VALUES (?,?,?,?)").run(
      "s-x", budi.id, "2026-07-30T00:00:00.000Z", null,
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s-x", 1, "examiner", "Apa rumusan masalahnya?", "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/sessions/s-x").expect(200);
    expect(body.session.username).toBe("budi");
    expect(body.turns[0]).toMatchObject({ role: "examiner", content: "Apa rumusan masalahnya?" });
  });

  it("404s on an unknown session and 403s for a plain user", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await admin.agent.get("/admin/sessions/nope").expect(404);
    await budi.agent.get("/admin/sessions").expect(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.sessions.test.ts`
Expected: FAIL — 404 on `/admin/sessions`.

- [ ] **Step 3: Add the repo functions**

Append to `backend/src/repos/admin.ts`:

```ts
import type { Turn } from "../providers/types.js";

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
```

- [ ] **Step 4: Add the routes**

In `backend/src/routes/admin.ts`, extend the `../repos/admin.js` import with `listAllSessions, getSessionForAdmin` and add:

```ts
  r.get("/sessions", (req, res) => {
    const raw = req.query.user_id;
    const userId = raw === undefined ? undefined : Number(raw);
    res.json({ sessions: listAllSessions(db, { userId }) });
  });

  r.get("/sessions/:id", (req, res) => {
    const found = getSessionForAdmin(db, req.params.id);
    if (!found) return res.status(404).json({ error: "Sesi tidak ditemukan" });
    res.json(found);
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.sessions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repos/admin.ts backend/src/routes/admin.ts backend/test/admin.sessions.test.ts
git commit -m "feat(admin): list all sessions and read transcripts"
```

---

## Task 11: Sessions page

**Files:**
- Create: `frontend/src/pages/admin/Sessions.tsx`
- Modify: `frontend/src/adminApi.ts`, `frontend/src/types.ts`, `frontend/src/pages/admin/AdminApp.tsx`
- Test: `frontend/src/pages/admin/Sessions.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /admin/sessions`, `GET /admin/sessions/:id`
- Produces:
  - `types.ts`: `AdminSessionRow`
  - `adminApi.ts`: `listAllSessions(userId?)`, `getAdminSession(id)`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/Sessions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sessions } from "./Sessions.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    id: "s-1", user_id: 2, username: "budi", created_at: "2026-07-30T00:00:00.000Z",
    status: "closed", label: "Sidang 1", turn_count: 12, final_score: 78,
  },
];

describe("Sessions", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "getAdminSession").mockResolvedValue({
      session: ROWS[0],
      turns: [{ role: "examiner", content: "Apa rumusan masalahnya?" }],
      assessment: null,
    } as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists sessions with their owner and score", async () => {
    render(<Sessions />);
    expect(await screen.findByText("budi")).toBeTruthy();
    expect(screen.getByText("78")).toBeTruthy();
  });

  it("opens the transcript on demand", async () => {
    render(<Sessions />);
    fireEvent.click(await screen.findByRole("button", { name: /Lihat transkrip/ }));
    expect(await screen.findByText("Apa rumusan masalahnya?")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/Sessions.test.tsx`
Expected: FAIL — cannot resolve `./Sessions.js`.

- [ ] **Step 3: Add the type and API calls**

Append to `frontend/src/types.ts`:

```ts
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
```

Append to `frontend/src/adminApi.ts` (extend the existing type import with `AdminSessionRow`, `Turn`, `Assessment`):

```ts
export async function listAllSessions(userId?: number): Promise<AdminSessionRow[]> {
  const q = userId === undefined ? "" : `?user_id=${userId}`;
  return (await jsonOrThrow(await fetch(`/api/admin/sessions${q}`))).sessions;
}

export async function getAdminSession(
  id: string,
): Promise<{ session: AdminSessionRow; turns: Turn[]; assessment: Assessment | null }> {
  return jsonOrThrow(await fetch(`/api/admin/sessions/${id}`));
}
```

- [ ] **Step 4: Write the page**

Create `frontend/src/pages/admin/Sessions.tsx`:

```tsx
import { useEffect, useState } from "react";
import { listAllSessions, getAdminSession } from "../../adminApi.js";
import type { AdminSessionRow, Turn } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export function Sessions() {
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: AdminSessionRow; turns: Turn[] } | null>(null);

  useEffect(() => {
    listAllSessions().then(setRows).catch((e) => setErr((e as Error).message));
  }, []);

  async function openTranscript(row: AdminSessionRow) {
    try {
      const full = await getAdminSession(row.id);
      setOpen({ row, turns: full.turns });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pemilik</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Giliran</TableHead>
              <TableHead className="text-right">Skor</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.username}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.created_at.slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "closed" ? "secondary" : "default"}>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.turn_count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.final_score ?? "—"}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="xs" onClick={() => openTranscript(s)}>
                    Lihat transkrip
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transkrip — {open?.row.username}</DialogTitle>
            <DialogDescription>
              {open?.row.created_at.slice(0, 16).replace("T", " ")} · {open?.row.turn_count} giliran
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {open?.turns.map((t, i) => (
              <div key={i}>
                <p className="text-xs font-medium text-muted-foreground">
                  {t.role === "examiner" ? "Penguji" : "Mahasiswa"}
                </p>
                <p className="whitespace-pre-wrap">{t.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the shell**

In `AdminApp.tsx`, import `Sessions`, add `{section === "sesi" && <Sessions />}`, and add `"sesi"` to the placeholder's exclusion list.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/pages/admin && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin frontend/src/adminApi.ts frontend/src/types.ts
git commit -m "feat(admin): add the sessions page"
```

---

## Task 12: Access-code endpoints

**Files:**
- Modify: `backend/src/repos/admin.ts`
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.codes.test.ts` (create)

**Interfaces:**
- Consumes: `listMembers` (`repos/collab.ts:62`), `getKeyUsageView` (`repos/usage.ts:99`)
- Produces:
  - `listAllCodes(db): AdminCodeRow[]`
  - `GET /admin/codes`, `DELETE /admin/codes/:hostId/members/:memberId`

```ts
export interface AdminCodeRow {
  id: number; host_user_id: number; host_username: string;
  invite_code: string; created_at: string;
  shares: { share_ai: number; share_tts: number; share_stt: number };
  members: { member_user_id: number; username: string; joined_at: string }[];
  cost_usd: number; calls: number;
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /admin/codes", () => {
  it("lists every collaboration with its members and the spend on that key", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);

    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);
    db.prepare(
      `INSERT INTO usage_events
         (user_id, key_owner_user_id, created_at, provider, model, kind,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, 'x', 'y', 'turn', 10, 5, 0, 0, 0.75)`,
    ).run(budi.id, admin.id, "2026-07-30T00:00:00.000Z");

    const { body } = await admin.agent.get("/admin/codes").expect(200);
    expect(body.codes).toHaveLength(1);
    expect(body.codes[0]).toMatchObject({ host_username: "alfan", invite_code: code });
    expect(body.codes[0].members.map((m: any) => m.username)).toEqual(["budi"]);
    expect(body.codes[0].cost_usd).toBeCloseTo(0.75);
  });

  it("kicks a member", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    const budi = await reg(app, "budi");
    setAdmin(db, admin.id, 1);
    await admin.agent.post("/collab").expect(200);
    const code = (await admin.agent.get("/collab")).body.hosting.invite_code;
    await budi.agent.post("/collab/join").send({ code }).expect(200);

    await admin.agent.delete(`/admin/codes/${admin.id}/members/${budi.id}`).expect(200);
    const { body } = await admin.agent.get("/admin/codes").expect(200);
    expect(body.codes[0].members).toHaveLength(0);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/codes").expect(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.codes.test.ts`
Expected: FAIL — 404 on `/admin/codes`.

- [ ] **Step 3: Add the repo function**

Append to `backend/src/repos/admin.ts`:

```ts
import { listMembers } from "./collab.js";
import { getKeyUsageView } from "./usage.js";

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
```

- [ ] **Step 4: Add the routes**

In `backend/src/routes/admin.ts`, extend the `../repos/admin.js` import with `listAllCodes`, add `import { kickMember } from "../repos/collab.js";`, then:

```ts
  r.get("/codes", (_req, res) => {
    res.json({ codes: listAllCodes(db) });
  });

  r.delete("/codes/:hostId/members/:memberId", (req, res) => {
    kickMember(db, Number(req.params.hostId), Number(req.params.memberId));
    res.json({ ok: true });
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/admin.codes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repos/admin.ts backend/src/routes/admin.ts backend/test/admin.codes.test.ts
git commit -m "feat(admin): list access codes and kick members"
```

---

## Task 13: Access-codes page

**Files:**
- Create: `frontend/src/pages/admin/Codes.tsx`
- Modify: `frontend/src/adminApi.ts`, `frontend/src/types.ts`, `frontend/src/pages/admin/AdminApp.tsx`
- Test: `frontend/src/pages/admin/Codes.test.tsx` (create)

**Interfaces:**
- Produces: `types.ts` `AdminCodeRow`; `adminApi.ts` `listCodes()`, `kickMember(hostId, memberId)`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/Codes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Codes } from "./Codes.js";
import * as adminApi from "../../adminApi.js";

const CODES = [
  {
    id: 1, host_user_id: 1, host_username: "alfan", invite_code: "abc123abc123",
    created_at: "2026-07-01T00:00:00.000Z",
    shares: { share_ai: 1, share_tts: 0, share_stt: 0 },
    members: [{ member_user_id: 2, username: "budi", joined_at: "2026-07-02T00:00:00.000Z" }],
    cost_usd: 0.75, calls: 3,
  },
];

describe("Codes", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listCodes").mockResolvedValue(CODES as any);
    vi.spyOn(adminApi, "kickMember").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the code, its host, and its members", async () => {
    render(<Codes />);
    expect(await screen.findByText("abc123abc123")).toBeTruthy();
    expect(screen.getByText("alfan")).toBeTruthy();
    expect(screen.getByText("budi")).toBeTruthy();
  });

  it("kicks a member", async () => {
    render(<Codes />);
    fireEvent.click(await screen.findByRole("button", { name: "Tendang budi" }));
    await waitFor(() => expect(adminApi.kickMember).toHaveBeenCalledWith(1, 2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/Codes.test.tsx`
Expected: FAIL — cannot resolve `./Codes.js`.

- [ ] **Step 3: Add the type and API calls**

Append to `frontend/src/types.ts`:

```ts
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
```

Append to `frontend/src/adminApi.ts`:

```ts
export async function listCodes(): Promise<AdminCodeRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/codes"))).codes;
}

export async function kickMember(hostId: number, memberId: number): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/codes/${hostId}/members/${memberId}`, { method: "DELETE" }),
  );
}
```

- [ ] **Step 4: Write the page**

Create `frontend/src/pages/admin/Codes.tsx`:

```tsx
import { useEffect, useState } from "react";
import { listCodes, kickMember } from "../../adminApi.js";
import type { AdminCodeRow } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Codes() {
  const [codes, setCodes] = useState<AdminCodeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reload() {
    listCodes().then(setCodes).catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  if (err && !codes) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!codes) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (codes.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada kode akses.</p>;
  }

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {codes.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardDescription>Host</CardDescription>
            <CardTitle className="text-base">{c.host_username}</CardTitle>
            <p className="font-mono text-sm">{c.invite_code}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {c.shares.share_ai === 1 && <Badge variant="secondary">AI</Badge>}
              {c.shares.share_tts === 1 && <Badge variant="secondary">TTS</Badge>}
              {c.shares.share_stt === 1 && <Badge variant="secondary">STT</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {c.calls} panggilan · ${c.cost_usd.toFixed(2)} (router saja)
            </p>
            {c.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada yang memakai kode ini.</p>
            ) : (
              <ul className="space-y-1">
                {c.members.map((m) => (
                  <li key={m.member_user_id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{m.username}</span>
                    <span className="text-xs text-muted-foreground">
                      sejak {m.joined_at.slice(0, 10)}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="ml-auto"
                      onClick={async () => {
                        try {
                          await kickMember(c.host_user_id, m.member_user_id);
                          reload();
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                    >
                      Tendang {m.username}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the shell**

In `AdminApp.tsx`, import `Codes`, add `{section === "kode" && <Codes />}`, and add `"kode"` to the placeholder's exclusion list.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/pages/admin && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin frontend/src/adminApi.ts frontend/src/types.ts
git commit -m "feat(admin): add the access codes page"
```

---

## Task 14: Question bank in the database

**Files:**
- Modify: `backend/src/db.ts`
- Create: `backend/src/repos/questions.ts`
- Modify: `backend/src/questionBank.ts:110`
- Modify: `backend/src/routes/sessions.ts:120`
- Test: `backend/test/repos.questions.test.ts` (create)

**Interfaces:**
- Produces:
  - `listQuestions(db): Record<string, string[]>`
  - `replacePhase(db, phase, texts): void`
  - `seedQuestions(db, bank): void`
  - `buildPhaseBlock(examinerCount, triggered, bank = QUESTION_BANK)`

- [ ] **Step 1: Write the failing test**

Create `backend/test/repos.questions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { listQuestions, replacePhase, seedQuestions } from "../src/repos/questions.js";
import { QUESTION_BANK, buildPhaseBlock } from "../src/questionBank.js";

describe("question bank repo", () => {
  it("seeds from the constant on a fresh db and does not duplicate on reopen", () => {
    const db = openDb(":memory:");
    const first = listQuestions(db);
    expect(first["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);

    // openDb menyemai; menyemai lagi tidak boleh menggandakan apa pun.
    seedQuestions(db, QUESTION_BANK);
    expect(listQuestions(db)["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);
  });

  it("replaces one phase and leaves the others alone", () => {
    const db = openDb(":memory:");
    replacePhase(db, "Pembukaan", ["Pertanyaan baru?", "Dan satu lagi?"]);
    const bank = listQuestions(db);
    expect(bank["Pembukaan"]).toEqual(["Pertanyaan baru?", "Dan satu lagi?"]);
    expect(bank["Metodologi"]).toEqual(QUESTION_BANK["Metodologi"]);
  });

  // Menghapus semua pertanyaan sebuah fase lewat editor tidak boleh membuat
  // penguji kehabisan bahan di tengah sidang.
  it("falls back to the constant when a phase is emptied", () => {
    const db = openDb(":memory:");
    replacePhase(db, "Pembukaan", []);
    expect(listQuestions(db)["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);
  });
});

describe("buildPhaseBlock with an injected bank", () => {
  it("uses the supplied bank and still defaults to the constant", () => {
    const custom = { ...QUESTION_BANK, Pembukaan: ["Pertanyaan khusus?"] };
    expect(buildPhaseBlock(0, [], custom)).toContain("Pertanyaan khusus?");
    expect(buildPhaseBlock(0, [])).toContain(QUESTION_BANK["Pembukaan"][0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/repos.questions.test.ts`
Expected: FAIL — cannot resolve `../src/repos/questions.js`.

- [ ] **Step 3: Add the table**

In `backend/src/db.ts`, inside the `MIGRATION` template string:

```sql
CREATE TABLE IF NOT EXISTS question_bank (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  phase    TEXT NOT NULL,
  text     TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_question_bank_phase ON question_bank(phase, position);
```

- [ ] **Step 4: Write the repo**

Create `backend/src/repos/questions.ts`:

```ts
import type Database from "better-sqlite3";
import { QUESTION_BANK } from "../questionBank.js";

/**
 * Bank pertanyaan yang tersimpan, dengan konstanta sebagai jaring pengaman:
 * fase yang kosong di DB mengembalikan daftar bawaan, sehingga "hapus semua"
 * di editor tidak pernah membuat penguji kehilangan bahan di tengah sidang.
 */
export function listQuestions(db: Database.Database): Record<string, string[]> {
  const rows = db
    .prepare("SELECT phase, text FROM question_bank ORDER BY phase, position")
    .all() as { phase: string; text: string }[];

  const bank: Record<string, string[]> = {};
  for (const r of rows) (bank[r.phase] ??= []).push(r.text);
  for (const [phase, fallback] of Object.entries(QUESTION_BANK)) {
    if (!bank[phase]?.length) bank[phase] = fallback;
  }
  return bank;
}

export function replacePhase(db: Database.Database, phase: string, texts: string[]): void {
  db.transaction(() => {
    db.prepare("DELETE FROM question_bank WHERE phase = ?").run(phase);
    const insert = db.prepare(
      "INSERT INTO question_bank (phase, text, position) VALUES (?,?,?)",
    );
    texts.forEach((text, i) => {
      const trimmed = text.trim();
      if (trimmed) insert.run(phase, trimmed, i);
    });
  })();
}

/** Mengisi tabel dari konstanta hanya bila masih benar-benar kosong. */
export function seedQuestions(
  db: Database.Database,
  bank: Record<string, string[]> = QUESTION_BANK,
): void {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM question_bank").get() as { c: number };
  if (c > 0) return;
  for (const [phase, texts] of Object.entries(bank)) replacePhase(db, phase, texts);
}
```

- [ ] **Step 5: Seed on open**

In `backend/src/db.ts`, import and call the seed just before `return db;` in `openDb`:

```ts
import { seedQuestions } from "./repos/questions.js";
```

```ts
  seedQuestions(db);
  return db;
```

- [ ] **Step 6: Make `buildPhaseBlock` take a bank**

In `backend/src/questionBank.ts`, change the signature and the two `QUESTION_BANK` references inside the function body:

```ts
export function buildPhaseBlock(
  examinerCount: number,
  triggered: string[],
  bank: Record<string, string[]> = QUESTION_BANK,
): string {
  const phases = phaseWindow(examinerCount).filter((p) => bank[p]?.length);
  const blocks = phases.map((p) => `${p}:\n${bank[p].map((q) => `- ${q}`).join("\n")}`);
```

The rest of the function is unchanged.

- [ ] **Step 7: Feed the DB bank into the live sidang**

In `backend/src/routes/sessions.ts`, add `import { listQuestions } from "../repos/questions.js";` and pass a third argument to the existing `buildPhaseBlock(` call at line 120:

```ts
      const phaseBlock = buildPhaseBlock(
        /* existing first two arguments unchanged */,
        listQuestions(db),
      );
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/repos.questions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Run the whole backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS. `test/questionBank.test.ts` and `test/routes.sessions.turn.test.ts` still pass because the seed writes exactly the constant's contents and the third parameter defaults to it.

- [ ] **Step 10: Commit**

```bash
git add backend/src/db.ts backend/src/repos/questions.ts backend/src/questionBank.ts backend/src/routes/sessions.ts backend/test/repos.questions.test.ts
git commit -m "feat(admin): move the question bank into the db"
```

---

## Task 15: Question bank editor (API + page)

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Create: `frontend/src/pages/admin/Questions.tsx`
- Modify: `frontend/src/adminApi.ts`, `frontend/src/pages/admin/AdminApp.tsx`
- Test: `backend/test/admin.questions.test.ts`, `frontend/src/pages/admin/Questions.test.tsx` (create both)

**Interfaces:**
- Produces:
  - `GET /admin/questions` → `{ phases: string[]; bank: Record<string, string[]> }`
  - `PUT /admin/questions` ← `{ phase: string; texts: string[] }`
  - `adminApi.ts`: `getQuestions()`, `putQuestions(phase, texts)`

- [ ] **Step 1: Write the failing backend test**

Create `backend/test/admin.questions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { SIDANG_PHASES } from "../src/phases.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("/admin/questions", () => {
  it("returns the phases and the seeded bank", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const { body } = await admin.agent.get("/admin/questions").expect(200);
    expect(body.phases).toEqual(SIDANG_PHASES);
    expect(body.bank["Pembukaan"].length).toBeGreaterThan(0);
  });

  it("replaces one phase and reads it back", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    await admin.agent
      .put("/admin/questions")
      .send({ phase: "Pembukaan", texts: ["Satu?", "  ", "Dua?"] })
      .expect(200);

    const { body } = await admin.agent.get("/admin/questions").expect(200);
    expect(body.bank["Pembukaan"]).toEqual(["Satu?", "Dua?"]); // baris kosong dibuang
  });

  it("rejects an unknown phase and a non-array body", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    await admin.agent.put("/admin/questions").send({ phase: "Ngawur", texts: ["x"] }).expect(400);
    await admin.agent.put("/admin/questions").send({ phase: "Pembukaan", texts: "x" }).expect(400);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/questions").expect(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.questions.test.ts`
Expected: FAIL — 404 on `/admin/questions`.

- [ ] **Step 3: Implement the routes**

In `backend/src/routes/admin.ts`, add:

```ts
import { listQuestions, replacePhase } from "../repos/questions.js";
import { SIDANG_PHASES } from "../phases.js";
```

```ts
  r.get("/questions", (_req, res) => {
    res.json({ phases: SIDANG_PHASES, bank: listQuestions(db) });
  });

  r.put("/questions", (req, res) => {
    const phase = String(req.body?.phase ?? "");
    const texts = req.body?.texts;
    // Fase divalidasi terhadap agenda: baris bebas boleh, nama fase tidak —
    // fase asing tidak akan pernah terbaca dan hanya jadi sampah diam-diam.
    if (!SIDANG_PHASES.includes(phase)) {
      return res.status(400).json({ error: "Fase tidak dikenal" });
    }
    if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) {
      return res.status(400).json({ error: "Daftar pertanyaan harus berupa teks" });
    }
    replacePhase(db, phase, texts);
    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run backend test to verify it passes**

Run: `cd backend && npx vitest run test/admin.questions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing frontend test**

Create `frontend/src/pages/admin/Questions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Questions } from "./Questions.js";
import * as adminApi from "../../adminApi.js";

describe("Questions", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getQuestions").mockResolvedValue({
      phases: ["Pembukaan", "Metodologi"],
      bank: { Pembukaan: ["Satu?"], Metodologi: ["Dua?"] },
    } as any);
    vi.spyOn(adminApi, "putQuestions").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("edits one phase and saves it as a list of lines", async () => {
    render(<Questions />);
    const box = (await screen.findByLabelText("Pembukaan")) as HTMLTextAreaElement;
    expect(box.value).toBe("Satu?");

    fireEvent.change(box, { target: { value: "Satu?\nTiga?" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan Pembukaan" }));
    await waitFor(() =>
      expect(adminApi.putQuestions).toHaveBeenCalledWith("Pembukaan", ["Satu?", "Tiga?"]),
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/Questions.test.tsx`
Expected: FAIL — cannot resolve `./Questions.js`.

- [ ] **Step 7: Add the API calls and the page**

Append to `frontend/src/adminApi.ts`:

```ts
export async function getQuestions(): Promise<{
  phases: string[];
  bank: Record<string, string[]>;
}> {
  return jsonOrThrow(await fetch("/api/admin/questions"));
}

export async function putQuestions(phase: string, texts: string[]): Promise<void> {
  await jsonOrThrow(
    await fetch("/api/admin/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, texts }),
    }),
  );
}
```

Create `frontend/src/pages/admin/Questions.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getQuestions, putQuestions } from "../../adminApi.js";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Questions() {
  const [phases, setPhases] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getQuestions()
      .then(({ phases, bank }) => {
        setPhases(phases);
        setDraft(Object.fromEntries(phases.map((p) => [p, (bank[p] ?? []).join("\n")])));
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function save(phase: string) {
    setErr(null);
    try {
      // Satu pertanyaan per baris; baris kosong dibuang di server juga.
      await putQuestions(
        phase,
        (draft[phase] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      );
      setSaved(phase);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && phases.length === 0) {
    return <p role="alert" className="text-sm text-destructive">{err}</p>;
  }

  return (
    <div className="space-y-6">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <p className="text-sm text-muted-foreground">
        Satu pertanyaan per baris. Fase yang dikosongkan kembali memakai daftar
        bawaan, jadi penguji tidak pernah kehabisan bahan.
      </p>
      {phases.map((p) => (
        <div key={p} className="space-y-2">
          <Label htmlFor={`phase-${p}`}>{p}</Label>
          <Textarea
            id={`phase-${p}`}
            rows={6}
            value={draft[p] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => save(p)}>
              Simpan {p}
            </Button>
            {saved === p && <span className="text-xs text-muted-foreground">Tersimpan.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Wire it into the shell**

In `AdminApp.tsx`, import `Questions`, add `{section === "pertanyaan" && <Questions />}`, and add `"pertanyaan"` to the placeholder's exclusion list.

- [ ] **Step 9: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/pages/admin && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/admin.ts backend/test/admin.questions.test.ts frontend/src/pages/admin frontend/src/adminApi.ts
git commit -m "feat(admin): edit the question bank from the panel"
```

---

## Task 16: Personas in the database

**Files:**
- Create: `backend/src/personas.ts`
- Create: `backend/src/repos/personas.ts`
- Modify: `backend/src/db.ts`
- Test: `backend/test/repos.personas.test.ts` (create)

**Interfaces:**
- Produces:
  - `PERSONA_SEED: PersonaRow[]`
  - `listPersonas(db): PersonaRow[]`
  - `upsertPersona(db, row): void`
  - `deletePersona(db, key): void`
  - `seedPersonas(db): void`

```ts
export interface PersonaRow {
  key: string; name: string; initials: string; role: string;
  mode: string; type: string; color: string; trait: string;
  position: number; active: boolean;
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/test/repos.personas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { listPersonas, upsertPersona, deletePersona, seedPersonas } from "../src/repos/personas.js";
import { PERSONA_SEED } from "../src/personas.js";

describe("personas repo", () => {
  it("seeds the six presets on a fresh db and does not duplicate on reseed", () => {
    const db = openDb(":memory:");
    expect(listPersonas(db).map((p) => p.key)).toEqual(PERSONA_SEED.map((p) => p.key));
    seedPersonas(db);
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length);
  });

  it("upserts by key and orders by position", () => {
    const db = openDb(":memory:");
    upsertPersona(db, {
      key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
      mode: "kritis", type: "domain", color: "#123456", trait: "Baru.",
      position: 99, active: true,
    });
    const list = listPersonas(db);
    expect(list.at(-1)!.key).toBe("zaki");

    upsertPersona(db, { ...list.at(-1)!, name: "Dr. Zaki Rahman" });
    expect(listPersonas(db).find((p) => p.key === "zaki")!.name).toBe("Dr. Zaki Rahman");
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length + 1);
  });

  it("hides inactive personas from the list", () => {
    const db = openDb(":memory:");
    const first = listPersonas(db)[0];
    upsertPersona(db, { ...first, active: false });
    expect(listPersonas(db).some((p) => p.key === first.key)).toBe(false);
    expect(listPersonas(db, { includeInactive: true }).some((p) => p.key === first.key)).toBe(true);
  });

  it("deletes a persona", () => {
    const db = openDb(":memory:");
    deletePersona(db, PERSONA_SEED[0].key);
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/repos.personas.test.ts`
Expected: FAIL — cannot resolve `../src/personas.js`.

- [ ] **Step 3: Add the table**

In `backend/src/db.ts`, inside the `MIGRATION` string:

```sql
CREATE TABLE IF NOT EXISTS personas (
  key      TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  initials TEXT NOT NULL,
  role     TEXT NOT NULL,
  mode     TEXT NOT NULL,
  type     TEXT NOT NULL,
  color    TEXT NOT NULL,
  trait    TEXT NOT NULL,
  position INTEGER NOT NULL,
  active   INTEGER NOT NULL DEFAULT 1
);
```

- [ ] **Step 4: Write the seed data**

Create `backend/src/personas.ts`. Copy all six objects verbatim from `frontend/src/personas.ts:42-110` (`hendra`, `ratna`, `yusuf`, `anindya`, `siti`, `bambang`), adding `position` in that order and `active: true`:

```ts
export interface PersonaRow {
  key: string;
  name: string;
  initials: string;
  role: string;
  mode: string;
  type: string;
  color: string;
  trait: string;
  position: number;
  active: boolean;
}

/**
 * Enam preset yang dulu hanya hidup di frontend. Ini benih tabel `personas`;
 * frontend tetap menyimpan salinannya sebagai nilai render awal supaya picker
 * tidak pernah kosong saat fetch belum kembali.
 */
export const PERSONA_SEED: PersonaRow[] = [
  {
    key: "hendra",
    name: "Ir. Hendra Gunawan, M.Sc.",
    initials: "HG",
    role: "Pembimbing yang menenangkan",
    mode: "santai",
    type: "umum",
    color: "#0f9d6e",
    trait:
      "Bertanya pelan dan memberi arah bila Anda tersendat. Cocok untuk pemanasan atau latihan pertama.",
    position: 0,
    active: true,
  },
  // …lima sisanya, urutan dan isi persis seperti frontend/src/personas.ts
];
```

- [ ] **Step 5: Write the repo**

Create `backend/src/repos/personas.ts`:

```ts
import type Database from "better-sqlite3";
import { PERSONA_SEED, type PersonaRow } from "../personas.js";

type Row = Omit<PersonaRow, "active"> & { active: number };

export function listPersonas(
  db: Database.Database,
  opts: { includeInactive?: boolean } = {},
): PersonaRow[] {
  const where = opts.includeInactive ? "" : "WHERE active = 1";
  const rows = db
    .prepare(`SELECT * FROM personas ${where} ORDER BY position, key`)
    .all() as Row[];
  return rows.map((r) => ({ ...r, active: r.active === 1 }));
}

export function upsertPersona(db: Database.Database, p: PersonaRow): void {
  db.prepare(
    `INSERT INTO personas (key, name, initials, role, mode, type, color, trait, position, active)
     VALUES (@key, @name, @initials, @role, @mode, @type, @color, @trait, @position, @active)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name, initials = excluded.initials, role = excluded.role,
       mode = excluded.mode, type = excluded.type, color = excluded.color,
       trait = excluded.trait, position = excluded.position, active = excluded.active`,
  ).run({ ...p, active: p.active ? 1 : 0 });
}

export function deletePersona(db: Database.Database, key: string): void {
  db.prepare("DELETE FROM personas WHERE key = ?").run(key);
}

export function seedPersonas(db: Database.Database): void {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM personas").get() as { c: number };
  if (c > 0) return;
  for (const p of PERSONA_SEED) upsertPersona(db, p);
}
```

- [ ] **Step 6: Seed on open**

In `backend/src/db.ts`, next to `seedQuestions(db)`:

```ts
import { seedPersonas } from "./repos/personas.js";
```

```ts
  seedPersonas(db);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/repos.personas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src/personas.ts backend/src/repos/personas.ts backend/src/db.ts backend/test/repos.personas.test.ts
git commit -m "feat(admin): move examiner personas into the db"
```

---

## Task 17: Persona endpoints

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/settings.ts`
- Test: `backend/test/admin.personas.test.ts` (create)

**Interfaces:**
- Produces:
  - `GET /settings/personas` → `{ personas: PersonaRow[] }` (any signed-in user)
  - `GET /admin/personas` (includes inactive), `PUT /admin/personas/:key`, `DELETE /admin/personas/:key`

- [ ] **Step 1: Write the failing test**

Create `backend/test/admin.personas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { PERSONA_SEED } from "../src/personas.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /settings/personas", () => {
  it("is readable by any signed-in user and needs no admin", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    const { body } = await budi.agent.get("/settings/personas").expect(200);
    expect(body.personas.map((p: any) => p.key)).toEqual(PERSONA_SEED.map((p) => p.key));
  });

  it("is 401 without a cookie", async () => {
    const { app } = ctx();
    await request(app).get("/settings/personas").expect(401);
  });
});

describe("/admin/personas", () => {
  it("creates, updates, and deletes a persona", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const zaki = {
      key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
      mode: "kritis", type: "domain", color: "#123456", trait: "Baru.",
      position: 99, active: true,
    };
    await admin.agent.put("/admin/personas/zaki").send(zaki).expect(200);
    let list = (await admin.agent.get("/admin/personas").expect(200)).body.personas;
    expect(list.find((p: any) => p.key === "zaki").name).toBe("Dr. Zaki");

    await admin.agent
      .put("/admin/personas/zaki")
      .send({ ...zaki, name: "Dr. Zaki Rahman" })
      .expect(200);
    list = (await admin.agent.get("/admin/personas")).body.personas;
    expect(list.find((p: any) => p.key === "zaki").name).toBe("Dr. Zaki Rahman");

    await admin.agent.delete("/admin/personas/zaki").expect(200);
    list = (await admin.agent.get("/admin/personas")).body.personas;
    expect(list.some((p: any) => p.key === "zaki")).toBe(false);
  });

  it("rejects a body missing required fields", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.put("/admin/personas/zaki").send({ name: "" }).expect(400);
  });

  // Menghapus persona terakhir membuat picker mahasiswa kosong.
  it("refuses to delete the last active persona", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    for (const p of PERSONA_SEED.slice(1)) {
      await admin.agent.delete(`/admin/personas/${p.key}`).expect(200);
    }
    await admin.agent.delete(`/admin/personas/${PERSONA_SEED[0].key}`).expect(400);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/personas").expect(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/admin.personas.test.ts`
Expected: FAIL — 404 on `/settings/personas`.

- [ ] **Step 3: Add the public read endpoint**

In `backend/src/routes/settings.ts`, add `import { listPersonas } from "../repos/personas.js";` and register this route **before** any parameterised route in that router:

```ts
  // Dibaca picker penguji dan header sidang, jadi terbuka untuk semua pengguna
  // yang sudah masuk — yang admin-only hanya penyuntingannya.
  r.get("/personas", (_req, res) => {
    res.json({ personas: listPersonas(db) });
  });
```

- [ ] **Step 4: Add the admin endpoints**

In `backend/src/routes/admin.ts`:

```ts
import { listPersonas, upsertPersona, deletePersona } from "../repos/personas.js";
import type { PersonaRow } from "../personas.js";
```

```ts
  r.get("/personas", (_req, res) => {
    res.json({ personas: listPersonas(db, { includeInactive: true }) });
  });

  r.put("/personas/:key", (req, res) => {
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const row: PersonaRow = {
      key: req.params.key,
      name: text(b.name),
      initials: text(b.initials),
      role: text(b.role),
      mode: text(b.mode),
      type: text(b.type),
      color: text(b.color) || "#475569",
      trait: text(b.trait),
      position: Number.isFinite(b.position) ? Number(b.position) : 0,
      active: b.active !== false,
    };
    if (!row.name || !row.initials || !row.mode || !row.type) {
      return res.status(400).json({ error: "Nama, inisial, mode, dan tipe wajib diisi" });
    }
    upsertPersona(db, row);
    res.json({ ok: true });
  });

  r.delete("/personas/:key", (req, res) => {
    // Picker mahasiswa tidak boleh berakhir kosong.
    const active = listPersonas(db);
    if (active.length <= 1 && active.some((p) => p.key === req.params.key)) {
      return res.status(400).json({ error: "Persona terakhir tidak bisa dihapus" });
    }
    deletePersona(db, req.params.key);
    res.json({ ok: true });
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/admin.personas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/settings.ts backend/test/admin.personas.test.ts
git commit -m "feat(admin): serve and edit personas over the api"
```

---

## Task 18: Personas on the frontend

**Files:**
- Modify: `frontend/src/personas.ts:128-140`
- Modify: `frontend/src/components/SetupModal.tsx:3`, `:138`
- Modify: `frontend/src/pages/SessionPage.tsx:12`, `:133`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api.ts`, `frontend/src/adminApi.ts`
- Create: `frontend/src/pages/admin/Personas.tsx`
- Test: `frontend/src/personas.test.ts`, `frontend/src/pages/admin/Personas.test.tsx` (create both)

**Interfaces:**
- Consumes: `GET /settings/personas`, `/admin/personas` (Task 17)
- Produces:
  - `api.ts`: `getPersonas(): Promise<Persona[]>`
  - `personas.ts`: `personaFor(list: Persona[], mode: string, type: string): Persona`
  - `SetupModal` gains `personas: Persona[]`; `SessionPage` gains `personas: Persona[]`
  - `adminApi.ts`: `listAdminPersonas()`, `putPersona(row)`, `deletePersona(key)`

- [ ] **Step 1: Write the failing test for the list-aware lookup**

Create `frontend/src/personas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PERSONAS, personaFor } from "./personas.js";

describe("personaFor", () => {
  it("finds a persona in the supplied list", () => {
    const hit = personaFor(PERSONAS, "santai", "umum");
    expect(hit.key).toBe("hendra");
  });

  // Persona bisa dihapus admin di tengah sidang yang sedang berjalan; header
  // sidang harus tetap punya nama, bukan undefined.
  it("falls back to a plain examiner when the pair is missing", () => {
    const hit = personaFor([], "galak", "domain");
    expect(hit.name).toBe("Penguji");
    expect(hit.mode).toBe("galak");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/personas.test.ts`
Expected: FAIL — `personaFor` takes two arguments, not three.

- [ ] **Step 3: Make the lookup take a list**

In `frontend/src/personas.ts`, change `personaFor`:

```ts
/**
 * Persona di balik pasangan mode/type tersimpan. Daftarnya dioper dari App
 * (hasil fetch, dengan PERSONAS sebagai nilai awal) supaya persona yang diedit
 * admin langsung terpakai tanpa deploy — dan pasangan yang tidak tercakup
 * tetap dapat penguji polos, bukan nama yang salah.
 */
export function personaFor(list: Persona[], mode: string, type: string): Persona {
  const hit = list.find((p) => p.mode === mode && p.type === type);
  if (hit) return hit;
  return {
    key: `${mode}-${type}`,
    name: "Penguji",
    initials: "P",
    role: TYPE_LABELS[type] ?? "Penguji sidang",
    mode,
    type,
    color: "#475569",
    trait: "",
  };
}
```

- [ ] **Step 4: Fetch personas and thread them through**

In `frontend/src/api.ts`:

```ts
export async function getPersonas(): Promise<Persona[]> {
  return (await jsonOrThrow(await fetch("/api/settings/personas"))).personas;
}
```

(add `import type { Persona } from "./personas.js";`)

In `frontend/src/App.tsx`:

```tsx
  // PERSONAS statis jadi nilai awal, fetch menggantinya. Picker dan header
  // sidang karena itu tidak pernah render kosong sambil menunggu jaringan.
  const [personas, setPersonas] = useState<Persona[]>(PERSONAS);
```

```tsx
  useEffect(() => {
    if (!user) return;
    getPersonas().then(setPersonas).catch(() => {});
  }, [user]);
```

Update the existing settings effect at `App.tsx:79` to `personaFor(personas, s.examiner_mode, s.examiner_type ?? "umum")` and add `personas` to that effect's dependency array. Pass `personas={personas}` to both `<SetupModal …>` and `<SessionPage …>`. Import `PERSONAS` and `getPersonas`.

In `frontend/src/components/SetupModal.tsx`, drop `PERSONAS` from the `../personas.js` import, add `personas: Persona[]` to `Props`, and change line 138 to `{personas.map((p) => {`.

In `frontend/src/pages/SessionPage.tsx`, add `personas: Persona[]` to its props and change line 133 to `setPersona(personaFor(personas, s.examiner_mode, s.examiner_type ?? "umum"));`.

- [ ] **Step 5: Run the frontend suite**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS. Tests that render `SetupModal` or `SessionPage` directly need `personas={PERSONAS}` added.

- [ ] **Step 6: Commit the plumbing**

```bash
git add frontend/src/personas.ts frontend/src/personas.test.ts frontend/src/api.ts frontend/src/App.tsx frontend/src/components/SetupModal.tsx frontend/src/pages/SessionPage.tsx
git commit -m "feat(admin): serve personas from the api"
```

- [ ] **Step 7: Write the failing admin page test**

Create `frontend/src/pages/admin/Personas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Personas } from "./Personas.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    key: "hendra", name: "Ir. Hendra Gunawan, M.Sc.", initials: "HG",
    role: "Pembimbing yang menenangkan", mode: "santai", type: "umum",
    color: "#0f9d6e", trait: "Bertanya pelan.", position: 0, active: true,
  },
];

describe("Personas", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listAdminPersonas").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "putPersona").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists personas and saves an edited name", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));

    fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Ir. Hendra G." } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(adminApi.putPersona).toHaveBeenCalledWith(
        expect.objectContaining({ key: "hendra", name: "Ir. Hendra G." }),
      ),
    );
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/Personas.test.tsx`
Expected: FAIL — cannot resolve `./Personas.js`.

- [ ] **Step 9: Add the API calls and the page**

Append to `frontend/src/adminApi.ts` (`AdminPersonaRow` is `Persona & { position: number; active: boolean }`):

```ts
import type { Persona } from "./personas.js";

export type AdminPersonaRow = Persona & { position: number; active: boolean };

export async function listAdminPersonas(): Promise<AdminPersonaRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/personas"))).personas;
}

export async function putPersona(row: AdminPersonaRow): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/personas/${row.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    }),
  );
}

export async function deletePersona(key: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/admin/personas/${key}`, { method: "DELETE" }));
}
```

Create `frontend/src/pages/admin/Personas.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  listAdminPersonas, putPersona, deletePersona, type AdminPersonaRow,
} from "../../adminApi.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const BLANK: AdminPersonaRow = {
  key: "", name: "", initials: "", role: "", mode: "standar", type: "umum",
  color: "#475569", trait: "", position: 0, active: true,
};

export function Personas() {
  const [rows, setRows] = useState<AdminPersonaRow[] | null>(null);
  const [edit, setEdit] = useState<AdminPersonaRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reload() {
    listAdminPersonas().then(setRows).catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  async function act(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button size="sm" onClick={() => setEdit({ ...BLANK, position: rows.length })}>
        Persona baru
      </Button>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.key}>
                <TableCell>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.role}</span>
                </TableCell>
                <TableCell>{p.mode}</TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => setEdit(p)}>
                      Ubah {p.key}
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => act(() => deletePersona(p.key))}
                    >
                      Hapus {p.key}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={edit !== null} onOpenChange={(next) => !next && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.key ? `Ubah ${edit.key}` : "Persona baru"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {(
                [
                  ["key", "Kunci"],
                  ["name", "Nama"],
                  ["initials", "Inisial"],
                  ["role", "Peran"],
                  ["mode", "Mode"],
                  ["type", "Tipe"],
                  ["color", "Warna"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <Label htmlFor={`p-${field}`}>{label}</Label>
                  <Input
                    id={`p-${field}`}
                    className="mt-1"
                    value={edit[field]}
                    onChange={(e) => setEdit({ ...edit, [field]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <Label htmlFor="p-trait">Sifat</Label>
                <Textarea
                  id="p-trait"
                  rows={3}
                  className="mt-1"
                  value={edit.trait}
                  onChange={(e) => setEdit({ ...edit, trait: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                const row = edit!;
                setEdit(null);
                act(() => putPersona(row));
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 10: Wire it into the shell**

In `AdminApp.tsx`, import `Personas`, add `{section === "persona" && <Personas />}`, and delete the now-dead placeholder branch entirely — all six sections exist.

- [ ] **Step 11: Run the full suites**

Run: `cd frontend && npx vitest run && npm run typecheck`
Run: `cd backend && npx vitest run`
Expected: PASS on all three.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/admin frontend/src/adminApi.ts
git commit -m "feat(admin): add the personas editor"
```

---

## Deployment

After Task 18, on the VPS:

```bash
cd /var/www/ai-sidang-simulator/backend && npm run build
npx tsx scripts/grant-admin.ts <username>     # sekali saja, admin pertama
pm2 restart sidang-backend
cd ../frontend && npm run build               # nginx serves dist/, try_files sudah ada
```

No nginx change is needed — the existing `try_files $uri $uri/ /index.html` already serves `/admin`.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Admin identity (column, `requireAdmin`, `/auth/me`) | 1 |
| Bootstrap script | 2 |
| Guards: self-demote, self-suspend, last admin | 7 |
| Guard: self-delete | 8 |
| Suspension in `requireAuth` + login | 5 |
| Deleting a user (six tables) | 8 |
| `/admin/overview` | 3 |
| `/admin/users`, `/admin/users/:id`, keys never decrypted | 6 |
| `PATCH` / `DELETE /admin/users/:id` | 7, 8 |
| `/admin/sessions`, `/admin/sessions/:id` | 10 |
| `/admin/codes`, kick | 12 |
| `/admin/questions` | 15 |
| `/admin/personas` | 17 |
| `question_bank` table, seed, fallback | 14 |
| `personas` table, seed | 16 |
| Persona frontend fetch + cost warning | 18 |
| `/admin` branch, shell, six sections | 4, 9, 11, 13, 15, 18 |
| Cost limitation labelled in the UI | 4, 9 |
| Zero new dependencies | Global Constraints |

Nothing in the spec is unassigned.

**Type consistency**

- `AdminUserRow`, `AdminSessionRow`, `AdminCodeRow`, `AdminOverview` are defined once in `repos/admin.ts` and mirrored field-for-field in `frontend/src/types.ts`.
- `PersonaRow` (backend) = `Persona & { position: number; active: boolean }` (frontend `AdminPersonaRow`). Same nine fields, same names.
- `personaFor` takes `(list, mode, type)` in every call site touched by Task 18.
- `buildPhaseBlock(examinerCount, triggered, bank?)` — the third parameter is optional everywhere, so Tasks 1–13 compile untouched.
- `listPersonas(db, opts?)` is the only reader; `{ includeInactive: true }` appears in Task 16's test and Task 17's admin route.
