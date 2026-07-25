# Realistic Sidang + Results Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidang simulation long and multi-topic like a real thesis defense, let the AI examiner *propose* closing (user confirms), and show a scored results page with feedback.

**Architecture:** A phased-agenda persona drives many questions across real sidang phases. When the examiner is satisfied it appends a hidden `[[CUKUP]]` marker; the backend strips it and, past a minimum-question floor + post-decline cooldown, returns `propose_close`. On user confirmation, a separate LLM call scores the whole transcript against a 4-dimension rubric and persists the assessment; a results page renders it. Closing is gated behind a confirmation modal (AI-proposed or user-initiated).

**Tech Stack:** Backend — Node + Express + better-sqlite3 + TypeScript, tested with vitest + supertest. Frontend — React + Vite + TypeScript, tested with vitest + @testing-library/react.

## Global Constraints

- All user-facing copy is in Bahasa Indonesia.
- Never leak provider internals or API keys in error responses (follow existing `catch` pattern in `routes/sessions.ts`).
- ES module imports use the `.js` extension on relative paths (e.g. `import { x } from "./sidang.js"`), matching the codebase.
- Backend tests use `openDb(":memory:")` + `randomBytes(32)` key; OpenRouter provider is configured so LLM calls go through global `fetch` (stub with `vi.stubGlobal`).
- Flow constants (verbatim): `CLOSE_MARKER = "[[CUKUP]]"`, `MIN_EXAMINER_QUESTIONS = 10`, `CLOSE_COOLDOWN = 3`.
- Rubric dimensions (verbatim keys): `penguasaan_materi`, `metodologi`, `kualitas_orisinalitas`, `argumentasi`.
- Grade thresholds: A ≥ 85, B ≥ 70, C ≥ 55, else D. Verdict thresholds: ≥ 80 "Lulus", ≥ 60 "Lulus dengan revisi", else "Tidak lulus".

---

## File map

**Backend (create):**
- `backend/src/sidang.ts` — flow constants + pure helpers `stripCloseMarker`, `shouldProposeClose`.
- `backend/src/assessment.ts` — `Assessment` type, prompt builders, `formatTranscript`, `parseAssessment`, `deriveGrade`, `deriveVerdict`.
- `backend/test/sidang.test.ts`, `backend/test/assessment.test.ts`.

**Backend (modify):**
- `backend/src/db.ts` — idempotent column adds on `sessions`.
- `backend/src/repos/sessions.ts` — new helpers + `listSessions` fields.
- `backend/src/persona.ts` — `SIDANG_PHASES`, `buildAgendaRules`, wire into `buildPersona`.
- `backend/src/providers/types.ts`, `claude.ts`, `openrouter.ts` — add `generate()`.
- `backend/src/routes/sessions.ts` — closed-guard + marker/propose on turn; `continue`, `close`, `result` routes.

**Frontend (create):**
- `frontend/src/pages/ResultPage.tsx`, `frontend/src/pages/ResultPage.test.tsx`.

**Frontend (modify):**
- `frontend/src/types.ts` — `Assessment`, `SessionSummary` fields.
- `frontend/src/api.ts` — `postTurn` shape, `continueSession`, `closeSession`, `getResult`.
- `frontend/src/components/ConfirmModal.tsx` — optional labels.
- `frontend/src/pages/SessionPage.tsx` — close flow.
- `frontend/src/App.tsx` — result view wiring.
- `frontend/src/pages/HistoryPage.tsx` — status badge + Lihat Hasil.
- `frontend/src/styles.css` — result page styles.
- Test updates: `frontend/src/api.test.ts`, `frontend/src/pages/SessionPage.test.tsx`, `frontend/src/pages/HistoryPage.test.tsx`.

---

## Task 1: Sidang flow helpers

**Files:**
- Create: `backend/src/sidang.ts`
- Test: `backend/test/sidang.test.ts`

**Interfaces:**
- Produces: `CLOSE_MARKER: string`, `MIN_EXAMINER_QUESTIONS: number`, `CLOSE_COOLDOWN: number`, `stripCloseMarker(reply: string): { reply: string; hasMarker: boolean }`, `shouldProposeClose(p: { hasMarker: boolean; examinerCount: number; declinedTurn: number | null }): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/sidang.test.ts
import { describe, it, expect } from "vitest";
import {
  CLOSE_MARKER,
  MIN_EXAMINER_QUESTIONS,
  CLOSE_COOLDOWN,
  stripCloseMarker,
  shouldProposeClose,
} from "../src/sidang.js";

describe("stripCloseMarker", () => {
  it("removes the marker and trims trailing whitespace", () => {
    const out = stripCloseMarker(`Baik, saya rasa cukup.\n\n${CLOSE_MARKER}`);
    expect(out.hasMarker).toBe(true);
    expect(out.reply).toBe("Baik, saya rasa cukup.");
  });

  it("reports no marker and returns the reply unchanged (trimmed)", () => {
    const out = stripCloseMarker("Apa kontribusi utama Anda?");
    expect(out.hasMarker).toBe(false);
    expect(out.reply).toBe("Apa kontribusi utama Anda?");
  });
});

describe("shouldProposeClose", () => {
  it("is false without the marker", () => {
    expect(
      shouldProposeClose({ hasMarker: false, examinerCount: 20, declinedTurn: null }),
    ).toBe(false);
  });

  it("is false below the minimum-question floor", () => {
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: MIN_EXAMINER_QUESTIONS - 1,
        declinedTurn: null,
      }),
    ).toBe(false);
  });

  it("is true at/above the floor with the marker and no prior decline", () => {
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: MIN_EXAMINER_QUESTIONS,
        declinedTurn: null,
      }),
    ).toBe(true);
  });

  it("suppresses during the cooldown after a decline", () => {
    const declinedTurn = 12;
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: declinedTurn + CLOSE_COOLDOWN - 1,
        declinedTurn,
      }),
    ).toBe(false);
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: declinedTurn + CLOSE_COOLDOWN,
        declinedTurn,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/sidang.test.ts`
Expected: FAIL — cannot find module `../src/sidang.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/sidang.ts
export const CLOSE_MARKER = "[[CUKUP]]";
export const MIN_EXAMINER_QUESTIONS = 10;
export const CLOSE_COOLDOWN = 3;

export function stripCloseMarker(reply: string): { reply: string; hasMarker: boolean } {
  const hasMarker = reply.includes(CLOSE_MARKER);
  const cleaned = reply.split(CLOSE_MARKER).join("").trim();
  return { reply: cleaned, hasMarker };
}

export function shouldProposeClose(p: {
  hasMarker: boolean;
  examinerCount: number;
  declinedTurn: number | null;
}): boolean {
  if (!p.hasMarker) return false;
  if (p.examinerCount < MIN_EXAMINER_QUESTIONS) return false;
  const floor = (p.declinedTurn ?? 0) + CLOSE_COOLDOWN;
  return p.examinerCount >= floor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/sidang.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sidang.ts backend/test/sidang.test.ts
git commit -m "feat(sidang): flow constants + close-marker/propose helpers"
```

---

## Task 2: Persona phased agenda

**Files:**
- Modify: `backend/src/persona.ts`
- Test: `backend/test/persona.test.ts` (add cases)

**Interfaces:**
- Consumes: `CLOSE_MARKER` from `./sidang.js`.
- Produces: `SIDANG_PHASES: string[]`, `buildAgendaRules(): string`; `buildPersona(mode, attackPoints)` now includes agenda rules.

- [ ] **Step 1: Write the failing test** (append to `backend/test/persona.test.ts`)

```ts
import { SIDANG_PHASES, buildAgendaRules } from "../src/persona.js";
import { CLOSE_MARKER } from "../src/sidang.js";

describe("persona agenda", () => {
  it("lists all sidang phases in order", () => {
    expect(SIDANG_PHASES[0]).toBe("Pembukaan");
    expect(SIDANG_PHASES[SIDANG_PHASES.length - 1]).toBe("Penutup");
    expect(SIDANG_PHASES).toContain("Metodologi");
  });

  it("agenda rules instruct to use the marker only when done", () => {
    const rules = buildAgendaRules();
    expect(rules).toContain(CLOSE_MARKER);
    expect(rules).toMatch(/JANGAN menyatakan sidang selesai/);
  });

  it("buildPersona embeds the agenda and the marker rule", () => {
    const p = buildPersona("standar", "");
    expect(p).toContain("AGENDA SIDANG");
    expect(p).toContain(CLOSE_MARKER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/persona.test.ts`
Expected: FAIL — `SIDANG_PHASES`/`buildAgendaRules` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `backend/src/persona.ts` — new import at top:

```ts
import { CLOSE_MARKER } from "./sidang.js";
```

Add before `buildPersona`:

```ts
export const SIDANG_PHASES = [
  "Pembukaan",
  "Latar Belakang & Rumusan Masalah",
  "Tinjauan Pustaka",
  "Metodologi",
  "Hasil & Pembahasan",
  "Kesimpulan & Kontribusi",
  "Penutup",
];

export function buildAgendaRules(): string {
  const list = SIDANG_PHASES.map((p, i) => `${i + 1}. ${p}`).join("\n");
  return `AGENDA SIDANG (ikuti berurutan, jangan buru-buru):
${list}

Aturan jalannya sidang:
- Telusuri setiap fase secara berurutan; ajukan minimal 2 pertanyaan menggali pada fase inti (Latar Belakang, Tinjauan Pustaka, Metodologi, Hasil & Pembahasan, Kesimpulan & Kontribusi).
- Kejar jawaban yang dangkal atau menghindar sebelum pindah fase. Sidang harus panjang dan menyeluruh.
- JANGAN menyatakan sidang selesai atau cukup di dalam teks balasan.
- Hanya setelah SEMUA fase termasuk Penutup benar-benar terbahas, tempel penanda ${CLOSE_MARKER} sebagai baris terakhir balasan Anda — dan hanya saat itu. Tanpa penanda, sidang dianggap masih berjalan.`;
}
```

In `buildPersona`, insert the agenda rules between the mode tone and the attack points:

```ts
export function buildPersona(mode: string, attackPoints: string): string {
  const selected = EXAMINER_MODES[mode] ?? EXAMINER_MODES[DEFAULT_EXAMINER_MODE];
  const parts = [PERSONA_TONE, selected.tone, buildAgendaRules()];
  const trimmed = (attackPoints ?? "").trim();
  if (trimmed) {
    parts.push(`POIN SERANGAN (prioritaskan):\n${trimmed}`);
  }
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/persona.test.ts`
Expected: PASS (existing persona cases still pass — `1–2 kalimat`, `35 kata`, mode tone, attack points unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/src/persona.ts backend/test/persona.test.ts
git commit -m "feat(persona): phased sidang agenda + close-marker rule"
```

---

## Task 3: DB migration — session lifecycle columns

**Files:**
- Modify: `backend/src/db.ts`
- Test: `backend/test/db.test.ts` (add a case)

**Interfaces:**
- Produces: `sessions` table gains columns `status TEXT NOT NULL DEFAULT 'active'`, `closed_at TEXT`, `assessment TEXT`, `close_declined_turn INTEGER`. Migration is idempotent (safe on existing DBs and repeated `openDb`).

- [ ] **Step 1: Write the failing test** (append to `backend/test/db.test.ts`)

```ts
import { openDb } from "../src/db.js";

describe("sessions lifecycle columns", () => {
  it("adds status/closed_at/assessment/close_declined_turn with status default 'active'", () => {
    const db = openDb(":memory:");
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(
      expect.arrayContaining(["status", "closed_at", "assessment", "close_declined_turn"]),
    );

    db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
      "s1",
      "2026-01-01T00:00:00Z",
      null,
    );
    const row = db.prepare("SELECT status FROM sessions WHERE id = ?").get("s1") as {
      status: string;
    };
    expect(row.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: FAIL — columns not present.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/db.ts`, add a helper and call it inside `openDb` after `db.exec(MIGRATION)`:

```ts
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
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.ts backend/test/db.test.ts
git commit -m "feat(db): idempotent session lifecycle columns"
```

---

## Task 4: Sessions repo — lifecycle helpers + list fields

**Files:**
- Modify: `backend/src/repos/sessions.ts`
- Test: `backend/test/repos.sessions.lifecycle.test.ts` (create)

**Interfaces:**
- Consumes: `Database` from better-sqlite3.
- Produces:
  - `countExaminerTurns(db, sessionId): number`
  - `interface SessionMeta { status: string; closed_at: string | null; assessment: string | null; close_declined_turn: number | null }`
  - `getSessionMeta(db, sessionId): SessionMeta | null`
  - `setCloseDeclined(db, sessionId, examinerTurn: number): void`
  - `closeWithAssessment(db, sessionId, closedAt: string, assessmentJson: string): void`
  - `SessionSummary` gains `status: string` and `final_score: number | null`; `listSessions` returns them.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/repos.sessions.lifecycle.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createSession,
  addTurn,
  countExaminerTurns,
  getSessionMeta,
  setCloseDeclined,
  closeWithAssessment,
  listSessions,
} from "../src/repos/sessions.js";

function seed() {
  const db = openDb(":memory:");
  createSession(db, "s1", "2026-01-01T00:00:00Z", null);
  return db;
}

describe("sessions lifecycle repo", () => {
  it("counts only examiner turns", () => {
    const db = seed();
    addTurn(db, "s1", 1, "user", "a", "t");
    addTurn(db, "s1", 2, "examiner", "q1", "t");
    addTurn(db, "s1", 3, "user", "b", "t");
    addTurn(db, "s1", 4, "examiner", "q2", "t");
    expect(countExaminerTurns(db, "s1")).toBe(2);
  });

  it("defaults to active meta then records a decline", () => {
    const db = seed();
    expect(getSessionMeta(db, "s1")).toMatchObject({
      status: "active",
      closed_at: null,
      assessment: null,
      close_declined_turn: null,
    });
    setCloseDeclined(db, "s1", 11);
    expect(getSessionMeta(db, "s1")?.close_declined_turn).toBe(11);
  });

  it("closeWithAssessment flips status and stores JSON", () => {
    const db = seed();
    closeWithAssessment(db, "s1", "2026-01-02T00:00:00Z", '{"final_score":80}');
    const meta = getSessionMeta(db, "s1");
    expect(meta?.status).toBe("closed");
    expect(meta?.closed_at).toBe("2026-01-02T00:00:00Z");
    expect(meta?.assessment).toBe('{"final_score":80}');
  });

  it("listSessions exposes status and final_score", () => {
    const db = seed();
    addTurn(db, "s1", 1, "user", "a", "t");
    addTurn(db, "s1", 2, "examiner", "q", "t");
    closeWithAssessment(db, "s1", "2026-01-02T00:00:00Z", '{"final_score":82}');
    const rows = listSessions(db);
    expect(rows[0].status).toBe("closed");
    expect(rows[0].final_score).toBe(82);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/repos.sessions.lifecycle.test.ts`
Expected: FAIL — new helpers not exported.

- [ ] **Step 3: Write minimal implementation**

Update `SessionSummary` and `listSessions` in `backend/src/repos/sessions.ts`:

```ts
export interface SessionSummary {
  id: string;
  created_at: string;
  label: string | null;
  turn_count: number;
  status: string;
  final_score: number | null;
}

export function listSessions(db: Database.Database): SessionSummary[] {
  return db
    .prepare(
      `SELECT s.id, s.created_at, s.label, s.status,
              json_extract(s.assessment, '$.final_score') AS final_score,
              COUNT(t.id) AS turn_count
       FROM sessions s
       JOIN turns t ON t.session_id = s.id
       GROUP BY s.id, s.created_at, s.label, s.status
       ORDER BY s.created_at DESC`,
    )
    .all() as SessionSummary[];
}
```

Append the lifecycle helpers at the end of the file:

```ts
export function countExaminerTurns(db: Database.Database, sessionId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM turns WHERE session_id = ? AND role = 'examiner'")
    .get(sessionId) as { c: number };
  return row.c;
}

export interface SessionMeta {
  status: string;
  closed_at: string | null;
  assessment: string | null;
  close_declined_turn: number | null;
}

export function getSessionMeta(db: Database.Database, sessionId: string): SessionMeta | null {
  const row = db
    .prepare(
      "SELECT status, closed_at, assessment, close_declined_turn FROM sessions WHERE id = ?",
    )
    .get(sessionId) as SessionMeta | undefined;
  return row ?? null;
}

export function setCloseDeclined(
  db: Database.Database,
  sessionId: string,
  examinerTurn: number,
): void {
  db.prepare("UPDATE sessions SET close_declined_turn = ? WHERE id = ?").run(
    examinerTurn,
    sessionId,
  );
}

export function closeWithAssessment(
  db: Database.Database,
  sessionId: string,
  closedAt: string,
  assessmentJson: string,
): void {
  db.prepare(
    "UPDATE sessions SET status = 'closed', closed_at = ?, assessment = ? WHERE id = ?",
  ).run(closedAt, assessmentJson, sessionId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/repos.sessions.lifecycle.test.ts test/repos.sessions.list.test.ts`
Expected: PASS. (If `repos.sessions.list.test.ts` asserts an exact object shape, extend its expectation to include `status: "active"` and `final_score: null`.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/repos/sessions.ts backend/test/repos.sessions.lifecycle.test.ts
git commit -m "feat(sessions-repo): lifecycle helpers + status/score in list"
```

---

## Task 5: Provider `generate()` primitive

**Files:**
- Modify: `backend/src/providers/types.ts`, `backend/src/providers/claude.ts`, `backend/src/providers/openrouter.ts`
- Test: `backend/test/providers.generate.test.ts` (create)

**Interfaces:**
- Produces: `LLMProvider.generate(system: string, user: string, maxTokens: number): Promise<{ text: string; usage?: Record<string, number> }>` implemented by both providers.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/providers.generate.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

afterEach(() => vi.restoreAllMocks());

describe("provider.generate", () => {
  it("Claude sends one system + one user block and returns text", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = {
      messages: {
        create: vi.fn(async (req: any) => {
          capture.req = req;
          return { content: [{ type: "text", text: "{\"final_score\":80}" }], usage: {} };
        }),
      },
    };
    const out = await provider.generate("SYS", "USER", 1024);
    expect(out.text).toBe('{"final_score":80}');
    expect(capture.req.max_tokens).toBe(1024);
    expect(capture.req.system[0].text).toBe("SYS");
    expect(capture.req.messages).toEqual([{ role: "user", content: "USER" }]);
  });

  it("OpenRouter posts system+user messages and returns content", async () => {
    const capture: { body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        capture.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "OK-TEXT" } }] }),
        };
      }) as any,
    );
    const provider = new OpenRouterProvider("or-key", "x/y");
    const out = await provider.generate("SYS", "USER", 512);
    expect(out.text).toBe("OK-TEXT");
    expect(capture.body.max_tokens).toBe(512);
    expect(capture.body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
  });

  it("OpenRouter throws without leaking the key on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })) as any,
    );
    const provider = new OpenRouterProvider("or-key", "x/y");
    await expect(provider.generate("s", "u", 100)).rejects.toThrow(/OpenRouter request failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/providers.generate.test.ts`
Expected: FAIL — `generate` not a function.

- [ ] **Step 3: Write minimal implementation**

Add to `LLMProvider` in `backend/src/providers/types.ts`:

```ts
export interface LLMProvider {
  sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult>;
  generate(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<{ text: string; usage?: Record<string, number> }>;
  checkAuth(): Promise<void>;
}
```

Add to `ClaudeProvider` (`backend/src/providers/claude.ts`):

```ts
async generate(
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string; usage?: Record<string, number> }> {
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: user }],
  });
  const text = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  return { text };
}
```

Add to `OpenRouterProvider` (`backend/src/providers/openrouter.ts`):

```ts
async generate(
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string; usage?: Record<string, number> }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    },
    body: JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return { text: data.choices?.[0]?.message?.content?.trim() ?? "" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/providers.generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/types.ts backend/src/providers/claude.ts backend/src/providers/openrouter.ts backend/test/providers.generate.test.ts
git commit -m "feat(providers): generate() primitive for one-shot completions"
```

---

## Task 6: Assessment module

**Files:**
- Create: `backend/src/assessment.ts`
- Test: `backend/test/assessment.test.ts`

**Interfaces:**
- Consumes: `Turn` from `./providers/types.js`.
- Produces:
  - `interface Assessment { scores: { penguasaan_materi: number; metodologi: number; kualitas_orisinalitas: number; argumentasi: number }; final_score: number; grade: string; verdict: string; ringkasan: string; kelebihan: string[]; kekurangan: string[]; saran: string[] }`
  - `deriveGrade(score: number): string`
  - `deriveVerdict(score: number): string`
  - `formatTranscript(history: Turn[]): string`
  - `buildAssessmentSystem(): string`
  - `buildAssessmentUser(skripsi: string, transcript: string): string`
  - `parseAssessment(text: string): Assessment` (throws on unparseable JSON)

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/assessment.test.ts
import { describe, it, expect } from "vitest";
import {
  parseAssessment,
  deriveGrade,
  deriveVerdict,
  formatTranscript,
  buildAssessmentUser,
} from "../src/assessment.js";

const VALID = JSON.stringify({
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 90 },
  final_score: 79,
  grade: "B",
  verdict: "Lulus dengan revisi",
  ringkasan: "Cukup baik.",
  kelebihan: ["Argumentasi kuat"],
  kekurangan: ["Metodologi tipis"],
  saran: ["Perkuat bab 3"],
});

describe("assessment helpers", () => {
  it("derives grade from score bands", () => {
    expect(deriveGrade(90)).toBe("A");
    expect(deriveGrade(72)).toBe("B");
    expect(deriveGrade(60)).toBe("C");
    expect(deriveGrade(40)).toBe("D");
  });

  it("derives verdict from score bands", () => {
    expect(deriveVerdict(85)).toBe("Lulus");
    expect(deriveVerdict(65)).toBe("Lulus dengan revisi");
    expect(deriveVerdict(50)).toBe("Tidak lulus");
  });

  it("formats a labelled transcript", () => {
    const t = formatTranscript([
      { role: "examiner", content: "Q1" },
      { role: "user", content: "A1" },
    ]);
    expect(t).toBe("Penguji: Q1\nMahasiswa: A1");
  });

  it("embeds skripsi + transcript in the user prompt", () => {
    const u = buildAssessmentUser("ISI", "TRX");
    expect(u).toContain("ISI");
    expect(u).toContain("TRX");
  });
});

describe("parseAssessment", () => {
  it("parses clean JSON", () => {
    const a = parseAssessment(VALID);
    expect(a.scores.penguasaan_materi).toBe(80);
    expect(a.final_score).toBe(79);
    expect(a.grade).toBe("B");
    expect(a.kelebihan).toEqual(["Argumentasi kuat"]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const a = parseAssessment("Berikut hasilnya:\n```json\n" + VALID + "\n```\nSemoga membantu.");
    expect(a.final_score).toBe(79);
  });

  it("clamps out-of-range scores and derives final_score when missing", () => {
    const a = parseAssessment(
      JSON.stringify({
        scores: { penguasaan_materi: 120, metodologi: -5, kualitas_orisinalitas: 50, argumentasi: 50 },
      }),
    );
    expect(a.scores.penguasaan_materi).toBe(100);
    expect(a.scores.metodologi).toBe(0);
    expect(a.final_score).toBe(50); // avg of 100,0,50,50
    expect(a.grade).toBe(deriveGrade(50));
  });

  it("re-derives grade even when the model gives a wrong one", () => {
    const a = parseAssessment(JSON.stringify({ final_score: 90, grade: "D" }));
    expect(a.grade).toBe("A");
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseAssessment("maaf, tidak bisa menilai")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/assessment.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/assessment.ts
import type { Turn } from "./providers/types.js";

export interface Assessment {
  scores: {
    penguasaan_materi: number;
    metodologi: number;
    kualitas_orisinalitas: number;
    argumentasi: number;
  };
  final_score: number;
  grade: string;
  verdict: string;
  ringkasan: string;
  kelebihan: string[];
  kekurangan: string[];
  saran: string[];
}

const VERDICTS = ["Lulus", "Lulus dengan revisi", "Tidak lulus"];

function clamp(n: unknown): number {
  const x = typeof n === "number" && isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

export function deriveGrade(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function deriveVerdict(score: number): string {
  if (score >= 80) return "Lulus";
  if (score >= 60) return "Lulus dengan revisi";
  return "Tidak lulus";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => (x as string).trim());
}

export function formatTranscript(history: Turn[]): string {
  return history
    .map((t) => `${t.role === "examiner" ? "Penguji" : "Mahasiswa"}: ${t.content}`)
    .join("\n");
}

export function buildAssessmentSystem(): string {
  return `Anda dosen penguji sidang skripsi yang menilai jalannya sidang. Berdasarkan isi skripsi dan transkrip tanya-jawab, beri penilaian objektif dalam Bahasa Indonesia.

Nilai empat dimensi (skor 0-100 tiap dimensi):
- penguasaan_materi: pemahaman mahasiswa atas topik dan isi skripsi.
- metodologi: pemahaman dan ketepatan metode penelitian.
- kualitas_orisinalitas: mutu dan orisinalitas skripsi.
- argumentasi: kemampuan menjawab, mempertahankan, dan beralasan.

Keluarkan HANYA JSON valid (tanpa teks lain, tanpa code fence) dengan bentuk persis:
{
  "scores": { "penguasaan_materi": <0-100>, "metodologi": <0-100>, "kualitas_orisinalitas": <0-100>, "argumentasi": <0-100> },
  "final_score": <0-100>,
  "grade": "A|B|C|D",
  "verdict": "Lulus | Lulus dengan revisi | Tidak lulus",
  "ringkasan": "<2-4 kalimat penilaian menyeluruh>",
  "kelebihan": ["<poin>"],
  "kekurangan": ["<poin>"],
  "saran": ["<saran perbaikan konkret>"]
}`;
}

export function buildAssessmentUser(skripsi: string, transcript: string): string {
  return `ISI SKRIPSI:\n${skripsi}\n\nTRANSKRIP SIDANG:\n${transcript}`;
}

export function parseAssessment(text: string): Assessment {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("assessment JSON not found");
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as any;

  const scores = {
    penguasaan_materi: clamp(obj?.scores?.penguasaan_materi),
    metodologi: clamp(obj?.scores?.metodologi),
    kualitas_orisinalitas: clamp(obj?.scores?.kualitas_orisinalitas),
    argumentasi: clamp(obj?.scores?.argumentasi),
  };
  const avg = Math.round(
    (scores.penguasaan_materi +
      scores.metodologi +
      scores.kualitas_orisinalitas +
      scores.argumentasi) /
      4,
  );
  const final_score =
    typeof obj?.final_score === "number" && isFinite(obj.final_score)
      ? clamp(obj.final_score)
      : avg;
  const verdict = VERDICTS.includes(obj?.verdict) ? obj.verdict : deriveVerdict(final_score);

  return {
    scores,
    final_score,
    grade: deriveGrade(final_score),
    verdict,
    ringkasan: typeof obj?.ringkasan === "string" ? obj.ringkasan.trim() : "",
    kelebihan: strArray(obj?.kelebihan),
    kekurangan: strArray(obj?.kekurangan),
    saran: strArray(obj?.saran),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/assessment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/assessment.ts backend/test/assessment.test.ts
git commit -m "feat(assessment): rubric prompts + defensive JSON parser"
```

---

## Task 7: Turn route — closed guard + marker/propose

**Files:**
- Modify: `backend/src/routes/sessions.ts`
- Test: `backend/test/routes.sessions.turn.test.ts` (create)

**Interfaces:**
- Consumes: `stripCloseMarker`, `shouldProposeClose` from `../sidang.js`; `countExaminerTurns`, `getSessionMeta` from `../repos/sessions.js`.
- Produces: `POST /sessions/:id/turn` now returns `{ reply: string; propose_close: boolean }` (marker stripped from `reply`); returns 409 when the session is already closed.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/routes.sessions.turn.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";
import { closeWithAssessment } from "../src/repos/sessions.js";
import { CLOSE_MARKER } from "../src/sidang.js";

afterEach(() => vi.restoreAllMocks());

function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  saveSettings(db, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, "thesis.pdf", "ISI SKRIPSI", "2026-01-01T00:00:00Z");
  return { app: buildApp(db, key), db };
}

function stubReply(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    })) as any,
  );
}

describe("turn route — marker + close guard", () => {
  it("strips the close marker from the reply and does not propose below the floor", async () => {
    stubReply(`Baik.\n${CLOSE_MARKER}`);
    const { app } = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;

    const turn = await request(app).post(`/sessions/${id}/turn`).send({ transcript: "jawab" });
    expect(turn.status).toBe(200);
    expect(turn.body.reply).toBe("Baik.");
    expect(turn.body.propose_close).toBe(false); // only 1 examiner turn < floor
  });

  it("409s a turn on a closed session", async () => {
    stubReply("Pertanyaan?");
    const { app, db } = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    await request(app).post(`/sessions/${id}/turn`).send({ transcript: "hi" });
    closeWithAssessment(db, id, "2026-01-02T00:00:00Z", '{"final_score":80}');

    const turn = await request(app).post(`/sessions/${id}/turn`).send({ transcript: "lagi" });
    expect(turn.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes.sessions.turn.test.ts`
Expected: FAIL — `propose_close` undefined / no 409.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/routes/sessions.ts`, extend imports:

```ts
import {
  createSession,
  listSessions,
  sessionExists,
  getTurns,
  nextTurnNumber,
  addTurn,
  deleteSession,
  deleteTurn,
  countExaminerTurns,
  getSessionMeta,
} from "../repos/sessions.js";
import { stripCloseMarker, shouldProposeClose } from "../sidang.js";
```

Inside `POST /:id/turn`, after the `sessionExists` check add the closed guard:

```ts
if (!sessionExists(db, sessionId)) {
  return res.status(404).json({ error: "Sesi tidak ditemukan" });
}
const meta = getSessionMeta(db, sessionId);
if (meta?.status === "closed") {
  return res.status(409).json({ error: "Sidang sudah ditutup" });
}
```

Replace the block that stores the examiner turn and responds:

```ts
const { reply, hasMarker } = stripCloseMarker(result.reply);

addTurn(db, sessionId, nextTurnNumber(db, sessionId), "examiner", reply, now());

const examinerCount = countExaminerTurns(db, sessionId);
const propose_close = shouldProposeClose({
  hasMarker,
  examinerCount,
  declinedTurn: meta?.close_declined_turn ?? null,
});
res.json({ reply, propose_close });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes.sessions.turn.test.ts test/routes.sessions.test.ts`
Expected: PASS. (In `routes.sessions.test.ts` the existing "runs a full turn" test still passes — it asserts `turn.body.reply` and the stored turns, both unaffected. The reply has no marker, so it is returned verbatim.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sessions.ts backend/test/routes.sessions.turn.test.ts
git commit -m "feat(turn): strip close marker, gate propose_close, block closed sessions"
```

---

## Task 8: Continue / close / result routes

**Files:**
- Modify: `backend/src/routes/sessions.ts`
- Test: `backend/test/routes.sessions.close.test.ts` (create)

**Interfaces:**
- Consumes: `getActiveConfig`, `getSetting` from `../repos/settings.js`; `getActiveDocument` from `../repos/documents.js`; `getProvider` from `../providers/index.js`; `buildAssessmentSystem`, `buildAssessmentUser`, `formatTranscript`, `parseAssessment` from `../assessment.js`; `setCloseDeclined`, `closeWithAssessment`, `getSessionMeta`, `countExaminerTurns`, `getTurns` from `../repos/sessions.js`.
- Produces:
  - `POST /sessions/:id/continue` → `{ ok: true }` (records `close_declined_turn = countExaminerTurns`).
  - `POST /sessions/:id/close` → `{ assessment: Assessment }` (idempotent if already closed; retries the LLM parse once; sets status closed only on success; 500 on failure with session left active).
  - `GET /sessions/:id/result` → `{ status: string; assessment: Assessment | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/routes.sessions.close.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";

afterEach(() => vi.restoreAllMocks());

const ASSESSMENT_JSON = JSON.stringify({
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 85 },
  final_score: 78,
  verdict: "Lulus dengan revisi",
  ringkasan: "Solid.",
  kelebihan: ["a"],
  kekurangan: ["b"],
  saran: ["c"],
});

function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  saveSettings(db, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, "thesis.pdf", "ISI", "2026-01-01T00:00:00Z");
  return buildApp(db, key);
}

function stubOnce(contents: string[]) {
  const fn = vi.fn();
  contents.forEach((c) =>
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: c } }] }),
    }),
  );
  vi.stubGlobal("fetch", fn as any);
  return fn;
}

describe("close/continue/result routes", () => {
  it("close scores the transcript, persists it, and blocks further turns", async () => {
    // first fetch = the turn's examiner reply, second = the assessment
    stubOnce(["Pertanyaan penguji?", ASSESSMENT_JSON]);
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    await request(app).post(`/sessions/${id}/turn`).send({ transcript: "jawab" });

    const closed = await request(app).post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(200);
    expect(closed.body.assessment.final_score).toBe(78);
    expect(closed.body.assessment.grade).toBe("B");

    const result = await request(app).get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("closed");
    expect(result.body.assessment.final_score).toBe(78);

    const turn = await request(app).post(`/sessions/${id}/turn`).send({ transcript: "lagi" });
    expect(turn.status).toBe(409);
  });

  it("close is idempotent — a second close returns the stored assessment without a new LLM call", async () => {
    const fetchFn = stubOnce([ASSESSMENT_JSON]);
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    // seed a turn directly is unnecessary; close works on an empty transcript too
    await request(app).post(`/sessions/${id}/close`).send({});
    const callsAfterFirst = fetchFn.mock.calls.length;
    const again = await request(app).post(`/sessions/${id}/close`).send({});
    expect(again.status).toBe(200);
    expect(again.body.assessment.final_score).toBe(78);
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst); // no extra LLM call
  });

  it("close 500s and stays active when the model never returns valid JSON", async () => {
    stubOnce(["bukan json", "masih bukan json"]); // both attempts fail
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    const closed = await request(app).post(`/sessions/${id}/close`).send({});
    expect(closed.status).toBe(500);
    const result = await request(app).get(`/sessions/${id}/result`);
    expect(result.body.status).toBe("active");
    expect(result.body.assessment).toBeNull();
  });

  it("continue records the decline and returns ok", async () => {
    const app = ready();
    const id = (await request(app).post("/sessions").send({})).body.session_id;
    const cont = await request(app).post(`/sessions/${id}/continue`).send({});
    expect(cont.status).toBe(200);
    expect(cont.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes.sessions.close.test.ts`
Expected: FAIL — routes not defined (404s).

- [ ] **Step 3: Write minimal implementation**

Extend imports in `backend/src/routes/sessions.ts`:

```ts
import {
  createSession,
  listSessions,
  sessionExists,
  getTurns,
  nextTurnNumber,
  addTurn,
  deleteSession,
  deleteTurn,
  countExaminerTurns,
  getSessionMeta,
  setCloseDeclined,
  closeWithAssessment,
} from "../repos/sessions.js";
import {
  buildAssessmentSystem,
  buildAssessmentUser,
  formatTranscript,
  parseAssessment,
  type Assessment,
} from "../assessment.js";
```

Add these routes inside `sessionsRouter`, before `return r;`:

```ts
r.post("/:id/continue", (req, res) => {
  const sessionId = req.params.id;
  if (!sessionExists(db, sessionId)) {
    return res.status(404).json({ error: "Sesi tidak ditemukan" });
  }
  setCloseDeclined(db, sessionId, countExaminerTurns(db, sessionId));
  res.json({ ok: true });
});

r.post("/:id/close", async (req, res) => {
  const sessionId = req.params.id;
  if (!sessionExists(db, sessionId)) {
    return res.status(404).json({ error: "Sesi tidak ditemukan" });
  }
  const meta = getSessionMeta(db, sessionId);
  if (meta?.status === "closed" && meta.assessment) {
    return res.json({ assessment: JSON.parse(meta.assessment) as Assessment });
  }
  if (getSetting(db, "api_key") === null) {
    return res.status(400).json({ error: "Set API key di Settings dulu" });
  }
  const doc = getActiveDocument(db);
  if (!doc) {
    return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
  }

  try {
    const cfg = getActiveConfig(db, key);
    const provider = getProvider(cfg);
    const system = buildAssessmentSystem();
    const user = buildAssessmentUser(doc.full_text, formatTranscript(getTurns(db, sessionId)));

    let assessment: Assessment;
    try {
      assessment = parseAssessment((await provider.generate(system, user, 1024)).text);
    } catch {
      assessment = parseAssessment((await provider.generate(system, user, 1024)).text);
    }

    closeWithAssessment(db, sessionId, now(), JSON.stringify(assessment));
    res.json({ assessment });
  } catch (err) {
    console.error("[close error]", (err as Error).message);
    res.status(500).json({ error: "Gagal menilai sidang, coba lagi" });
  }
});

r.get("/:id/result", (req, res) => {
  const sessionId = req.params.id;
  if (!sessionExists(db, sessionId)) {
    return res.status(404).json({ error: "Sesi tidak ditemukan" });
  }
  const meta = getSessionMeta(db, sessionId);
  res.json({
    status: meta?.status ?? "active",
    assessment: meta?.assessment ? (JSON.parse(meta.assessment) as Assessment) : null,
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes.sessions.close.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sessions.ts backend/test/routes.sessions.close.test.ts
git commit -m "feat(sessions): continue/close/result routes with scored assessment"
```

---

## Task 9: Backend green — full suite

**Files:** none (verification task)

- [ ] **Step 1: Run the whole backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS. If `test/repos.sessions.list.test.ts` fails on an exact-shape assertion, update its expected object to include `status: "active"` and `final_score: null`, then re-run.

- [ ] **Step 2: Typecheck/build**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit (only if the list test needed updating)**

```bash
git add backend/test/repos.sessions.list.test.ts
git commit -m "test(sessions): expect status/final_score in list rows"
```

---

## Task 10: Frontend types + api client

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/api.test.ts`

**Interfaces:**
- Produces:
  - `Assessment` (mirrors backend), `SessionSummary` gains `status: string`, `final_score: number | null`.
  - `postTurn(id, transcript): Promise<{ reply: string; propose_close: boolean }>`
  - `continueSession(id: string): Promise<void>`
  - `closeSession(id: string): Promise<Assessment>`
  - `getResult(id: string): Promise<{ status: string; assessment: Assessment | null }>`

- [ ] **Step 1: Write the failing test** (edit `frontend/src/api.test.ts`)

Replace the existing "postTurn returns the reply" test and add close/continue/result tests:

```ts
import {
  postTurn,
  continueSession,
  closeSession,
  getResult,
  uploadSkripsi,
  ttsSpeak,
  getTtsVoices,
  testLlm,
  testTts,
  ttsPreview,
} from "./api.js";

// ...

it("postTurn returns reply + propose_close", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Q?", propose_close: true }) })) as any,
  );
  expect(await postTurn("s1", "jawaban")).toEqual({ reply: "Q?", propose_close: true });
});

it("closeSession returns the assessment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ assessment: { final_score: 80 } }) })) as any,
  );
  expect(await closeSession("s1")).toEqual({ final_score: 80 });
});

it("continueSession POSTs and resolves", async () => {
  const captured: { url?: string } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      captured.url = url;
      return { ok: true, json: async () => ({ ok: true }) };
    }) as any,
  );
  await continueSession("s1");
  expect(captured.url).toContain("/api/sessions/s1/continue");
});

it("getResult returns status + assessment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ status: "closed", assessment: null }) })) as any,
  );
  expect(await getResult("s1")).toEqual({ status: "closed", assessment: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: FAIL — `closeSession`/`continueSession`/`getResult` not exported; `postTurn` shape mismatch.

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/src/types.ts`:

```ts
export interface Assessment {
  scores: {
    penguasaan_materi: number;
    metodologi: number;
    kualitas_orisinalitas: number;
    argumentasi: number;
  };
  final_score: number;
  grade: string;
  verdict: string;
  ringkasan: string;
  kelebihan: string[];
  kekurangan: string[];
  saran: string[];
}
```

Extend `SessionSummary` in `frontend/src/types.ts`:

```ts
export interface SessionSummary {
  id: string;
  created_at: string;
  label: string | null;
  turn_count: number;
  status: string;
  final_score: number | null;
}
```

In `frontend/src/api.ts`, add `Assessment` to the type import, replace `postTurn`, and add the three functions:

```ts
import type {
  Turn,
  SettingsView,
  SkripsiInfo,
  SessionSummary,
  TtsVoice,
  TtsAudio,
  TestResult,
  Assessment,
} from "./types.js";

export async function postTurn(
  id: string,
  transcript: string,
): Promise<{ reply: string; propose_close: boolean }> {
  const res = await fetch(`/api/sessions/${id}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  const data = await jsonOrThrow(res);
  return { reply: data.reply, propose_close: !!data.propose_close };
}

export async function continueSession(id: string): Promise<void> {
  await jsonOrThrow(await postJson(`/api/sessions/${id}/continue`, {}));
}

export async function closeSession(id: string): Promise<Assessment> {
  return (await jsonOrThrow(await postJson(`/api/sessions/${id}/close`, {}))).assessment;
}

export async function getResult(
  id: string,
): Promise<{ status: string; assessment: Assessment | null }> {
  return jsonOrThrow(await fetch(`/api/sessions/${id}/result`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(api): assessment types + close/continue/result client fns"
```

---

## Task 11: Generalize ConfirmModal labels

**Files:**
- Modify: `frontend/src/components/ConfirmModal.tsx`
- Test: `frontend/src/components/ConfirmModal.test.tsx` (create)

**Interfaces:**
- Produces: `ConfirmModal` accepts optional `confirmLabel?: string` (default `"Ya, hapus"`) and `cancelLabel?: string` (default `"Batal"`). Existing prop callers unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/ConfirmModal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "./ConfirmModal.js";

describe("ConfirmModal", () => {
  it("uses default labels when none are given", () => {
    render(
      <ConfirmModal open title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText("Ya, hapus")).toBeTruthy();
    expect(screen.getByText("Batal")).toBeTruthy();
  });

  it("renders custom labels and wires callbacks", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="Akhiri sidang?"
        message="m"
        confirmLabel="Akhiri & lihat hasil"
        cancelLabel="Lanjut bertanya"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Akhiri & lihat hasil"));
    fireEvent.click(screen.getByText("Lanjut bertanya"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ConfirmModal.test.tsx`
Expected: FAIL — custom labels not rendered.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/components/ConfirmModal.tsx
interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Ya, hapus",
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel}>{cancelLabel}</button>
          <button className="primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ConfirmModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ConfirmModal.tsx frontend/src/components/ConfirmModal.test.tsx
git commit -m "feat(modal): optional confirm/cancel labels"
```

---

## Task 12: ResultPage component + styles

**Files:**
- Create: `frontend/src/pages/ResultPage.tsx`, `frontend/src/pages/ResultPage.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `Assessment` from `../types.js`.
- Produces: `ResultPage({ assessment, onNewSession, onBack }: { assessment: Assessment; onNewSession: () => void; onBack: () => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/ResultPage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultPage } from "./ResultPage.js";
import type { Assessment } from "../types.js";

const A: Assessment = {
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 88 },
  final_score: 78,
  grade: "B",
  verdict: "Lulus dengan revisi",
  ringkasan: "Sidang berjalan baik.",
  kelebihan: ["Argumentasi kuat"],
  kekurangan: ["Metodologi kurang dalam"],
  saran: ["Perkuat bab 3"],
};

describe("ResultPage", () => {
  it("renders score, grade, verdict, dimensions and feedback", () => {
    render(<ResultPage assessment={A} onNewSession={() => {}} onBack={() => {}} />);
    expect(screen.getByText("78")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("Lulus dengan revisi")).toBeTruthy();
    expect(screen.getByText("Penguasaan Materi")).toBeTruthy();
    expect(screen.getByText("Argumentasi kuat")).toBeTruthy();
    expect(screen.getByText("Perkuat bab 3")).toBeTruthy();
  });

  it("wires the action buttons", () => {
    const onNewSession = vi.fn();
    const onBack = vi.fn();
    render(<ResultPage assessment={A} onNewSession={onNewSession} onBack={onBack} />);
    fireEvent.click(screen.getByText("Sesi Baru"));
    fireEvent.click(screen.getByText(/Kembali/));
    expect(onNewSession).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/ResultPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/pages/ResultPage.tsx
import type { Assessment } from "../types.js";

const DIMENSIONS: { key: keyof Assessment["scores"]; label: string }[] = [
  { key: "penguasaan_materi", label: "Penguasaan Materi" },
  { key: "metodologi", label: "Metodologi" },
  { key: "kualitas_orisinalitas", label: "Kualitas & Orisinalitas" },
  { key: "argumentasi", label: "Argumentasi" },
];

function verdictClass(v: string): string {
  if (v === "Lulus") return "pass";
  if (v === "Tidak lulus") return "fail";
  return "revise";
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="result-list">
      <h3>{title}</h3>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

interface Props {
  assessment: Assessment;
  onNewSession: () => void;
  onBack: () => void;
}

export function ResultPage({ assessment, onNewSession, onBack }: Props) {
  const a = assessment;
  return (
    <div className="result-page">
      <div className="session-head">
        <h2>Hasil Sidang</h2>
        <button onClick={onBack}>← Kembali</button>
      </div>

      <div className="result-score">
        <div className="score-big">
          {a.final_score}
          <span className="score-max">/100</span>
        </div>
        <div className="score-grade">{a.grade}</div>
        <span className={`verdict-badge ${verdictClass(a.verdict)}`}>{a.verdict}</span>
      </div>

      {a.ringkasan && <p className="result-summary">{a.ringkasan}</p>}

      <div className="result-dims">
        {DIMENSIONS.map((d) => (
          <div key={d.key} className="dim-row">
            <span className="dim-label">{d.label}</span>
            <span className="dim-bar">
              <i style={{ width: `${a.scores[d.key]}%` }} />
            </span>
            <span className="dim-val">{a.scores[d.key]}</span>
          </div>
        ))}
      </div>

      <div className="result-lists">
        <ResultList title="Kelebihan" items={a.kelebihan} />
        <ResultList title="Kekurangan" items={a.kekurangan} />
        <ResultList title="Saran Perbaikan" items={a.saran} />
      </div>

      <div className="composer-actions">
        <button className="primary" onClick={onNewSession}>
          Sesi Baru
        </button>
      </div>
    </div>
  );
}
```

Append to `frontend/src/styles.css`:

```css
.result-score {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1rem 0;
}
.score-big {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
}
.score-max {
  font-size: 1.25rem;
  opacity: 0.6;
  margin-left: 0.15rem;
}
.score-grade {
  font-size: 2rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border: 2px solid currentColor;
  border-radius: 0.5rem;
}
.verdict-badge {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  color: #fff;
}
.verdict-badge.pass { background: #16a34a; }
.verdict-badge.revise { background: #d97706; }
.verdict-badge.fail { background: #dc2626; }
.result-summary { margin: 0.5rem 0 1rem; }
.result-dims { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
.dim-row { display: grid; grid-template-columns: 12rem 1fr 3rem; align-items: center; gap: 0.75rem; }
.dim-bar { background: rgba(127, 127, 127, 0.2); border-radius: 999px; height: 0.6rem; overflow: hidden; }
.dim-bar > i { display: block; height: 100%; background: #2563eb; }
.dim-val { text-align: right; font-variant-numeric: tabular-nums; }
.result-list h3 { margin-bottom: 0.25rem; }
.result-list ul { margin: 0 0 1rem 1.25rem; }
.history-score { font-weight: 600; margin-right: 0.5rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/ResultPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ResultPage.tsx frontend/src/pages/ResultPage.test.tsx frontend/src/styles.css
git commit -m "feat(result): scored results page + styles"
```

---

## Task 13: SessionPage close flow

**Files:**
- Modify: `frontend/src/pages/SessionPage.tsx`, `frontend/src/pages/SessionPage.test.tsx`

**Interfaces:**
- Consumes: `closeSession`, `continueSession` from `../api.js`; `ConfirmModal` from `../components/ConfirmModal.js`; `Assessment` from `../types.js`.
- Produces: `SessionPage({ onClosed }: { onClosed: (a: Assessment) => void })`; exports `SESSION_KEY`. On AI `propose_close` or the manual "Akhiri Sidang" button, a confirm modal opens; confirming calls `closeSession`, clears `SESSION_KEY`, and calls `onClosed`; declining an AI proposal calls `continueSession`.

- [ ] **Step 1: Write the failing test** (edit `frontend/src/pages/SessionPage.test.tsx`)

Update the `postTurn` mock to the object shape, render with the `onClosed` prop, and add close-flow tests. In `beforeEach` replace the postTurn mock:

```ts
vi.spyOn(api, "postTurn").mockResolvedValue({
  reply: "Apa kontribusi utama skripsi Anda?",
  propose_close: false,
});
```

Update existing renders to `render(<SessionPage onClosed={vi.fn()} />)`. Add:

```ts
it("opens the close modal when the examiner proposes closing", async () => {
  vi.spyOn(api, "postTurn").mockResolvedValue({ reply: "Baik.", propose_close: true });
  render(<SessionPage onClosed={vi.fn()} />);
  await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

  fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), {
    target: { value: "jawaban" },
  });
  fireEvent.click(screen.getByText("Kirim"));

  await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());
});

it("declining an AI proposal calls continueSession and keeps the session", async () => {
  vi.spyOn(api, "postTurn").mockResolvedValue({ reply: "Baik.", propose_close: true });
  const cont = vi.spyOn(api, "continueSession").mockResolvedValue();
  render(<SessionPage onClosed={vi.fn()} />);
  await waitFor(() => expect(api.getTurns).toHaveBeenCalled());
  fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), { target: { value: "x" } });
  fireEvent.click(screen.getByText("Kirim"));
  await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());

  fireEvent.click(screen.getByText("Lanjut bertanya"));
  await waitFor(() => expect(cont).toHaveBeenCalledWith("sess-1"));
});

it("Akhiri Sidang → confirm closes and calls onClosed with the assessment", async () => {
  const assessment = { final_score: 80 } as any;
  vi.spyOn(api, "closeSession").mockResolvedValue(assessment);
  const onClosed = vi.fn();
  render(<SessionPage onClosed={onClosed} />);
  await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

  fireEvent.click(screen.getByText("Akhiri Sidang"));
  fireEvent.click(screen.getByText("Akhiri & lihat hasil"));

  await waitFor(() => expect(onClosed).toHaveBeenCalledWith(assessment));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/SessionPage.test.tsx`
Expected: FAIL — no "Akhiri Sidang" button / prop mismatch.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/pages/SessionPage.tsx`: add imports, change the exported constant name, accept the prop, add state, wire `send`, add handlers, add the button (both composer branches), and render the modal.

Imports and constant:

```ts
import { createSession, getTurns, postTurn, getSettings, saveSettings, closeSession, continueSession } from "../api.js";
import type { Turn, ExaminerMode, Assessment } from "../types.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
// ...
export const SESSION_KEY = "sibiru_session_id";
```

Replace all uses of the old `KEY` constant with `SESSION_KEY` (the `useEffect` init, `newSession`).

Signature + state (add near the other `useState` calls):

```ts
export function SessionPage({ onClosed }: { onClosed: (a: Assessment) => void }) {
  // ...existing state...
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSource, setCloseSource] = useState<"ai" | "manual">("manual");
  const [closing, setClosing] = useState(false);
```

In `send()`, replace the reply handling:

```ts
const { reply, propose_close } = await postTurn(sessionId, transcript);
setTurns((t) => [...t, { role: "examiner", content: reply }]);
tts.speak(stripMarkdown(reply));
if (propose_close) {
  setCloseSource("ai");
  setCloseOpen(true);
}
```

Add handlers (after `newSession`):

```ts
function askClose() {
  setCloseSource("manual");
  setCloseOpen(true);
}

async function confirmClose() {
  if (!sessionId || closing) return;
  setClosing(true);
  setErr(null);
  try {
    const assessment = await closeSession(sessionId);
    localStorage.removeItem(SESSION_KEY);
    tts.cancel();
    setCloseOpen(false);
    onClosed(assessment);
  } catch (e) {
    setErr((e as Error).message);
  } finally {
    setClosing(false);
  }
}

async function cancelClose() {
  setCloseOpen(false);
  if (closeSource === "ai" && sessionId) {
    try {
      await continueSession(sessionId);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
}
```

Add the "Akhiri Sidang" button next to "Sesi Baru" in **both** `composer-actions` blocks:

```tsx
<button className="ghost" onClick={askClose} disabled={turns.length === 0}>
  Akhiri Sidang
</button>
```

Render the modal near the bottom (after `{err && ...}`):

```tsx
<ConfirmModal
  open={closeOpen}
  title="Akhiri sidang?"
  message={
    closeSource === "ai"
      ? "Penguji merasa sidang sudah cukup. Akhiri sidang & lihat hasil penilaian?"
      : "Akhiri sidang sekarang & lihat hasil penilaian?"
  }
  confirmLabel={closing ? "Menilai…" : "Akhiri & lihat hasil"}
  cancelLabel={closeSource === "ai" ? "Lanjut bertanya" : "Batal"}
  onConfirm={confirmClose}
  onCancel={cancelClose}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/SessionPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SessionPage.tsx frontend/src/pages/SessionPage.test.tsx
git commit -m "feat(session): AI-proposed/manual close flow with confirm modal"
```

---

## Task 14: App wiring + HistoryPage results

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/pages/HistoryPage.tsx`, `frontend/src/pages/HistoryPage.test.tsx`

**Interfaces:**
- Consumes: `ResultPage`, `getResult`, `SessionPage` (with `onClosed`), `SESSION_KEY`.
- Produces: `App` renders a `result` view holding the current `Assessment`; `HistoryPage({ onOpenResult }: { onOpenResult: (id: string) => void })` shows a status/score and a "Lihat Hasil" button for closed sessions.

- [ ] **Step 1: Write the failing test** (edit `frontend/src/pages/HistoryPage.test.tsx`)

Add a test that a closed session shows "Lihat Hasil" and calls the callback. Include the new required prop in every `render`:

```tsx
it("shows Lihat Hasil for closed sessions and calls onOpenResult", async () => {
  vi.spyOn(api, "listSessions").mockResolvedValue([
    {
      id: "s1",
      created_at: "2026-01-01T00:00:00Z",
      label: null,
      turn_count: 12,
      status: "closed",
      final_score: 82,
    },
  ]);
  const onOpenResult = vi.fn();
  render(<HistoryPage onOpenResult={onOpenResult} />);
  await waitFor(() => expect(screen.getByText("Lihat Hasil")).toBeTruthy());
  expect(screen.getByText(/Skor 82/)).toBeTruthy();
  fireEvent.click(screen.getByText("Lihat Hasil"));
  expect(onOpenResult).toHaveBeenCalledWith("s1");
});
```

(If `HistoryPage.test.tsx` does not already import `api`/`fireEvent`, add them and stub `listSessions`, `getTurns`, `deleteSession` as the existing tests require. Update every existing `render(<HistoryPage />)` to `render(<HistoryPage onOpenResult={vi.fn()} />)`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/HistoryPage.test.tsx`
Expected: FAIL — no "Lihat Hasil"; prop type error.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/pages/HistoryPage.tsx` — accept the prop and render the badge/button in the list row:

```tsx
export function HistoryPage({ onOpenResult }: { onOpenResult: (id: string) => void }) {
```

In the list `<li>` `history-actions` (the non-detail list view), add before "Buka":

```tsx
{s.status === "closed" && s.final_score != null && (
  <span className="history-score">Skor {s.final_score}</span>
)}
```

and add a button after "Buka":

```tsx
{s.status === "closed" && (
  <button onClick={() => onOpenResult(s.id)}>Lihat Hasil</button>
)}
```

`frontend/src/App.tsx` — add the result view:

```tsx
import { useState } from "react";
import { SessionPage, SESSION_KEY } from "./pages/SessionPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ResultPage } from "./pages/ResultPage.js";
import { getResult } from "./api.js";
import type { Assessment } from "./types.js";

export default function App() {
  const [view, setView] = useState<"session" | "history" | "settings" | "result">("session");
  const [result, setResult] = useState<Assessment | null>(null);

  function showResult(a: Assessment) {
    setResult(a);
    setView("result");
  }

  async function openResult(id: string) {
    try {
      const r = await getResult(id);
      if (r.assessment) {
        setResult(r.assessment);
        setView("result");
      }
    } catch {
      // ignore; stay on history
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">SiBiru</h1>
        <p className="tagline">Simulator Sidang Skripsi</p>
      </header>
      <nav>
        <button className={view === "session" ? "primary" : ""} onClick={() => setView("session")}>
          Latihan
        </button>
        <button className={view === "history" ? "primary" : ""} onClick={() => setView("history")}>
          Riwayat
        </button>
        <button className={view === "settings" ? "primary" : ""} onClick={() => setView("settings")}>
          Pengaturan
        </button>
      </nav>
      {view === "session" && <SessionPage onClosed={showResult} />}
      {view === "history" && <HistoryPage onOpenResult={openResult} />}
      {view === "settings" && <SettingsPage />}
      {view === "result" && result && (
        <ResultPage
          assessment={result}
          onNewSession={() => {
            localStorage.removeItem(SESSION_KEY);
            setResult(null);
            setView("session");
          }}
          onBack={() => setView("history")}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/HistoryPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/HistoryPage.tsx frontend/src/pages/HistoryPage.test.tsx
git commit -m "feat(app): result view wiring + Lihat Hasil in history"
```

---

## Task 15: Frontend green — full suite + typecheck

**Files:** none (verification task)

- [ ] **Step 1: Run the whole frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 2: Typecheck / build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (Watch for: any remaining `render(<SessionPage />)` / `render(<HistoryPage />)` missing the new required props.)

- [ ] **Step 3: Commit (only if fixups were needed)**

```bash
git add -A
git commit -m "test: align frontend suite with close-flow props"
```

---

## Task 16: Manual smoke test

**Files:** none (manual verification)

- [ ] **Step 1:** Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`). Ensure an API key and a skripsi PDF are configured in Pengaturan.
- [ ] **Step 2:** Run a sidang. Confirm the examiner keeps asking across multiple topics and does **not** declare the session over in prose, and no `[[CUKUP]]` text appears in any bubble.
- [ ] **Step 3:** After ~10+ questions, when the examiner proposes closing, confirm the modal shows "Lanjut bertanya" / "Akhiri & lihat hasil". Click "Lanjut bertanya" and confirm the sidang continues.
- [ ] **Step 4:** Click "Akhiri Sidang", confirm, and verify the results page shows the final score, grade, verdict badge, four dimension bars, and feedback lists.
- [ ] **Step 5:** Go to Riwayat; confirm the closed session shows its score and "Lihat Hasil" reopens the results page.

---

## Self-Review

**Spec coverage:**
- Long, multi-topic sidang → Task 2 (phased agenda) + Task 1/7 (min-question floor before close allowed). ✓
- Results page with 4-dimension score + feedback → Task 6 (assessment), Task 12 (ResultPage). ✓
- AI proposes close, user confirms; decline continues → Task 7 (`propose_close`), Task 8 (`continue`/`close`), Task 13 (modal flow). ✓
- Manual "Akhiri Sidang" → Task 13. ✓
- Hidden marker + server floor/cooldown → Task 1, Task 2, Task 7. ✓
- Results reachable from Riwayat → Task 4 (list fields), Task 14 (Lihat Hasil). ✓
- Provider-agnostic (Claude + OpenRouter) → Task 5 (`generate` on both). ✓
- Idempotent close, retry-on-parse-fail, stay-active-on-failure → Task 8. ✓
- Closed session blocks further turns → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete content. ✓

**Type consistency:** `Assessment` shape identical across `backend/src/assessment.ts` and `frontend/src/types.ts`. Helper names (`stripCloseMarker`, `shouldProposeClose`, `countExaminerTurns`, `getSessionMeta`, `setCloseDeclined`, `closeWithAssessment`, `generate`, `parseAssessment`, `formatTranscript`, `buildAssessmentSystem`, `buildAssessmentUser`) are referenced consistently in the tasks that consume them. `SESSION_KEY` exported from SessionPage and imported by App. `postTurn` returns `{ reply, propose_close }` everywhere it is consumed. ✓
