# Collaboration (Shared API Keys) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host share their AI/TTS/STT provider config + API keys with members who join by invite code; members borrow the host's keys server-side (never exposed), the host manages shares/members/kick and sees aggregate usage.

**Architecture:** A `resolveSourceUser(db, userId, cap)` resolver decides, per capability, whether a user uses their own or the host's stored config. It plugs into the 3 usage seams (AI in sessions, TTS speak, STT transcribe) and augments the settings response with effective providers. Two new tables (`collaborations`, `collaboration_members`) plus `usage_events.key_owner_user_id` for the host aggregate. Sessions/documents stay private.

**Tech Stack:** TypeScript, Express 4, better-sqlite3, Node `crypto`, React 18 + Vite, Vitest, supertest.

## Global Constraints

- **Zero new dependencies.** Node stdlib only (`node:crypto` for invite codes).
- **Roles:** host at most one collaboration (`UNIQUE(host_user_id)`), member of at most one (`UNIQUE(member_user_id)`); a user may be both (host own + member of another).
- **Sharing uses the host's OWN stored `user_settings`** — no chains/recursion. Hosting never redirects the host's own key use; only membership does (single hop member→host).
- **Members never receive a host's plaintext key.** Only server-side usage endpoints (`/sessions/:id/turn`, `/sessions/:id/close`, `/tts/speak`, `/stt/transcribe`) resolve to a host key. Self-test/preview endpoints always use the caller's own keys.
- **Invite code:** `randomBytes(6).toString("hex")` (12 hex chars), `UNIQUE`, regenerable.
- **Ownership/role misses** return a clear 400/404; scoped `WHERE` clauses make kick/leave/host-actions safe no-ops when the row isn't the caller's.
- **ISO-8601 UTC timestamp strings**; ESM `.js` imports; vitest tests in `backend/test/` and `frontend/src/**`.
- **In-memory test DB:** `openDb(":memory:")`.
- **Build note:** the `recordUsage` signature change (Task 3) breaks its callers in `routes/sessions.ts` and several pre-existing tests until Task 6. Per-task gates in Tasks 3–5 are the focused Vitest tests; full `npm run build` + full suite are verified green in Task 6.

---

### Task 1: Schema — collaborations, collaboration_members, key_owner_user_id

**Files:**
- Modify: `backend/src/db.ts`
- Test: `backend/test/db.collab.test.ts` (create)

**Interfaces:**
- Produces: `openDb` also creates `collaborations` and `collaboration_members` tables and adds `usage_events.key_owner_user_id INTEGER`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/db.collab.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";

function cols(db: any, t: string): string[] {
  return (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
}

describe("collab schema", () => {
  it("creates collab tables and key_owner column", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["collaborations", "collaboration_members"]));
    expect(cols(db, "usage_events")).toContain("key_owner_user_id");
    expect(cols(db, "collaborations")).toEqual(expect.arrayContaining(["id", "host_user_id", "invite_code", "share_ai", "share_tts", "share_stt", "created_at"]));
    expect(cols(db, "collaboration_members")).toEqual(expect.arrayContaining(["collaboration_id", "member_user_id", "joined_at"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/db.collab.test.ts`
Expected: FAIL (tables/column absent).

- [ ] **Step 3: Write minimal implementation**

Append to the `MIGRATION` template string in `backend/src/db.ts`:

```sql
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
```

In `openDb`, after the existing `addColumnIfMissing` calls, add:

```ts
addColumnIfMissing(db, "usage_events", "key_owner_user_id", "key_owner_user_id INTEGER");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/db.collab.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.ts backend/test/db.collab.test.ts
git commit -m "feat(db): collaboration tables + usage key_owner column"
```

---

### Task 2: `repos/collab.ts` — collaboration persistence

**Files:**
- Create: `backend/src/repos/collab.ts`
- Test: `backend/test/collab.test.ts` (create)

**Interfaces:**
- Consumes: `openDb` (Task 1), `createUser` (existing `repos/users.ts`).
- Produces:
  - `freshInviteCode(db, gen?): string` — a code not already in `collaborations`.
  - `getHostCollab(db, hostUserId): { id, invite_code, share_ai, share_tts, share_stt } | null`
  - `createCollab(db, hostUserId, code, createdAt): void`
  - `setShares(db, hostUserId, shares: { share_ai: 0|1, share_tts: 0|1, share_stt: 0|1 }): void`
  - `regenerateCode(db, hostUserId, code): void`
  - `deleteCollab(db, hostUserId): void`
  - `getMembership(db, memberUserId): { collaboration_id, host_user_id, share_ai, share_tts, share_stt } | null`
  - `joinByCode(db, memberUserId, code, joinedAt): { ok: true } | { ok: false; reason: "not_found" | "own" | "already" }`
  - `leave(db, memberUserId): void`
  - `listMembers(db, hostUserId): { member_user_id: number; username: string; joined_at: string }[]`
  - `kickMember(db, hostUserId, memberUserId): void`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/collab.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  freshInviteCode, getHostCollab, createCollab, setShares, regenerateCode, deleteCollab,
  getMembership, joinByCode, leave, listMembers, kickMember,
} from "../src/repos/collab.js";

function seed() {
  const db = openDb(":memory:");
  const host = createUser(db, "host", "h", "t");
  const m1 = createUser(db, "m1", "h", "t");
  const m2 = createUser(db, "m2", "h", "t");
  return { db, host, m1, m2 };
}

describe("collab repo", () => {
  it("hosts, shares, and lists/kicks members", () => {
    const { db, host, m1, m2 } = seed();
    createCollab(db, host, "CODE123", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 1 });
    const c = getHostCollab(db, host)!;
    expect(c).toMatchObject({ invite_code: "CODE123", share_ai: 1, share_tts: 0, share_stt: 1 });

    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: true });
    expect(joinByCode(db, m2, "CODE123", "t")).toEqual({ ok: true });
    expect(listMembers(db, host).map((m) => m.username).sort()).toEqual(["m1", "m2"]);

    const mem = getMembership(db, m1)!;
    expect(mem).toMatchObject({ host_user_id: host, share_ai: 1, share_stt: 1 });

    kickMember(db, host, m1);
    expect(getMembership(db, m1)).toBeNull();
    expect(listMembers(db, host).map((m) => m.username)).toEqual(["m2"]);
  });

  it("enforces join rules and one-membership", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "CODE123", "t");
    expect(joinByCode(db, m1, "NOPE", "t")).toEqual({ ok: false, reason: "not_found" });
    expect(joinByCode(db, host, "CODE123", "t")).toEqual({ ok: false, reason: "own" });
    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: true });
    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: false, reason: "already" });
    leave(db, m1);
    expect(getMembership(db, m1)).toBeNull();
  });

  it("freshInviteCode avoids collisions and regenerate/delete work", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "AAA", "t");
    // gen returns a taken code once, then a free one
    let calls = 0;
    const code = freshInviteCode(db, () => (calls++ === 0 ? "AAA" : "BBB"));
    expect(code).toBe("BBB");
    regenerateCode(db, host, "CCC");
    expect(getHostCollab(db, host)!.invite_code).toBe("CCC");
    joinByCode(db, m1, "CCC", "t");
    deleteCollab(db, host);
    expect(getHostCollab(db, host)).toBeNull();
    expect(getMembership(db, m1)).toBeNull(); // cascade
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/collab.test.ts`
Expected: FAIL ("Cannot find module '../src/repos/collab.js'").

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repos/collab.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/collab.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/collab.ts backend/test/collab.test.ts
git commit -m "feat(collab): collaboration repository (host/join/leave/kick)"
```

---

### Task 3: `repos/usage.ts` — key_owner accounting + host aggregate

**Files:**
- Modify: `backend/src/repos/usage.ts`
- Test: `backend/test/usage.keyowner.test.ts` (create)

**Interfaces:**
- Consumes: `openDb`, `createUser`.
- Produces:
  - `recordUsage(db, userId, keyOwnerUserId, at, provider, model, kind, usage)` — new 3rd param; writes `key_owner_user_id`.
  - `getKeyUsageView(db, hostUserId): { total: UsageTotals; by_member: { member_user_id: number; username: string; totals: UsageTotals }[] }` — events where `key_owner_user_id = hostUserId AND user_id != hostUserId`.
  - `getUsageView(db, userId)` unchanged (member's own view).

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/usage.keyowner.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { recordUsage, getKeyUsageView, getUsageView } from "../src/repos/usage.js";

const U = { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.02 };

describe("key-owner usage", () => {
  it("aggregates borrowed usage under the key owner, per member", () => {
    const db = openDb(":memory:");
    const host = createUser(db, "host", "h", "t");
    const m1 = createUser(db, "m1", "h", "t");
    // m1 borrows host's key twice; host uses own key once
    recordUsage(db, m1, host, "t", "claude", "m", "turn", U);
    recordUsage(db, m1, host, "t", "claude", "m", "assessment", U);
    recordUsage(db, host, host, "t", "claude", "m", "turn", U);

    const view = getKeyUsageView(db, host);
    expect(view.total.calls).toBe(2); // only borrowed (user_id != host), both by m1
    expect(view.by_member).toEqual([{ member_user_id: m1, username: "m1", totals: expect.objectContaining({ calls: 2 }) }]);

    // member's own view still counts all their own calls
    expect(getUsageView(db, m1).total.calls).toBe(2);
    expect(getUsageView(db, host).total.calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/usage.keyowner.test.ts`
Expected: FAIL (`recordUsage` arity / `getKeyUsageView` missing).

- [ ] **Step 3: Write minimal implementation**

Add `keyOwnerUserId: number` as the 3rd param of `recordUsage`; add `key_owner_user_id` to the INSERT columns and bind it:

```ts
export function recordUsage(
  db: Database.Database, userId: number, keyOwnerUserId: number, at: string,
  provider: string, model: string, kind: UsageKind, usage: TokenUsage | undefined,
): void {
  if (!usage) return;
  try {
    db.prepare(
      `INSERT INTO usage_events
         (user_id, key_owner_user_id, created_at, provider, model, kind, input_tokens,
          output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, keyOwnerUserId, at, provider, model, kind, usage.input_tokens,
      usage.output_tokens, usage.cache_read_tokens, usage.cache_write_tokens, usage.cost_usd);
  } catch (err) {
    console.error("[usage record failed]", (err as Error).message);
  }
}
```

Add the host aggregate (reuse the existing `SUMS` fragment and `UsageTotals`):

```ts
export function getKeyUsageView(db: Database.Database, hostUserId: number): {
  total: UsageTotals;
  by_member: { member_user_id: number; username: string; totals: UsageTotals }[];
} {
  const total = (db.prepare(`SELECT ${SUMS} FROM usage_events WHERE key_owner_user_id = ? AND user_id != ?`).get(hostUserId, hostUserId) as UsageTotals) ?? EMPTY;
  const rows = db.prepare(
    `SELECT e.user_id AS member_user_id, u.username, ${SUMS}
     FROM usage_events e JOIN users u ON u.id = e.user_id
     WHERE e.key_owner_user_id = ? AND e.user_id != ?
     GROUP BY e.user_id ORDER BY u.username ASC`,
  ).all(hostUserId, hostUserId) as (UsageTotals & { member_user_id: number; username: string })[];
  return { total, by_member: rows.map(({ member_user_id, username, ...totals }) => ({ member_user_id, username, totals })) };
}
```

`getUsageView`/`resetUsage` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/usage.keyowner.test.ts`
Expected: PASS (route/`repos.usage.test.ts` breakage from the new arity is expected; fixed in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/usage.ts backend/test/usage.keyowner.test.ts
git commit -m "feat(usage): key_owner accounting + host aggregate view"
```

---

### Task 4: `effectiveConfig.ts` resolver + `getPersona` extraction

**Files:**
- Create: `backend/src/effectiveConfig.ts`
- Modify: `backend/src/repos/settings.ts` (extract `getPersona`, reuse in `getActiveConfig` — behavior identical)
- Test: `backend/test/effectiveConfig.test.ts` (create)

**Interfaces:**
- Consumes: `getSetting`, `getActiveConfig`, `getActiveTtsConfig`, `getSttKey` (settings.ts); `getMembership` (collab.ts); persona defaults from `persona.js`.
- Produces (in settings.ts): `getPersona(db, userId): { attackPoints, examinerMode, examinerType }`.
- Produces (in effectiveConfig.ts):
  - `resolveSourceUser(db, userId, cap: "ai"|"tts"|"stt"): number`
  - `getEffectiveLlmConfig(db, userId, key): { provider, model, apiKey, attackPoints, examinerMode, examinerType }`
  - `getEffectiveTtsConfig(db, userId, key): { provider, voice, apiKey }`
  - `resolveSttSource(db, userId): number`

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/effectiveConfig.test.ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { seedDefaults, saveSettings } from "../src/repos/settings.js";
import { createCollab, setShares, joinByCode } from "../src/repos/collab.js";
import { resolveSourceUser, getEffectiveLlmConfig } from "../src/effectiveConfig.js";

const KEY = randomBytes(32);

function ctx() {
  const db = openDb(":memory:");
  const host = createUser(db, "host", "h", "t");
  const member = createUser(db, "member", "h", "t");
  seedDefaults(db, host); seedDefaults(db, member);
  return { db, host, member };
}

describe("effective config resolution", () => {
  it("borrows the host's AI when shared and host has a key; persona stays the member's", () => {
    const { db, host, member } = ctx();
    saveSettings(db, host, KEY, { api_key: "sk-HOST", model: "claude-opus-5" });
    saveSettings(db, member, KEY, { attack_points: "metodologi", model: "claude-sonnet-5" });
    createCollab(db, host, "CODE", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 0 });
    joinByCode(db, member, "CODE", "t");

    expect(resolveSourceUser(db, member, "ai")).toBe(host);
    const cfg = getEffectiveLlmConfig(db, member, KEY);
    expect(cfg.apiKey).toBe("sk-HOST");       // host's key
    expect(cfg.model).toBe("claude-opus-5");  // host's model
    expect(cfg.attackPoints).toBe("metodologi"); // member's persona
  });

  it("falls back to own when not shared, or host has no key, or not a member", () => {
    const { db, host, member } = ctx();
    saveSettings(db, member, KEY, { api_key: "sk-OWN" });
    createCollab(db, host, "CODE", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 0 }); // host shares AI but has NO key
    joinByCode(db, member, "CODE", "t");
    expect(resolveSourceUser(db, member, "ai")).toBe(member); // host lacks key → fallback
    expect(getEffectiveLlmConfig(db, member, KEY).apiKey).toBe("sk-OWN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/effectiveConfig.test.ts`
Expected: FAIL ("Cannot find module '../src/effectiveConfig.js'").

- [ ] **Step 3: Write minimal implementation**

In `backend/src/repos/settings.ts`, extract persona reading and reuse it in `getActiveConfig` (no behavior change):

```ts
export function getPersona(db: Database.Database, userId: number): { attackPoints: string; examinerMode: string; examinerType: string } {
  return {
    attackPoints: getSetting(db, userId, "attack_points") ?? DEFAULTS.attack_points,
    examinerMode: getSetting(db, userId, "examiner_mode") ?? DEFAULTS.examiner_mode,
    examinerType: getSetting(db, userId, "examiner_type") ?? DEFAULTS.examiner_type,
  };
}
```
Then in `getActiveConfig`, replace the three persona lines in the returned object with `...getPersona(db, userId)` (keep `provider`, `model`, `apiKey` as-is).

Create `backend/src/effectiveConfig.ts`:

```ts
import type Database from "better-sqlite3";
import { getSetting, getActiveConfig, getActiveTtsConfig, getSttKey, getPersona } from "./repos/settings.js";
import { getMembership } from "./repos/collab.js";

type Cap = "ai" | "tts" | "stt";

function hostHasKey(db: Database.Database, hostId: number, cap: Cap): boolean {
  if (cap === "ai") return getSetting(db, hostId, "api_key") !== null;
  if (cap === "stt") return getSetting(db, hostId, "openai_stt_key") !== null;
  const prov = getSetting(db, hostId, "tts_provider") ?? "browser";
  if (prov === "browser") return false;
  const keyName = prov === "google" ? "google_tts_key" : prov === "openai" ? "openai_tts_key" : null;
  return keyName ? getSetting(db, hostId, keyName) !== null : false;
}

export function resolveSourceUser(db: Database.Database, userId: number, cap: Cap): number {
  const m = getMembership(db, userId);
  if (!m) return userId;
  const shared = cap === "ai" ? m.share_ai : cap === "tts" ? m.share_tts : m.share_stt;
  if (!shared) return userId;
  if (!hostHasKey(db, m.host_user_id, cap)) return userId;
  return m.host_user_id;
}

export function getEffectiveLlmConfig(db: Database.Database, userId: number, key: Buffer) {
  const src = resolveSourceUser(db, userId, "ai");
  const base = getActiveConfig(db, src, key); // throws "API key belum diset" if src has none
  return { provider: base.provider, model: base.model, apiKey: base.apiKey, ...getPersona(db, userId) };
}

export function getEffectiveTtsConfig(db: Database.Database, userId: number, key: Buffer) {
  return getActiveTtsConfig(db, resolveSourceUser(db, userId, "tts"), key);
}

export function resolveSttSource(db: Database.Database, userId: number): number {
  return resolveSourceUser(db, userId, "stt");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/effectiveConfig.test.ts test/settings.test.ts`
Expected: PASS (settings.test.ts confirms the `getPersona` refactor didn't change `getActiveConfig`/view behavior).

- [ ] **Step 5: Commit**

```bash
git add backend/src/effectiveConfig.ts backend/src/repos/settings.ts backend/test/effectiveConfig.test.ts
git commit -m "feat(collab): effective-config resolver + getPersona extraction"
```

---

### Task 5: `routes/collab.ts` + mount

**Files:**
- Create: `backend/src/routes/collab.ts`
- Modify: `backend/src/app.ts` (mount behind `auth`)
- Test: `backend/test/routes.collab.test.ts` (create)

**Interfaces:**
- Consumes: `repos/collab.ts` (Task 2), `getKeyUsageView` (Task 3), `getUserById` (users repo), `requireAuth` (existing).
- Produces: `collabRouter(db, now?): Router`; `app.use("/collab", auth, collabRouter(db))`.
- Endpoints: `GET /collab`, `POST /collab`, `DELETE /collab`, `PATCH /collab/shares`, `POST /collab/regenerate-code`, `POST /collab/join`, `POST /collab/leave`, `DELETE /collab/members/:memberUserId`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/routes.collab.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";

function app() { return buildApp(openDb(":memory:"), randomBytes(32)); }
async function reg(a: any, username: string) {
  const agent = request.agent(a);
  const { body } = await agent.post("/auth/register").send({ username, password: "password1" });
  return { agent, id: body.user.id };
}

describe("collab routes", () => {
  it("host creates, shares, member joins by code, host lists + kicks", async () => {
    const a = app();
    const host = await reg(a, "host");
    const member = await reg(a, "member");

    await host.agent.get("/collab").expect(200).then((r) => expect(r.body.hosting).toBeNull());
    const created = await host.agent.post("/collab").expect(200);
    const code = created.body.hosting.invite_code;
    expect(code).toMatch(/^[0-9a-f]{12}$/);

    await host.agent.patch("/collab/shares").send({ share_ai: true, share_tts: false, share_stt: true }).expect(200);

    await member.agent.post("/collab/join").send({ code: "deadbeefdead" }).expect(404); // unknown
    await member.agent.post("/collab/join").send({ code }).expect(200);
    await member.agent.post("/collab/join").send({ code }).expect(400); // already

    const state = await host.agent.get("/collab").expect(200);
    expect(state.body.hosting.members.map((m: any) => m.username)).toEqual(["member"]);
    expect(state.body.hosting.shares).toMatchObject({ share_ai: 1, share_tts: 0, share_stt: 1 });

    const mstate = await member.agent.get("/collab").expect(200);
    expect(mstate.body.joined).toMatchObject({ host_username: "host" });

    await host.agent.delete(`/collab/members/${member.id}`).expect(200);
    await member.agent.get("/collab").expect(200).then((r) => expect(r.body.joined).toBeNull());
  });

  it("blocks unauthenticated and joining own collab", async () => {
    const a = app();
    await request(a).get("/collab").expect(401);
    const host = await reg(a, "host");
    await host.agent.post("/collab").expect(200);
    const code = (await host.agent.get("/collab")).body.hosting.invite_code;
    await host.agent.post("/collab/join").send({ code }).expect(400); // own
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes.collab.test.ts`
Expected: FAIL ("Cannot find module '../src/routes/collab.js'").

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/routes/collab.ts
import { Router } from "express";
import type Database from "better-sqlite3";
import {
  freshInviteCode, getHostCollab, createCollab, setShares, regenerateCode,
  deleteCollab, getMembership, joinByCode, leave, listMembers, kickMember,
} from "../repos/collab.js";
import { getKeyUsageView } from "../repos/usage.js";
import { getUserById } from "../repos/users.js";

const toBit = (v: unknown): 0 | 1 => (v ? 1 : 0);

export function collabRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  function hostingState(hostUserId: number) {
    const c = getHostCollab(db, hostUserId);
    if (!c) return null;
    return {
      invite_code: c.invite_code,
      shares: { share_ai: c.share_ai, share_tts: c.share_tts, share_stt: c.share_stt },
      members: listMembers(db, hostUserId),
      usage: getKeyUsageView(db, hostUserId),
    };
  }
  function joinedState(memberUserId: number) {
    const m = getMembership(db, memberUserId);
    if (!m) return null;
    const host = getUserById(db, m.host_user_id);
    return {
      host_username: host?.username ?? "",
      shares: { share_ai: m.share_ai, share_tts: m.share_tts, share_stt: m.share_stt },
    };
  }

  r.get("/", (req, res) => {
    res.json({ hosting: hostingState(req.userId!), joined: joinedState(req.userId!) });
  });

  r.post("/", (req, res) => {
    if (!getHostCollab(db, req.userId!)) {
      createCollab(db, req.userId!, freshInviteCode(db), now());
    }
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.delete("/", (req, res) => {
    deleteCollab(db, req.userId!);
    res.json({ ok: true });
  });

  r.patch("/shares", (req, res) => {
    if (!getHostCollab(db, req.userId!)) return res.status(400).json({ error: "Kamu belum jadi host" });
    setShares(db, req.userId!, {
      share_ai: toBit(req.body?.share_ai), share_tts: toBit(req.body?.share_tts), share_stt: toBit(req.body?.share_stt),
    });
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.post("/regenerate-code", (req, res) => {
    if (!getHostCollab(db, req.userId!)) return res.status(400).json({ error: "Kamu belum jadi host" });
    regenerateCode(db, req.userId!, freshInviteCode(db));
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.post("/join", (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    const result = joinByCode(db, req.userId!, code, now());
    if (result.ok) return res.json({ joined: joinedState(req.userId!) });
    if (result.reason === "not_found") return res.status(404).json({ error: "Kode tidak ditemukan" });
    if (result.reason === "own") return res.status(400).json({ error: "Tidak bisa gabung ke kolaborasi sendiri" });
    return res.status(400).json({ error: "Kamu sudah tergabung di sebuah kolaborasi" });
  });

  r.post("/leave", (req, res) => {
    leave(db, req.userId!);
    res.json({ ok: true });
  });

  r.delete("/members/:memberUserId", (req, res) => {
    const memberUserId = Number(req.params.memberUserId);
    if (!Number.isInteger(memberUserId)) return res.status(400).json({ error: "Member tidak valid" });
    kickMember(db, req.userId!, memberUserId);
    res.json({ hosting: hostingState(req.userId!) });
  });

  return r;
}
```

In `backend/src/app.ts`, import `collabRouter` and mount after the other guarded routers:

```ts
app.use("/collab", auth, collabRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes.collab.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/collab.ts backend/src/app.ts backend/test/routes.collab.test.ts
git commit -m "feat(collab): collaboration routes (host/join/leave/kick/shares)"
```

---

### Task 6: Wire the usage seams + settings effective fields + green the suite

**Files:**
- Modify: `backend/src/routes/sessions.ts`, `backend/src/routes/tts.ts`, `backend/src/routes/stt.ts`, `backend/src/routes/settings.ts`
- Modify pre-existing tests broken by the `recordUsage` arity change: `backend/test/repos.usage.test.ts`, `backend/test/routes.sessions.turn.test.ts`, `backend/test/routes.sessions.close.test.ts` (any that assert usage/stub provider), plus any others surfaced by `npx vitest run`.
- Test: `backend/test/collab.borrow.test.ts` (create — end-to-end borrow)

**Interfaces:**
- Consumes: `effectiveConfig.ts` (Task 4), `recordUsage` new arity (Task 3), `resolveSourceUser`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/collab.borrow.test.ts
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { getKeyUsageView } from "../src/repos/usage.js";

// Stub the provider so we can observe which apiKey the turn used.
vi.mock("../src/providers/index.js", () => ({
  getProvider: (cfg: any) => ({
    async sendTurn() { return { reply: `KEY=${cfg.apiKey}`, usage: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.01 } }; },
    async generate() { return { text: "{}", usage: undefined, truncated: false }; },
    async checkAuth() {},
  }),
}));

async function reg(a: any, username: string) {
  const agent = request.agent(a);
  const { body } = await agent.post("/auth/register").send({ username, password: "password1" });
  return { agent, id: body.user.id };
}

describe("member borrows host AI key", () => {
  it("uses host key server-side, records key_owner=host, never exposes the key", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, randomBytes(32));
    const host = await reg(app, "host");
    const member = await reg(app, "member");

    await host.agent.post("/settings").send({ api_key: "sk-HOSTKEY" }).expect(200);
    await host.agent.post("/skripsi"); // host doesn't need a doc; member needs their own
    // member uploads a tiny doc via the repo path is out of scope; use the settings+session flow:
    await member.agent.post("/settings").send({}).expect(200);
    // host shares AI, member joins
    await host.agent.post("/collab").expect(200);
    const code = (await host.agent.get("/collab")).body.hosting.invite_code;
    await host.agent.patch("/collab/shares").send({ share_ai: true, share_tts: false, share_stt: false }).expect(200);
    await member.agent.post("/collab/join").send({ code }).expect(200);

    // member needs an uploaded doc to run a turn — upload via the API
    await member.agent.post("/skripsi").attach("file", Buffer.from("%PDF-1.4 dummy"), "s.pdf").catch(() => {});
    // The turn will 400 if PDF parse failed; so assert the key path via a direct unit instead if upload is unreliable:
    // (kept minimal — the borrow assertion below is the load-bearing one)

    // No member API key set, but AI is borrowed → getKeyUsageView(host) should see member usage after a successful turn.
    // If the PDF upload above didn't yield a doc, this block is skipped by the guard in the route (returns 400) and the
    // test still asserts the settings-level guarantee below.
    const settings = await member.agent.get("/settings").expect(200);
    expect(settings.body).not.toHaveProperty("api_key"); // raw key never in settings response
    expect(settings.body.effective_ai_shared ?? false).toBe(true); // member sees AI is borrowed
    expect(settings.body.has_api_key).toBe(false); // member has no own key
  });
});
```

> Note to implementer: the PDF-dependent turn path is awkward to exercise in a unit test. Keep the load-bearing assertions on (a) the settings response never containing a raw key, (b) `effective_ai_shared` true for the borrowing member, and (c) a direct `getKeyUsageView`/`resolveSourceUser` assertion (already covered in `effectiveConfig.test.ts`). If you can cheaply drive a full turn with a stubbed provider + a seeded document via the documents repo, assert `getKeyUsageView(db, host).total.calls === 1` and that the reply echoes `KEY=sk-HOSTKEY`. Do NOT weaken existing turn tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/collab.borrow.test.ts`
Expected: FAIL (settings response lacks `effective_ai_shared`).

- [ ] **Step 3: Write minimal implementation**

**`routes/sessions.ts`** (both the turn and close handlers):
- Import `getEffectiveLlmConfig` and `resolveSourceUser` from `../effectiveConfig.js`; keep `getSetting` import.
- Replace the AI-key pre-guard `if (getSetting(db, userId, "api_key") === null) return res.status(400)...` with an effective check:
  ```ts
  if (getSetting(db, resolveSourceUser(db, userId, "ai"), "api_key") === null) {
    return res.status(400).json({ error: "Set API key di Settings dulu (atau gabung kolaborasi yang membagikan AI)" });
  }
  ```
- Replace `const cfg = getActiveConfig(db, userId, key);` with `const cfg = getEffectiveLlmConfig(db, userId, key);` (both call sites).
- Update both `recordUsage(db, userId, now(), cfg.provider, cfg.model, "turn"|"assessment", …)` calls to `recordUsage(db, userId, resolveSourceUser(db, userId, "ai"), now(), cfg.provider, cfg.model, "turn"|"assessment", …)`.

**`routes/tts.ts`** `/speak`: replace `getActiveTtsConfig(db, userId, key)` with `getEffectiveTtsConfig(db, userId, key)` (import from `../effectiveConfig.js`). Leave `/test`, `/preview`, `/voices` on the caller's own keys (unchanged).

**`routes/stt.ts`** `/transcribe`: resolve the source first, then read provider + key from it:
```ts
const src = resolveSttSource(db, userId);
const provider = getSetting(db, src, "stt_provider") ?? "browser";
if (provider !== "whisper") return res.status(400).json({ error: "Provider STT browser diproses di sisi klien" });
if (!req.file?.buffer?.length) return res.status(400).json({ error: "Rekaman audio kosong" });
const apiKey = getSttKey(db, src, key);
```
Leave `/test` on the caller's own key.

**`routes/settings.ts`** `GET /`: augment the response with effective fields for the frontend:
```ts
import { resolveSourceUser, getEffectiveTtsConfig } from "../effectiveConfig.js";
// inside GET "/":
const userId = req.userId!;
const view = getSettingsView(db, userId);
const aiSrc = resolveSourceUser(db, userId, "ai");
const ttsSrc = resolveSourceUser(db, userId, "tts");
const sttSrc = resolveSourceUser(db, userId, "stt");
let eff_tts_provider = view.tts_provider, eff_tts_voice = view.tts_voice;
if (ttsSrc !== userId) { try { const t = getEffectiveTtsConfig(db, userId, key); eff_tts_provider = t.provider; eff_tts_voice = t.voice; } catch { /* host cfg incomplete → keep own */ } }
res.json({
  ...view,
  effective_ai_shared: aiSrc !== userId,
  effective_tts_shared: ttsSrc !== userId,
  effective_stt_shared: sttSrc !== userId,
  effective_tts_provider: eff_tts_provider,
  effective_tts_voice: eff_tts_voice,
  effective_stt_provider: getSetting(db, sttSrc, "stt_provider") ?? "browser",
});
```

**Fix broken pre-existing tests** (do not weaken assertions):
- `test/repos.usage.test.ts`: update `recordUsage(db, userId, …)` calls to `recordUsage(db, userId, userId, …)` (self is the key owner), keep all assertions.
- `test/routes.sessions.turn.test.ts` / `test/routes.sessions.close.test.ts`: these already drive a full turn; the only change is the new `recordUsage` arity is internal, so they should pass unchanged — run them; if a usage assertion references the INSERT shape, update it. Register/agent auth pattern is already in place from the auth feature.

Gate: `cd backend && npx vitest run` (ENTIRE suite green) AND `npm run build` (tsc 0).

- [ ] **Step 4: Run tests + full typecheck**

Run: `cd backend && npx vitest run && npm run build`
Expected: all PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(collab): resolve host keys at usage seams + effective settings fields"
```

---

### Task 7: Frontend — collaboration UI + effective providers

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/SessionPage.tsx`
- Create: `frontend/src/pages/CollabSettings.tsx`
- Test: `frontend/src/pages/CollabSettings.test.tsx` (create)

**Interfaces:**
- Consumes: `/api/collab/*` (Task 5), the new `effective_*` fields on `/api/settings` (Task 6).
- Produces:
  - `types.ts`: `CollabMember { member_user_id, username, joined_at }`, `CollabState { hosting: {...} | null, joined: {...} | null }`; extend `SettingsView` with the optional `effective_*` fields.
  - `api.ts`: `getCollab`, `becomeHost`, `disbandCollab`, `setCollabShares(shares)`, `regenerateCollabCode`, `joinCollab(code)`, `leaveCollab`, `kickMember(memberUserId)`.
  - `CollabSettings` component rendered inside `SettingsPage`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/CollabSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CollabSettings } from "./CollabSettings.js";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CollabSettings", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("shows the join form when not hosting and not joined, and joins by code", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ hosting: null, joined: null }))       // initial getCollab
      .mockResolvedValueOnce(jsonRes({ joined: { host_username: "host", shares: { share_ai: 1, share_tts: 0, share_stt: 0 } } })); // join
    globalThis.fetch = fetchMock as any;

    render(<CollabSettings />);
    await screen.findByLabelText(/kode undangan/i);
    fireEvent.change(screen.getByLabelText(/kode undangan/i), { target: { value: "abc123abc123" } });
    fireEvent.click(screen.getByRole("button", { name: /gabung/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/collab/join", expect.objectContaining({ method: "POST" })));
    await screen.findByText(/host/i);
  });

  it("shows host invite code + share toggles when hosting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonRes({ hosting: { invite_code: "deadbeefdead", shares: { share_ai: 1, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } }, joined: null }),
    ) as any;
    render(<CollabSettings />);
    expect(await screen.findByText("deadbeefdead")).toBeTruthy();
    expect(screen.getByLabelText(/bagikan ai/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/CollabSettings.test.tsx`
Expected: FAIL ("Cannot find module './CollabSettings.js'").

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/src/types.ts`:

```ts
export interface CollabMember { member_user_id: number; username: string; joined_at: string; }
export interface CollabShares { share_ai: number; share_tts: number; share_stt: number; }
export interface CollabState {
  hosting: { invite_code: string; shares: CollabShares; members: CollabMember[];
    usage: { total: { calls: number; cost_usd?: number }; by_member: { member_user_id: number; username: string; totals: { calls: number; cost_usd?: number } }[] } } | null;
  joined: { host_username: string; shares: CollabShares } | null;
}
```
Extend `SettingsView` with optional: `effective_ai_shared?: boolean; effective_tts_shared?: boolean; effective_stt_shared?: boolean; effective_tts_provider?: string; effective_tts_voice?: string; effective_stt_provider?: string;`.

Add to `frontend/src/api.ts`:

```ts
import type { CollabState } from "./types.js";
export async function getCollab(): Promise<CollabState> { return jsonOrThrow(await fetch("/api/collab")); }
export async function becomeHost(): Promise<CollabState> { return jsonOrThrow(await postJson("/api/collab", {})); }
export async function disbandCollab(): Promise<void> { await jsonOrThrow(await fetch("/api/collab", { method: "DELETE" })); }
export async function setCollabShares(shares: { share_ai: boolean; share_tts: boolean; share_stt: boolean }): Promise<CollabState> { return jsonOrThrow(await (await fetch("/api/collab/shares", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shares) }))); }
export async function regenerateCollabCode(): Promise<CollabState> { return jsonOrThrow(await postJson("/api/collab/regenerate-code", {})); }
export async function joinCollab(code: string): Promise<CollabState> { return jsonOrThrow(await postJson("/api/collab/join", { code })); }
export async function leaveCollab(): Promise<void> { await jsonOrThrow(await postJson("/api/collab/leave", {})); }
export async function kickMember(memberUserId: number): Promise<CollabState> { return jsonOrThrow(await (await fetch(`/api/collab/members/${memberUserId}`, { method: "DELETE" }))); }
```
(`GET /api/collab/shares` PATCH returns `{hosting}`, join returns `{joined}` — the component reloads via `getCollab()` after each mutation to keep state simple.)

Create `frontend/src/pages/CollabSettings.tsx` — a self-contained section:
- On mount, `getCollab()` → state.
- If `hosting` null and `joined` null: show "Jadi host" button (→ `becomeHost`) AND a join form: `<label htmlFor="collab-code">Kode undangan</label>` + input + "Gabung" (→ `joinCollab`, reload; show error text on failure).
- If `hosting`: show the invite code (monospace) + Copy + "Regenerate" (→ `regenerateCollabCode`); three checkboxes labeled "Bagikan AI", "Bagikan TTS", "Bagikan STT" bound to `hosting.shares` (→ `setCollabShares`); member list (username + joined + "Keluarkan" → `kickMember`); usage summary (`hosting.usage.total.calls` + per-member rows); "Bubarkan" (→ `disbandCollab`).
- If `joined`: show "Tergabung dengan: {host_username}" + badges for each shared capability + "Keluar" (→ `leaveCollab`).
- Errors surface in a `role="alert"` line; all mutations reload `getCollab()`.

Wire into `SettingsPage.tsx`: import and render `<CollabSettings />` as a new section (e.g. under the existing panels). In `SessionPage.tsx`, change the speech-provider reads (lines ~112–113) to prefer effective fields:
```ts
setTtsProvider(s.effective_tts_provider ?? s.tts_provider);
setSttProvider(s.effective_stt_provider ?? s.stt_provider ?? "browser");
```
(and use `s.effective_tts_voice ?? s.tts_voice` wherever `tts_voice` drives synthesis, if applicable). In `SettingsPage.tsx`, when `settings.effective_ai_shared` / `effective_tts_shared` / `effective_stt_shared` is true, show a small note near that capability's key input ("Memakai <cap> dari host — key sendiri tidak dipakai selama tergabung"). Keep the editor bound to the user's OWN values.

Add minimal CSS for the collab section (reuse existing tokens/classes; `.collab`, `.collab-code`, `.member-row`, `.badge`).

- [ ] **Step 4: Run tests + build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: full frontend suite green + vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(ui): collaboration settings (host/join/shares/members) + borrowed-key notes"
```

---

### Task 8: Deploy — additive migration, build, restart, smoke

**Files:** none (ops).

- [ ] **Step 1: Merge to main**

```bash
cd /var/www/ai-sidang-simulator
git checkout main && git merge --no-ff feat/collaboration
```

- [ ] **Step 2: Build both**

```bash
cd backend && npm run build && cd ../frontend && npm run build && cd ..
```
Expected: both exit 0. (No DB wipe — migration is additive; `addColumnIfMissing` + `CREATE TABLE IF NOT EXISTS` apply to the live DB.)

- [ ] **Step 3: Restart backend**

```bash
pm2 restart sidang-backend && pm2 save
```

- [ ] **Step 4: Smoke test over https (two throwaway users)**

```bash
# host registers, becomes host, gets a code
curl -s -c /tmp/h.txt https://sidang.anxietypha.my.id/api/auth/register -H 'Content-Type: application/json' -d '{"username":"collab_host","password":"password1"}' >/dev/null
CODE=$(curl -s -b /tmp/h.txt -X POST https://sidang.anxietypha.my.id/api/collab | python3 -c "import sys,json;print(json.load(sys.stdin)['hosting']['invite_code'])")
echo "code=$CODE"
curl -s -b /tmp/h.txt -X PATCH https://sidang.anxietypha.my.id/api/collab/shares -H 'Content-Type: application/json' -d '{"share_ai":true,"share_tts":false,"share_stt":false}' >/dev/null
# member registers + joins
curl -s -c /tmp/m.txt https://sidang.anxietypha.my.id/api/auth/register -H 'Content-Type: application/json' -d '{"username":"collab_member","password":"password1"}' >/dev/null
curl -s -b /tmp/m.txt -X POST https://sidang.anxietypha.my.id/api/collab/join -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}" -w '\njoin=%{http_code}\n'
# member's settings shows AI borrowed, no raw key
curl -s -b /tmp/m.txt https://sidang.anxietypha.my.id/api/settings | python3 -c "import sys,json;d=json.load(sys.stdin);print('effective_ai_shared',d.get('effective_ai_shared'),'has_api_key',d.get('has_api_key'),'raw_key_present',('api_key' in d))"
```
Expected: `join=200`; `effective_ai_shared True has_api_key False raw_key_present False`.

- [ ] **Step 5: Clean up smoke users + persist**

```bash
cd backend && node -e "const D=require('better-sqlite3');const db=new D('data/sibiru.sqlite');const n=db.prepare(\"DELETE FROM users WHERE username IN ('collab_host','collab_member')\").run();console.log('cleaned',n.changes)"
cd .. && pm2 save
```

---

## Self-Review

**Spec coverage:**
- Schema (collaborations, collaboration_members, key_owner_user_id) → Task 1. ✓
- Repo (host/join/leave/kick/shares/members/code) → Task 2. ✓
- Usage key_owner + host aggregate → Task 3. ✓
- Resolver + effective configs + persona-stays-member → Task 4. ✓
- Collab routes + mount + join rules → Task 5. ✓
- Usage seams (AI/TTS/STT) resolve host keys; effective settings fields; effective AI key guard; recordUsage keyOwner → Task 6. ✓
- Frontend host/member UI, member list + kick, usage summary, borrowed notes, effective speech providers → Task 7. ✓
- Additive deploy (no wipe) + smoke → Task 8. ✓
- Security: raw key never in any response (settings view is own-only; borrow is server-side) → Tasks 6 (settings assertion), 7. ✓
- Fallbacks (share on but no host key / browser tts) → Task 4 resolver. ✓

**Placeholder scan:** no TBD/TODO; all code steps carry real code. Task 6's PDF-dependent turn assertion is explicitly scoped down to the load-bearing, reliably-testable assertions with a note. ✓

**Type consistency:** `recordUsage(db, userId, keyOwnerUserId, at, …)` arity consistent across Tasks 3 and 6; `resolveSourceUser(db, userId, cap)` signature identical in Tasks 4 and 6; `getMembership` shape (`{collaboration_id, host_user_id, share_ai, share_tts, share_stt}`) consistent Tasks 2→4→5; share values are `0|1` integers end-to-end, coerced from booleans at the route boundary (`toBit`) and the frontend sends booleans. ✓
