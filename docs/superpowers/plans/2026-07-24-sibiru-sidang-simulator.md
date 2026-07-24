# SiBiru Sidang Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, single-user, turn-based skripsi (thesis) defense simulator where an AI examiner (Claude/OpenRouter) questions the user based on an uploaded thesis PDF + hardcoded attack points; the user answers by voice (browser STT), and sessions persist in SQLite.

**Architecture:** React (Vite) frontend using Web Speech API for STT/TTS talks over HTTP to a stateless Express+TS backend. The backend reconstructs conversation history from SQLite on every turn, builds an LLM request behind an `LLMProvider` interface (Claude native with prompt caching, or OpenRouter), and returns the examiner's reply. The uploaded thesis text lives whole in the cached system block (no RAG). API keys are AES-256-GCM encrypted at rest.

**Tech Stack:** Node.js 22 + Express + TypeScript (ESM), better-sqlite3, `@anthropic-ai/sdk`, `unpdf` (PDF text extraction), `multer` (upload), Vitest + supertest (tests), React 18 + Vite + TypeScript, Web Speech API (native).

## Global Constraints

- Runtime: **Node.js 22** (ESM — every `package.json` sets `"type": "module"`).
- Backend port: **3001**. Frontend dev port: **5173**, proxying `/api` → `http://localhost:3001`.
- **Never** log, return, or commit plaintext API keys. `GET /settings` returns `has_api_key: boolean`, never the key.
- **Never** commit: `.env`, `*.sqlite`/`*.db`, `backend/data/`, `backend/uploads/`, `node_modules/` (already in root `.gitignore`).
- Encryption: **AES-256-GCM**, key from `ENCRYPTION_KEY` env (64 hex chars = 32 bytes). Stored ciphertext = base64(`iv`(12) ‖ `authTag`(16) ‖ `ciphertext`).
- Claude model IDs (exact, no date suffixes): `claude-sonnet-5` (default), `claude-haiku-4-5-20251001`, `claude-opus-4-8`.
- Prompt caching (Claude only): thesis + persona + attack points go in `system` blocks with `cache_control: { type: "ephemeral" }`; turn history goes in `messages`, **never** in a cached block. Log `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens` every call.
- One active skripsi document (global): re-upload deletes the old row so `documents` holds ≤1 row.
- Language: examiner replies + UI in **Bahasa Indonesia**; STT/TTS lang `id-ID`.
- Test runner: **Vitest**. Every backend module ships with tests; frontend gets smoke tests only (Web Speech is unavailable in jsdom — mock it).

---

## File Structure

```
sidang-simulation-ai/
  backend/
    package.json                 # ESM, scripts: dev/build/start/test
    tsconfig.json
    vitest.config.ts
    .env.example
    src/
      env.ts                     # load + validate ENCRYPTION_KEY, PORT
      crypto.ts                  # AES-256-GCM encrypt/decrypt/loadKey
      db.ts                      # better-sqlite3 init + migrations + PRAGMA
      persona.ts                 # PERSONA_TONE constant + default attack points
      prompt.ts                  # build system blocks + messages from turns
      providers/
        types.ts                 # Turn, LLMProvider, LLMResult
        claude.ts                # ClaudeProvider (Anthropic SDK + cache_control)
        openrouter.ts            # OpenRouterProvider (fetch, OpenAI-compatible)
        index.ts                 # getProvider(settings) factory
      repos/
        sessions.ts              # session + turn queries
        settings.ts              # settings get/set (encrypt api_key)
        documents.ts             # active skripsi doc get/replace/delete
      routes/
        sessions.ts             # POST /sessions, GET turns, POST turn, DELETE
        settings.ts             # GET/POST /settings
        skripsi.ts              # POST/GET/DELETE /skripsi
      app.ts                     # buildApp(db): Express app, mounts routes
      index.ts                   # bootstrap: real db + listen(3001)
    test/
      crypto.test.ts
      prompt.test.ts
      providers.claude.test.ts
      providers.openrouter.test.ts
      providers.factory.test.ts
      routes.settings.test.ts
      routes.sessions.test.ts
      routes.skripsi.test.ts
      fixtures/sample.pdf         # tiny generated PDF for upload test
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx                     # router-lite: Session | Settings view state
      api.ts                      # typed fetch wrappers to /api
      types.ts                    # shared TS types (Turn, Settings, Skripsi)
      hooks/
        useSpeechRecognition.ts
        useSpeechSynthesis.ts
      components/
        ConfirmModal.tsx
      pages/
        SessionPage.tsx
        SettingsPage.tsx
      styles.css
  docs/superpowers/...            # spec + this plan
  .gitignore                      # already present
```

---

### Task 1: Backend scaffold + health endpoint

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/.env.example`, `backend/src/env.ts`, `backend/src/app.ts`, `backend/src/index.ts`
- Test: `backend/test/health.test.ts`

**Interfaces:**
- Produces: `buildApp(db?: Database.Database): express.Express` — Express app with `GET /health` → `{ ok: true }`. For now `db` is optional/unused; later tasks add it. `env.ts` exports `PORT: number` and `loadEncryptionKey(): Buffer`.

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "sibiru-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "better-sqlite3": "^11.10.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "multer": "^1.4.5-lts.1",
    "unpdf": "^0.12.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

> **SDK version note:** `^0.68.0` is a floor. If `npm install` resolves an incompatible version or the `messages.create` typings differ, run `npm install @anthropic-ai/sdk@latest` — the `system`-array + `cache_control: { type: "ephemeral" }` request shape used in Task 5 is stable across the 0.6x–0.11x line.

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `backend/.env.example`**

```bash
# 32-byte key as 64 hex chars. Generate with:  openssl rand -hex 32
ENCRYPTION_KEY=REPLACE_WITH_64_HEX_CHARS
PORT=3001
```

- [ ] **Step 5: Create `backend/src/env.ts`**

```ts
import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3001);

export function loadEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be set to 64 hex chars (32 bytes). Run: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}
```

- [ ] **Step 6: Create `backend/src/app.ts`**

```ts
import express from "express";
import cors from "cors";

export function buildApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 7: Create `backend/src/index.ts`**

```ts
import { buildApp } from "./app.js";
import { PORT } from "./env.js";

const app = buildApp();
app.listen(PORT, () => {
  console.log(`SiBiru backend listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 8: Write the failing test `backend/test/health.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("health", () => {
  it("returns ok", async () => {
    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 9: Install and run**

Run: `cd backend && npm install && npm test`
Expected: `health > returns ok` PASSES. (Note import paths use `.js` extension — required for ESM/NodeNext resolution even though sources are `.ts`.)

- [ ] **Step 10: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/vitest.config.ts backend/.env.example backend/src/env.ts backend/src/app.ts backend/src/index.ts backend/test/health.test.ts
git commit -m "feat(backend): scaffold Express+TS app with health endpoint"
```

---

### Task 2: Encryption module (crypto.ts)

**Files:**
- Create: `backend/src/crypto.ts`
- Test: `backend/test/crypto.test.ts`

**Interfaces:**
- Produces: `encrypt(plaintext: string, key: Buffer): string` (base64 blob), `decrypt(blob: string, key: Buffer): string`. Layout: `iv`(12) ‖ `authTag`(16) ‖ `ciphertext`, base64-encoded. Tampering with any byte makes `decrypt` throw.

- [ ] **Step 1: Write the failing test `backend/test/crypto.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../src/crypto.js";

const key = randomBytes(32);

describe("crypto AES-256-GCM", () => {
  it("round-trips a string", () => {
    const secret = "sk-ant-abc123-VERY-SECRET";
    const blob = encrypt(secret, key);
    expect(blob).not.toContain(secret);
    expect(decrypt(blob, key)).toBe(secret);
  });

  it("produces different ciphertext each call (random iv)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("throws when the auth tag is tampered", () => {
    const blob = encrypt("hello", key);
    const bytes = Buffer.from(blob, "base64");
    bytes[13] ^= 0xff; // flip a bit inside the auth tag region
    const tampered = bytes.toString("base64");
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("throws with the wrong key", () => {
    const blob = encrypt("hello", key);
    expect(() => decrypt(blob, randomBytes(32))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/crypto.test.ts`
Expected: FAIL — cannot find module `../src/crypto.js`.

- [ ] **Step 3: Create `backend/src/crypto.ts`**

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(blob: string, key: Buffer): string {
  const data = Buffer.from(blob, "base64");
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/crypto.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crypto.ts backend/test/crypto.test.ts
git commit -m "feat(backend): AES-256-GCM encrypt/decrypt for API key at rest"
```

---

### Task 3: Database layer (db.ts) + migrations

**Files:**
- Create: `backend/src/db.ts`
- Test: `backend/test/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Database.Database` — opens (or `":memory:"`), enables `PRAGMA foreign_keys = ON`, runs idempotent migrations (`sessions`, `turns`, `settings`, `documents`), and returns the connection. `import Database from "better-sqlite3"` gives the `Database.Database` type.

- [ ] **Step 1: Write the failing test `backend/test/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";

describe("db migrations", () => {
  it("creates all four tables", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of ["sessions", "turns", "settings", "documents"]) {
      expect(names).toContain(t);
    }
  });

  it("cascades turn deletion when a session is deleted", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
      "s1",
      "2026-01-01T00:00:00Z",
      "test",
    );
    db.prepare(
      "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run("s1", 1, "user", "hi", "2026-01-01T00:00:00Z");
    db.prepare("DELETE FROM sessions WHERE id = ?").run("s1");
    const remaining = db
      .prepare("SELECT COUNT(*) AS c FROM turns WHERE session_id = ?")
      .get("s1") as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("is idempotent (re-running openDb does not throw)", () => {
    const db = openDb(":memory:");
    expect(() => openDb(":memory:")).not.toThrow();
    expect(db).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Create `backend/src/db.ts`**

```ts
import Database from "better-sqlite3";

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

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  full_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATION);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/db.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.ts backend/test/db.test.ts
git commit -m "feat(backend): SQLite schema + idempotent migrations with cascade delete"
```

---

### Task 4: Persona + prompt builder (persona.ts, prompt.ts)

**Files:**
- Create: `backend/src/persona.ts`, `backend/src/providers/types.ts`, `backend/src/prompt.ts`
- Test: `backend/test/prompt.test.ts`

**Interfaces:**
- Produces (`providers/types.ts`):
  ```ts
  export interface Turn { role: "examiner" | "user"; content: string; }
  export interface LLMResult { reply: string; usage?: Record<string, number>; }
  export interface LLMProvider {
    sendTurn(personaAttack: string, skripsi: string, history: Turn[], userInput: string): Promise<LLMResult>;
  }
  ```
- Produces (`persona.ts`): `PERSONA_TONE: string`, `DEFAULT_ATTACK_POINTS: string`.
- Produces (`prompt.ts`): `buildSystemText(personaAttack: string, skripsi: string): { persona: string; skripsi: string }` and `mapHistory(history: Turn[]): { role: "user" | "assistant"; content: string }[]` — maps `examiner`→`assistant`, `user`→`user`.

- [ ] **Step 1: Create `backend/src/providers/types.ts`**

```ts
export interface Turn {
  role: "examiner" | "user";
  content: string;
}

export interface LLMResult {
  reply: string;
  usage?: Record<string, number>;
}

export interface LLMProvider {
  sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult>;
}
```

- [ ] **Step 2: Create `backend/src/persona.ts`**

```ts
export const PERSONA_TONE = `Anda adalah dosen penguji sidang skripsi. Ajukan pertanyaan dan tanggapan dalam Bahasa Indonesia.

Aturan:
- Skeptis dan menuntut bukti/data. Jangan mudah puas dengan jawaban permukaan.
- Satu pertanyaan atau tanggapan penguji per giliran, ringkas dan menggali.
- Basiskan pertanyaan pada isi skripsi (di bawah) dan poin serangan yang telah diidentifikasi.
- Jika jawaban mahasiswa dangkal atau menghindar, tekan lebih dalam pada titik itu.`;

export const DEFAULT_ATTACK_POINTS = `POIN SERANGAN PENGUJI (sudah teridentifikasi):
- Beck Hal.105/350/356 — soal referral dalam konteks medis.
- Beck Hal.121/134 — cap 2 masalah per sesi (rasional pacing + depth, bukan sekadar keputusan non-numerik).
- Klaim arsitektur multi-flow: migration \`is_carryover\` harus sudah ada sebelum sidang.
- CB2-04 — journal context compliance 54.5%, minta tiga penjelasan teknis terverifikasi.
- NFR-04 — 0 istilah klinis di 469 respons, 18 sesi. Minta bukti.`;
```

- [ ] **Step 3: Write the failing test `backend/test/prompt.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSystemText, mapHistory } from "../src/prompt.js";
import type { Turn } from "../src/providers/types.js";

describe("prompt builder", () => {
  it("keeps persona and skripsi as separate strings", () => {
    const out = buildSystemText("PERSONA+ATTACK", "SKRIPSI TEXT");
    expect(out.persona).toBe("PERSONA+ATTACK");
    expect(out.skripsi).toBe("SKRIPSI TEXT");
  });

  it("maps examiner->assistant and user->user, preserving order", () => {
    const history: Turn[] = [
      { role: "examiner", content: "Apa kontribusi utama?" },
      { role: "user", content: "Arsitektur multi-flow." },
    ];
    expect(mapHistory(history)).toEqual([
      { role: "assistant", content: "Apa kontribusi utama?" },
      { role: "user", content: "Arsitektur multi-flow." },
    ]);
  });

  it("returns empty array for empty history", () => {
    expect(mapHistory([])).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx vitest run test/prompt.test.ts`
Expected: FAIL — cannot find module `../src/prompt.js`.

- [ ] **Step 5: Create `backend/src/prompt.ts`**

```ts
import type { Turn } from "./providers/types.js";

export function buildSystemText(
  personaAttack: string,
  skripsi: string,
): { persona: string; skripsi: string } {
  return { persona: personaAttack, skripsi };
}

export function mapHistory(
  history: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  return history.map((t) => ({
    role: t.role === "examiner" ? "assistant" : "user",
    content: t.content,
  }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run test/prompt.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/persona.ts backend/src/providers/types.ts backend/src/prompt.ts backend/test/prompt.test.ts
git commit -m "feat(backend): examiner persona, LLMProvider interface, prompt builder"
```

---

### Task 5: ClaudeProvider (Anthropic SDK + prompt caching)

**Files:**
- Create: `backend/src/providers/claude.ts`
- Test: `backend/test/providers.claude.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Turn` (Task 4); `mapHistory`/`buildSystemText` (Task 4).
- Produces: `class ClaudeProvider implements LLMProvider` with `constructor(apiKey: string, model: string)`. `sendTurn` calls `client.messages.create` with `system: [{persona, cache_control}, {skripsi, cache_control}]` and `messages: [...mapHistory(history), {role:"user", content:userInput}]`, returns `{ reply, usage: { cache_read_input_tokens, cache_creation_input_tokens, input_tokens, output_tokens } }`. Reply text is concatenated from `response.content` blocks where `block.type === "text"`.

- [ ] **Step 1: Write the failing test `backend/test/providers.claude.test.ts`**

The test injects a fake Anthropic client to assert the request shape (cache_control on both system blocks; history in `messages`, not `system`) without hitting the network.

```ts
import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../src/providers/claude.js";
import type { Turn } from "../src/providers/types.js";

function fakeClient(capture: { req?: any }) {
  return {
    messages: {
      create: vi.fn(async (req: any) => {
        capture.req = req;
        return {
          content: [{ type: "text", text: "Pertanyaan penguji." }],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 0,
          },
        };
      }),
    },
  };
}

describe("ClaudeProvider", () => {
  it("puts persona+skripsi in cached system blocks and history in messages", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = fakeClient(capture);

    const history: Turn[] = [
      { role: "examiner", content: "Q1" },
      { role: "user", content: "A1" },
    ];
    const result = await provider.sendTurn("PERSONA", "SKRIPSI", history, "A2");

    // reply extracted from text blocks
    expect(result.reply).toBe("Pertanyaan penguji.");
    expect(result.usage?.cache_read_input_tokens).toBe(100);

    const req = capture.req;
    expect(req.model).toBe("claude-sonnet-5");
    // two system blocks, both cached
    expect(req.system).toHaveLength(2);
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toBe("PERSONA");
    expect(req.system[1].text).toBe("SKRIPSI");
    // history mapped into messages, latest user turn last; nothing in system carries history
    expect(req.messages).toEqual([
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
      { role: "user", content: "A2" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/providers.claude.test.ts`
Expected: FAIL — cannot find module `../src/providers/claude.js`.

- [ ] **Step 3: Create `backend/src/providers/claude.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMResult, Turn } from "./types.js";
import { mapHistory } from "../prompt.js";

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        { type: "text", text: personaAttack, cache_control: { type: "ephemeral" } },
        { type: "text", text: skripsi, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        ...mapHistory(history),
        { role: "user", content: userInput },
      ],
    });

    const reply = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    const u = response.usage as any;
    return {
      reply,
      usage: {
        input_tokens: u?.input_tokens ?? 0,
        output_tokens: u?.output_tokens ?? 0,
        cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/providers.claude.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/claude.ts backend/test/providers.claude.test.ts
git commit -m "feat(backend): ClaudeProvider with cached system blocks + usage logging"
```

---

### Task 6: OpenRouterProvider (OpenAI-compatible fetch)

**Files:**
- Create: `backend/src/providers/openrouter.ts`
- Test: `backend/test/providers.openrouter.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Turn`, `mapHistory`.
- Produces: `class OpenRouterProvider implements LLMProvider` with `constructor(apiKey: string, model: string)`. `sendTurn` POSTs to `https://openrouter.ai/api/v1/chat/completions` with a single `system` message (persona + "\n\n" + skripsi joined), then mapped history, then the latest user message. No caching. Returns `{ reply }`. Throws on non-2xx with a message that does **not** include the API key.

- [ ] **Step 1: Write the failing test `backend/test/providers.openrouter.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import type { Turn } from "../src/providers/types.js";

afterEach(() => vi.restoreAllMocks());

describe("OpenRouterProvider", () => {
  it("sends system + mapped history + user, returns reply", async () => {
    const captured: { url?: string; body?: any; headers?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.headers = init.headers;
        captured.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "Tanggapan penguji." } }],
          }),
        } as any;
      }),
    );

    const provider = new OpenRouterProvider("or-key", "anthropic/claude-sonnet-4.6");
    const history: Turn[] = [{ role: "examiner", content: "Q1" }];
    const result = await provider.sendTurn("PERSONA", "SKRIPSI", history, "A1");

    expect(result.reply).toBe("Tanggapan penguji.");
    expect(captured.url).toContain("openrouter.ai/api/v1/chat/completions");
    expect(captured.body.model).toBe("anthropic/claude-sonnet-4.6");
    expect(captured.body.messages[0]).toEqual({
      role: "system",
      content: "PERSONA\n\nSKRIPSI",
    });
    expect(captured.body.messages).toEqual([
      { role: "system", content: "PERSONA\n\nSKRIPSI" },
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
    ]);
  });

  it("throws without leaking the api key on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      })) as any,
    );
    const provider = new OpenRouterProvider("or-SECRET-key", "x/y");
    await expect(
      provider.sendTurn("P", "S", [], "hi"),
    ).rejects.toThrow(/OpenRouter request failed \(401\)/);
    await expect(
      provider.sendTurn("P", "S", [], "hi"),
    ).rejects.not.toThrow(/or-SECRET-key/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/providers.openrouter.test.ts`
Expected: FAIL — cannot find module `../src/providers/openrouter.js`.

- [ ] **Step 3: Create `backend/src/providers/openrouter.ts`**

```ts
import type { LLMProvider, LLMResult, Turn } from "./types.js";
import { mapHistory } from "../prompt.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult> {
    const messages = [
      { role: "system" as const, content: `${personaAttack}\n\n${skripsi}` },
      ...mapHistory(history),
      { role: "user" as const, content: userInput },
    ];

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 1024 }),
    });

    if (!res.ok) {
      // Never include the API key in the error.
      throw new Error(`OpenRouter request failed (${res.status})`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/providers.openrouter.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/openrouter.ts backend/test/providers.openrouter.test.ts
git commit -m "feat(backend): OpenRouterProvider (OpenAI-compatible, no caching)"
```

---

### Task 7: Provider factory (providers/index.ts)

**Files:**
- Create: `backend/src/providers/index.ts`
- Test: `backend/test/providers.factory.test.ts`

**Interfaces:**
- Consumes: `ClaudeProvider`, `OpenRouterProvider`, `LLMProvider`.
- Produces: `getProvider(cfg: { provider: string; apiKey: string; model: string }): LLMProvider` — returns `ClaudeProvider` for `provider === "claude"`, `OpenRouterProvider` for `provider === "openrouter"`, throws for unknown.

- [ ] **Step 1: Write the failing test `backend/test/providers.factory.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { getProvider } from "../src/providers/index.js";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

describe("getProvider", () => {
  it("returns ClaudeProvider for claude", () => {
    const p = getProvider({ provider: "claude", apiKey: "k", model: "claude-sonnet-5" });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });

  it("returns OpenRouterProvider for openrouter", () => {
    const p = getProvider({ provider: "openrouter", apiKey: "k", model: "x/y" });
    expect(p).toBeInstanceOf(OpenRouterProvider);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      getProvider({ provider: "bogus", apiKey: "k", model: "m" }),
    ).toThrow(/unknown provider/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/providers.factory.test.ts`
Expected: FAIL — cannot find module `../src/providers/index.js`.

- [ ] **Step 3: Create `backend/src/providers/index.ts`**

```ts
import type { LLMProvider } from "./types.js";
import { ClaudeProvider } from "./claude.js";
import { OpenRouterProvider } from "./openrouter.js";

export function getProvider(cfg: {
  provider: string;
  apiKey: string;
  model: string;
}): LLMProvider {
  switch (cfg.provider) {
    case "claude":
      return new ClaudeProvider(cfg.apiKey, cfg.model);
    case "openrouter":
      return new OpenRouterProvider(cfg.apiKey, cfg.model);
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/providers.factory.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/index.ts backend/test/providers.factory.test.ts
git commit -m "feat(backend): provider factory keyed on settings.provider"
```

---

### Task 8: Settings repo + route (encrypted key at rest)

**Files:**
- Create: `backend/src/repos/settings.ts`, `backend/src/routes/settings.ts`
- Modify: `backend/src/app.ts` (accept `db` + `key`, mount settings router)
- Test: `backend/test/routes.settings.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` (Task 2), `openDb` (Task 3).
- Produces (`repos/settings.ts`):
  ```ts
  export function getSetting(db, key: string): string | null;
  export function setSetting(db, key: string, value: string): void;
  export function getSettingsView(db): { provider: string; model: string; has_api_key: boolean; attack_points: string };
  export function saveSettings(db, key: Buffer, body: { provider?: string; api_key?: string; model?: string; attack_points?: string }): void;
  export function getActiveConfig(db, key: Buffer): { provider: string; model: string; apiKey: string; attackPoints: string };
  export function seedDefaults(db): void;   // seeds provider=claude, model=claude-sonnet-5, attack_points=DEFAULT
  ```
  `saveSettings` encrypts `api_key` before storing under `settings['api_key']`. `getActiveConfig` decrypts it; throws if missing. `has_api_key` is `getSetting('api_key') != null`.
- Produces (`routes/settings.ts`): `settingsRouter(db, key)` — `GET /` → settings view; `POST /` → save then return updated view.
- Modifies `buildApp` signature to `buildApp(db: Database.Database, key: Buffer)`.

- [ ] **Step 1: Create `backend/src/repos/settings.ts`**

```ts
import type Database from "better-sqlite3";
import { encrypt, decrypt } from "../crypto.js";
import { DEFAULT_ATTACK_POINTS } from "../persona.js";

const DEFAULTS: Record<string, string> = {
  provider: "claude",
  model: "claude-sonnet-5",
  attack_points: DEFAULT_ATTACK_POINTS,
};

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function seedDefaults(db: Database.Database): void {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(db, k) === null) setSetting(db, k, v);
  }
}

export function getSettingsView(db: Database.Database): {
  provider: string;
  model: string;
  has_api_key: boolean;
  attack_points: string;
} {
  return {
    provider: getSetting(db, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, "model") ?? DEFAULTS.model,
    has_api_key: getSetting(db, "api_key") !== null,
    attack_points: getSetting(db, "attack_points") ?? DEFAULTS.attack_points,
  };
}

export function saveSettings(
  db: Database.Database,
  key: Buffer,
  body: { provider?: string; api_key?: string; model?: string; attack_points?: string },
): void {
  if (body.provider !== undefined) setSetting(db, "provider", body.provider);
  if (body.model !== undefined) setSetting(db, "model", body.model);
  if (body.attack_points !== undefined)
    setSetting(db, "attack_points", body.attack_points);
  if (body.api_key !== undefined && body.api_key !== "") {
    setSetting(db, "api_key", encrypt(body.api_key, key));
  }
}

export function getActiveConfig(
  db: Database.Database,
  key: Buffer,
): { provider: string; model: string; apiKey: string; attackPoints: string } {
  const enc = getSetting(db, "api_key");
  if (!enc) throw new Error("API key belum diset");
  return {
    provider: getSetting(db, "provider") ?? DEFAULTS.provider,
    model: getSetting(db, "model") ?? DEFAULTS.model,
    apiKey: decrypt(enc, key),
    attackPoints: getSetting(db, "attack_points") ?? DEFAULTS.attack_points,
  };
}
```

- [ ] **Step 2: Create `backend/src/routes/settings.ts`**

```ts
import { Router } from "express";
import type Database from "better-sqlite3";
import { getSettingsView, saveSettings } from "../repos/settings.js";

export function settingsRouter(db: Database.Database, key: Buffer): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json(getSettingsView(db));
  });

  r.post("/", (req, res) => {
    saveSettings(db, key, req.body ?? {});
    res.json(getSettingsView(db));
  });

  return r;
}
```

- [ ] **Step 3: Update `backend/src/app.ts`**

```ts
import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { seedDefaults } from "./repos/settings.js";
import { settingsRouter } from "./routes/settings.js";

export function buildApp(db: Database.Database, key: Buffer): express.Express {
  seedDefaults(db);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/settings", settingsRouter(db, key));

  return app;
}
```

- [ ] **Step 4: Update `backend/src/index.ts` and `backend/test/health.test.ts` for the new signature**

`backend/src/index.ts`:

```ts
import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { PORT, loadEncryptionKey } from "./env.js";

const db = openDb("data/sibiru.sqlite");
const app = buildApp(db, loadEncryptionKey());
app.listen(PORT, () => {
  console.log(`SiBiru backend listening on http://localhost:${PORT}`);
});
```

`backend/test/health.test.ts` (update to build with an in-memory db + throwaway key):

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";

describe("health", () => {
  it("returns ok", async () => {
    const app = buildApp(openDb(":memory:"), randomBytes(32));
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

Also add `data/` creation note: `backend/src/index.ts` writes to `data/sibiru.sqlite`; create the dir once with `mkdir -p backend/data` (it is gitignored). Add that to Task 15 run instructions.

- [ ] **Step 5: Write the failing test `backend/test/routes.settings.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { getSetting } from "../src/repos/settings.js";

function app() {
  const db = openDb(":memory:");
  return { app: buildApp(db, randomBytes(32)), db };
}

describe("settings routes", () => {
  it("GET returns defaults with has_api_key false and no raw key", async () => {
    const { app: a } = app();
    const res = await request(a).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("claude");
    expect(res.body.model).toBe("claude-sonnet-5");
    expect(res.body.has_api_key).toBe(false);
    expect(res.body).not.toHaveProperty("api_key");
  });

  it("POST stores an encrypted key, never returns it, and flips has_api_key", async () => {
    const { app: a, db } = app();
    const res = await request(a)
      .post("/settings")
      .send({ provider: "openrouter", model: "x/y", api_key: "or-SECRET" });
    expect(res.status).toBe(200);
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.provider).toBe("openrouter");
    expect(JSON.stringify(res.body)).not.toContain("or-SECRET");
    // stored value is ciphertext, not plaintext
    const stored = getSetting(db, "api_key");
    expect(stored).not.toBeNull();
    expect(stored).not.toContain("or-SECRET");
  });

  it("POST without api_key preserves the existing key", async () => {
    const { app: a } = app();
    await request(a).post("/settings").send({ api_key: "keep-me" });
    const res = await request(a).post("/settings").send({ model: "claude-opus-4-8" });
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.model).toBe("claude-opus-4-8");
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/routes.settings.test.ts test/health.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repos/settings.ts backend/src/routes/settings.ts backend/src/app.ts backend/src/index.ts backend/test/routes.settings.test.ts backend/test/health.test.ts
git commit -m "feat(backend): settings repo + routes with encrypted API key at rest"
```

---

### Task 9: Sessions repo + routes (create, turns, turn, delete)

**Files:**
- Create: `backend/src/repos/sessions.ts`, `backend/src/repos/documents.ts`, `backend/src/routes/sessions.ts`
- Modify: `backend/src/app.ts` (mount sessions router)
- Test: `backend/test/routes.sessions.test.ts`

**Interfaces:**
- Consumes: `getProvider` (Task 7), `getActiveConfig` (Task 8), `PERSONA_TONE` (Task 4).
- Produces (`repos/documents.ts`):
  ```ts
  export function getActiveDocument(db): { filename: string; full_text: string; char_count: number; created_at: string } | null;
  export function replaceDocument(db, filename: string, fullText: string, createdAt: string): void; // deletes old rows first
  export function deleteDocument(db): void;
  ```
- Produces (`repos/sessions.ts`):
  ```ts
  export function createSession(db, id: string, createdAt: string, label: string | null): void;
  export function getTurns(db, sessionId: string): { turn_number: number; role: "examiner"|"user"; content: string }[];
  export function addTurn(db, sessionId: string, turnNumber: number, role: "examiner"|"user", content: string, createdAt: string): void;
  export function nextTurnNumber(db, sessionId: string): number;
  export function sessionExists(db, sessionId: string): boolean;
  export function deleteSession(db, sessionId: string): void;
  ```
- Produces (`routes/sessions.ts`): `sessionsRouter(db, key, now?, uuid?)`. `now`/`uuid` injectable for tests (default `() => new Date().toISOString()`, `crypto.randomUUID`). Routes:
  - `POST /` → creates session, returns `{ session_id }`.
  - `GET /:id/turns` → `{ turns: Turn[] }`.
  - `POST /:id/turn` body `{ transcript }` → guard (400 if no session, no api_key, or no document), persist user turn, call provider, persist examiner turn, return `{ reply }`.
  - `DELETE /:id` → cascade delete, return `{ ok: true }`.
- The `POST /:id/turn` handler builds `personaAttack = PERSONA_TONE + "\n\n" + attackPoints`.

- [ ] **Step 1: Create `backend/src/repos/documents.ts`**

```ts
import type Database from "better-sqlite3";

export function getActiveDocument(db: Database.Database): {
  filename: string;
  full_text: string;
  char_count: number;
  created_at: string;
} | null {
  const row = db
    .prepare(
      "SELECT filename, full_text, char_count, created_at FROM documents ORDER BY id DESC LIMIT 1",
    )
    .get() as any;
  return row ?? null;
}

export function replaceDocument(
  db: Database.Database,
  filename: string,
  fullText: string,
  createdAt: string,
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM documents").run();
    db.prepare(
      "INSERT INTO documents (filename, full_text, char_count, created_at) VALUES (?,?,?,?)",
    ).run(filename, fullText, fullText.length, createdAt);
  });
  tx();
}

export function deleteDocument(db: Database.Database): void {
  db.prepare("DELETE FROM documents").run();
}
```

- [ ] **Step 2: Create `backend/src/repos/sessions.ts`**

```ts
import type Database from "better-sqlite3";
import type { Turn } from "../providers/types.js";

export function createSession(
  db: Database.Database,
  id: string,
  createdAt: string,
  label: string | null,
): void {
  db.prepare("INSERT INTO sessions (id, created_at, label) VALUES (?,?,?)").run(
    id,
    createdAt,
    label,
  );
}

export function sessionExists(db: Database.Database, sessionId: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId) !== undefined
  );
}

export function getTurns(db: Database.Database, sessionId: string): Turn[] {
  return db
    .prepare(
      "SELECT role, content FROM turns WHERE session_id = ? ORDER BY turn_number ASC",
    )
    .all(sessionId) as Turn[];
}

export function nextTurnNumber(db: Database.Database, sessionId: string): number {
  const row = db
    .prepare("SELECT MAX(turn_number) AS m FROM turns WHERE session_id = ?")
    .get(sessionId) as { m: number | null };
  return (row.m ?? 0) + 1;
}

export function addTurn(
  db: Database.Database,
  sessionId: string,
  turnNumber: number,
  role: "examiner" | "user",
  content: string,
  createdAt: string,
): void {
  db.prepare(
    "INSERT INTO turns (session_id, turn_number, role, content, created_at) VALUES (?,?,?,?,?)",
  ).run(sessionId, turnNumber, role, content, createdAt);
}

export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
```

- [ ] **Step 3: Create `backend/src/routes/sessions.ts`**

```ts
import { Router } from "express";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getProvider } from "../providers/index.js";
import { getActiveConfig, getSetting } from "../repos/settings.js";
import { getActiveDocument } from "../repos/documents.js";
import { PERSONA_TONE } from "../persona.js";
import {
  createSession,
  sessionExists,
  getTurns,
  nextTurnNumber,
  addTurn,
  deleteSession,
} from "../repos/sessions.js";

export function sessionsRouter(
  db: Database.Database,
  key: Buffer,
  now: () => string = () => new Date().toISOString(),
  uuid: () => string = () => randomUUID(),
): Router {
  const r = Router();

  r.post("/", (req, res) => {
    const id = uuid();
    createSession(db, id, now(), (req.body?.label as string) ?? null);
    res.json({ session_id: id });
  });

  r.get("/:id/turns", (req, res) => {
    res.json({ turns: getTurns(db, req.params.id) });
  });

  r.post("/:id/turn", async (req, res) => {
    const sessionId = req.params.id;
    const transcript = (req.body?.transcript ?? "").toString().trim();

    if (!sessionExists(db, sessionId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    if (!transcript) {
      return res.status(400).json({ error: "Transkrip kosong" });
    }
    if (getSetting(db, "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu" });
    }
    const doc = getActiveDocument(db);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }

    try {
      const history = getTurns(db, sessionId);
      addTurn(db, sessionId, nextTurnNumber(db, sessionId), "user", transcript, now());

      const cfg = getActiveConfig(db, key);
      const provider = getProvider(cfg);
      const personaAttack = `${PERSONA_TONE}\n\n${cfg.attackPoints}`;
      const result = await provider.sendTurn(
        personaAttack,
        doc.full_text,
        history,
        transcript,
      );

      if (result.usage) {
        console.log("[turn usage]", result.usage);
      }

      addTurn(
        db,
        sessionId,
        nextTurnNumber(db, sessionId),
        "examiner",
        result.reply,
        now(),
      );
      res.json({ reply: result.reply });
    } catch (err) {
      // Never leak provider internals / keys.
      console.error("[turn error]", (err as Error).message);
      res.status(500).json({ error: "Gagal memanggil penguji AI" });
    }
  });

  r.delete("/:id", (req, res) => {
    deleteSession(db, req.params.id);
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Mount the router in `backend/src/app.ts`**

Add the import and `app.use`:

```ts
import { sessionsRouter } from "./routes/sessions.js";
```

and, after the settings mount:

```ts
  app.use("/sessions", sessionsRouter(db, key));
```

- [ ] **Step 5: Write the failing test `backend/test/routes.sessions.test.ts`**

This test stubs the provider network by pre-seeding a settings key and document, then monkeypatches `fetch`/SDK is avoided by using the `openrouter` provider with a stubbed global `fetch`.

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument } from "../src/repos/documents.js";

afterEach(() => vi.restoreAllMocks());

function ready() {
  const db = openDb(":memory:");
  const key = randomBytes(32);
  // configure openrouter so the turn goes through global fetch (easy to stub)
  saveSettings(db, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
  replaceDocument(db, "thesis.pdf", "ISI SKRIPSI LENGKAP", "2026-01-01T00:00:00Z");
  return buildApp(db, key);
}

describe("sessions routes", () => {
  it("creates a session and returns a session_id", async () => {
    const res = await request(ready()).post("/sessions").send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.session_id).toBe("string");
    expect(res.body.session_id.length).toBeGreaterThan(0);
  });

  it("runs a full turn and stores user + examiner turns in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Pertanyaan penguji?" } }] }),
      })) as any,
    );
    const app = ready();
    const created = await request(app).post("/sessions").send({});
    const id = created.body.session_id;

    const turn = await request(app)
      .post(`/sessions/${id}/turn`)
      .send({ transcript: "Ini jawaban saya." });
    expect(turn.status).toBe(200);
    expect(turn.body.reply).toBe("Pertanyaan penguji?");

    const turns = await request(app).get(`/sessions/${id}/turns`);
    expect(turns.body.turns).toEqual([
      { role: "user", content: "Ini jawaban saya." },
      { role: "examiner", content: "Pertanyaan penguji?" },
    ]);
  });

  it("400s a turn when no API key is set", async () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    replaceDocument(db, "t.pdf", "isi", "2026-01-01T00:00:00Z");
    const app = buildApp(db, key);
    const created = await request(app).post("/sessions").send({});
    const res = await request(app)
      .post(`/sessions/${created.body.session_id}/turn`)
      .send({ transcript: "halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/API key/i);
  });

  it("400s a turn when no document is uploaded", async () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    saveSettings(db, key, { provider: "openrouter", model: "x/y", api_key: "or-key" });
    const app = buildApp(db, key);
    const created = await request(app).post("/sessions").send({});
    const res = await request(app)
      .post(`/sessions/${created.body.session_id}/turn`)
      .send({ transcript: "halo" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skripsi/i);
  });

  it("deletes a session and cascades its turns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "q" } }] }),
      })) as any,
    );
    const app = ready();
    const created = await request(app).post("/sessions").send({});
    const id = created.body.session_id;
    await request(app).post(`/sessions/${id}/turn`).send({ transcript: "hi" });

    const del = await request(app).delete(`/sessions/${id}`);
    expect(del.body).toEqual({ ok: true });

    const turns = await request(app).get(`/sessions/${id}/turns`);
    expect(turns.body.turns).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/routes.sessions.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repos/sessions.ts backend/src/repos/documents.ts backend/src/routes/sessions.ts backend/src/app.ts backend/test/routes.sessions.test.ts
git commit -m "feat(backend): session + turn routes wired to provider via factory"
```

---

### Task 10: Skripsi upload route (unpdf extraction)

**Files:**
- Create: `backend/src/routes/skripsi.ts`, `backend/test/fixtures/make-pdf.ts` (dev helper to generate the fixture), `backend/test/fixtures/sample.pdf`
- Modify: `backend/src/app.ts` (mount skripsi router)
- Test: `backend/test/routes.skripsi.test.ts`

**Interfaces:**
- Consumes: `replaceDocument`, `getActiveDocument`, `deleteDocument` (Task 9), `extractText`/`getDocumentProxy` from `unpdf`.
- Produces (`routes/skripsi.ts`): `skripsiRouter(db, now?)` using `multer` memory storage on field `file`:
  - `POST /` (multipart) → extract text via unpdf, `replaceDocument`, return `{ filename, char_count, uploaded_at }`. 400 if no file, 422 if extraction yields empty text.
  - `GET /` → `{ filename, char_count, uploaded_at } | null`.
  - `DELETE /` → `{ ok: true }`.

- [ ] **Step 1: Create the fixture generator `backend/test/fixtures/make-pdf.ts`**

A minimal hand-written single-page PDF containing extractable text "SKRIPSI CONTOH". Run once to produce `sample.pdf`.

```ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Minimal PDF with one text object: "SKRIPSI CONTOH"
const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 58 >>
stream
BT /F1 24 Tf 72 700 Td (SKRIPSI CONTOH BAB 1) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
trailer<< /Root 1 0 R /Size 6 >>
startxref
0
%%EOF`;

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "sample.pdf"), pdf, "latin1");
console.log("wrote sample.pdf");
```

- [ ] **Step 2: Generate the fixture**

Run: `cd backend && npx tsx test/fixtures/make-pdf.ts`
Expected: prints `wrote sample.pdf`; `backend/test/fixtures/sample.pdf` exists.

- [ ] **Step 3: Create `backend/src/routes/skripsi.ts`**

```ts
import { Router } from "express";
import multer from "multer";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import {
  replaceDocument,
  getActiveDocument,
  deleteDocument,
} from "../repos/documents.js";

const upload = multer({ storage: multer.memoryStorage() });

export function skripsiRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.post("/", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File PDF wajib diunggah" });
    try {
      const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const fullText = (Array.isArray(text) ? text.join("\n") : text).trim();
      if (!fullText) {
        return res
          .status(422)
          .json({ error: "Tidak ada teks yang bisa diekstrak dari PDF ini" });
      }
      const createdAt = now();
      replaceDocument(db, req.file.originalname, fullText, createdAt);
      res.json({
        filename: req.file.originalname,
        char_count: fullText.length,
        uploaded_at: createdAt,
      });
    } catch {
      res.status(422).json({ error: "Gagal membaca PDF" });
    }
  });

  r.get("/", (_req, res) => {
    const doc = getActiveDocument(db);
    if (!doc) return res.json(null);
    res.json({
      filename: doc.filename,
      char_count: doc.char_count,
      uploaded_at: doc.created_at,
    });
  });

  r.delete("/", (_req, res) => {
    deleteDocument(db);
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Mount the router in `backend/src/app.ts`**

```ts
import { skripsiRouter } from "./routes/skripsi.js";
```

and after the sessions mount:

```ts
  app.use("/skripsi", skripsiRouter(db));
```

- [ ] **Step 5: Write the failing test `backend/test/routes.skripsi.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePdf = readFileSync(join(here, "fixtures/sample.pdf"));

function app() {
  return buildApp(openDb(":memory:"), randomBytes(32));
}

describe("skripsi routes", () => {
  it("GET returns null when no document uploaded", async () => {
    const res = await request(app()).get("/skripsi");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("POST extracts text, stores it, and returns metadata", async () => {
    const a = app();
    const res = await request(a)
      .post("/skripsi")
      .attach("file", samplePdf, "thesis.pdf");
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("thesis.pdf");
    expect(res.body.char_count).toBeGreaterThan(0);
    expect(typeof res.body.uploaded_at).toBe("string");

    const get = await request(a).get("/skripsi");
    expect(get.body.filename).toBe("thesis.pdf");
  });

  it("400s when no file is attached", async () => {
    const res = await request(app()).post("/skripsi");
    expect(res.status).toBe(400);
  });

  it("re-upload replaces the previous document (<=1 row)", async () => {
    const a = app();
    await request(a).post("/skripsi").attach("file", samplePdf, "first.pdf");
    await request(a).post("/skripsi").attach("file", samplePdf, "second.pdf");
    const get = await request(a).get("/skripsi");
    expect(get.body.filename).toBe("second.pdf");
  });

  it("DELETE removes the active document", async () => {
    const a = app();
    await request(a).post("/skripsi").attach("file", samplePdf, "x.pdf");
    await request(a).delete("/skripsi");
    const get = await request(a).get("/skripsi");
    expect(get.body).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/routes.skripsi.test.ts`
Expected: all 5 tests PASS. (If unpdf extracts empty text from the minimal fixture, regenerate with a richer text object; the fixture's `(SKRIPSI CONTOH BAB 1)` string must survive extraction.)

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: every test file PASSES.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/skripsi.ts backend/src/app.ts backend/test/routes.skripsi.test.ts backend/test/fixtures/make-pdf.ts backend/test/fixtures/sample.pdf
git commit -m "feat(backend): skripsi PDF upload + unpdf extraction, single active doc"
```

---

### Task 11: Frontend scaffold + API client + types

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/styles.css`, `frontend/src/App.tsx` (placeholder)
- Test: `frontend/src/api.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Role = "examiner" | "user";
  export interface Turn { role: Role; content: string; }
  export interface SettingsView { provider: string; model: string; has_api_key: boolean; attack_points: string; }
  export interface SkripsiInfo { filename: string; char_count: number; uploaded_at: string; }
  ```
- Produces (`api.ts`): `createSession()`, `getTurns(id)`, `postTurn(id, transcript)`, `deleteSession(id)`, `getSettings()`, `saveSettings(body)`, `getSkripsi()`, `uploadSkripsi(file)`, `deleteSkripsi()`. All hit `/api/...` (Vite proxies to backend). Each throws `Error(body.error)` on non-2xx.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "sibiru-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

Single config (no project references) — `noEmit` because Vite/esbuild does the actual transpile; `tsc --noEmit` is type-check only. `allowImportingTsExtensions` is off, so `.js`-suffixed imports of `.ts`/`.tsx` files resolve via bundler mode (Vite resolves them at runtime).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

Import `defineConfig` from `vitest/config` (not `vite`) so the `test` block type-checks.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SiBiru — Simulator Sidang Skripsi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/src/types.ts`**

```ts
export type Role = "examiner" | "user";
export interface Turn { role: Role; content: string; }
export interface SettingsView {
  provider: string;
  model: string;
  has_api_key: boolean;
  attack_points: string;
}
export interface SkripsiInfo {
  filename: string;
  char_count: number;
  uploaded_at: string;
}
```

- [ ] **Step 6: Create `frontend/src/api.ts`**

```ts
import type { Turn, SettingsView, SkripsiInfo } from "./types.js";

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? `HTTP ${res.status}`);
  return data;
}

export async function createSession(): Promise<string> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return (await jsonOrThrow(res)).session_id;
}

export async function getTurns(id: string): Promise<Turn[]> {
  const res = await fetch(`/api/sessions/${id}/turns`);
  return (await jsonOrThrow(res)).turns;
}

export async function postTurn(id: string, transcript: string): Promise<string> {
  const res = await fetch(`/api/sessions/${id}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  return (await jsonOrThrow(res)).reply;
}

export async function deleteSession(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/sessions/${id}`, { method: "DELETE" }));
}

export async function getSettings(): Promise<SettingsView> {
  return jsonOrThrow(await fetch("/api/settings"));
}

export async function saveSettings(body: {
  provider?: string;
  api_key?: string;
  model?: string;
  attack_points?: string;
}): Promise<SettingsView> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function getSkripsi(): Promise<SkripsiInfo | null> {
  return jsonOrThrow(await fetch("/api/skripsi"));
}

export async function uploadSkripsi(file: File): Promise<SkripsiInfo> {
  const form = new FormData();
  form.append("file", file);
  return jsonOrThrow(await fetch("/api/skripsi", { method: "POST", body: form }));
}

export async function deleteSkripsi(): Promise<void> {
  await jsonOrThrow(await fetch("/api/skripsi", { method: "DELETE" }));
}
```

- [ ] **Step 7: Create `frontend/src/styles.css`, `frontend/src/main.tsx`, placeholder `frontend/src/App.tsx`**

`frontend/src/styles.css`:

```css
:root { font-family: system-ui, sans-serif; }
body { margin: 0; background: #faf9f6; color: #1a1a1a; }
.app { max-width: 720px; margin: 0 auto; padding: 1.5rem; }
.bubble { padding: .75rem 1rem; border-radius: .75rem; margin: .5rem 0; white-space: pre-wrap; }
.bubble.user { background: #dbeafe; text-align: right; }
.bubble.examiner { background: #f3e8d8; }
button { cursor: pointer; padding: .5rem 1rem; border-radius: .5rem; border: 1px solid #999; }
button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.rec { background: #dc2626; color: #fff; border-color: #dc2626; }
textarea, input, select { width: 100%; padding: .5rem; margin: .25rem 0 .75rem; box-sizing: border-box; }
.error { color: #dc2626; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; }
.modal { background: #fff; padding: 1.5rem; border-radius: .75rem; max-width: 360px; }
nav { display: flex; gap: .5rem; margin-bottom: 1rem; }
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/src/App.tsx` (placeholder, replaced in Task 14):

```tsx
export default function App() {
  return <div className="app">SiBiru</div>;
}
```

- [ ] **Step 8: Write the failing test `frontend/src/api.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { postTurn, uploadSkripsi } from "./api.js";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("postTurn returns the reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Q?" }) })) as any,
    );
    expect(await postTurn("s1", "jawaban")).toBe("Q?");
  });

  it("throws the server error message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Upload skripsi (PDF) dulu" }),
      })) as any,
    );
    await expect(postTurn("s1", "x")).rejects.toThrow("Upload skripsi (PDF) dulu");
  });

  it("uploadSkripsi posts multipart FormData", async () => {
    const captured: { body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        captured.body = init.body;
        return { ok: true, json: async () => ({ filename: "a.pdf", char_count: 3, uploaded_at: "t" }) };
      }) as any,
    );
    const file = new File(["hi"], "a.pdf", { type: "application/pdf" });
    const info = await uploadSkripsi(file);
    expect(info.filename).toBe("a.pdf");
    expect(captured.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 9: Install and run**

Run: `cd frontend && npm install && npm test`
Expected: all 3 api tests PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html frontend/src/main.tsx frontend/src/types.ts frontend/src/api.ts frontend/src/styles.css frontend/src/App.tsx frontend/src/api.test.ts
git commit -m "feat(frontend): Vite+React scaffold, typed API client with /api proxy"
```

---

### Task 12: Speech hooks (STT + TTS)

**Files:**
- Create: `frontend/src/hooks/useSpeechRecognition.ts`, `frontend/src/hooks/useSpeechSynthesis.ts`
- Test: `frontend/src/hooks/useSpeechRecognition.test.ts`

**Interfaces:**
- Produces (`useSpeechRecognition.ts`): `useSpeechRecognition(): { supported: boolean; listening: boolean; transcript: string; start(): void; stop(): void; reset(): void }`. Uses `window.SpeechRecognition ?? window.webkitSpeechRecognition`, lang `id-ID`, `interimResults` on, accumulates final results into `transcript`.
- Produces (`useSpeechSynthesis.ts`): `useSpeechSynthesis(): { supported: boolean; speak(text: string): void; cancel(): void }`. Uses `window.speechSynthesis`, utterance lang `id-ID`.

- [ ] **Step 1: Create `frontend/src/hooks/useSpeechRecognition.ts`**

```ts
import { useCallback, useRef, useState } from "react";

type SR = typeof window & {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
};

export function useSpeechRecognition() {
  const w = window as SR;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const supported = Boolean(Ctor);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);
  const finalRef = useRef("");

  const start = useCallback(() => {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += chunk + " ";
        else interim += chunk;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    finalRef.current = "";
    setTranscript("");
    rec.start();
    setListening(true);
  }, [Ctor]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
  }, []);

  return { supported, listening, transcript, start, stop, reset };
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useSpeechSynthesis.ts`**

```ts
import { useCallback } from "react";

export function useSpeechSynthesis() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "id-ID";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, cancel };
}
```

- [ ] **Step 3: Write the failing test `frontend/src/hooks/useSpeechRecognition.test.ts`**

Drives a fake `SpeechRecognition` to verify transcript accumulation and lifecycle.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "./useSpeechRecognition.js";

class FakeRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

let last: FakeRecognition;

beforeEach(() => {
  (window as any).SpeechRecognition = vi.fn(() => (last = new FakeRecognition()));
});
afterEach(() => {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

describe("useSpeechRecognition", () => {
  it("reports supported and lang id-ID", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(last.lang).toBe("id-ID");
    expect(result.current.listening).toBe(true);
  });

  it("accumulates final results into transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => {
      last.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: "halo" }], { isFinal: true }),
        ],
      });
    });
    expect(result.current.transcript).toBe("halo");
  });

  it("reports unsupported when no API present", () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useSpeechRecognition.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSpeechRecognition.ts frontend/src/hooks/useSpeechSynthesis.ts frontend/src/hooks/useSpeechRecognition.test.ts
git commit -m "feat(frontend): Web Speech STT + TTS hooks (id-ID)"
```

---

### Task 13: ConfirmModal + SettingsPage

**Files:**
- Create: `frontend/src/components/ConfirmModal.tsx`, `frontend/src/pages/SettingsPage.tsx`
- Test: `frontend/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `getSkripsi`, `uploadSkripsi`, `deleteSkripsi` (Task 11).
- Produces (`ConfirmModal.tsx`): `ConfirmModal({ open, title, message, onConfirm, onCancel }): JSX` — renders nothing when `!open`.
- Produces (`SettingsPage.tsx`): `SettingsPage(): JSX` — provider `<select>` (claude/openrouter), model control (dropdown for claude, free text for openrouter), write-only API key input showing "Key tersimpan: ya/tidak", attack points `<textarea>`, save button, skripsi upload (`<input type=file>`) + current-doc display + delete. Uses local state; loads via `useEffect`.

- [ ] **Step 1: Create `frontend/src/components/ConfirmModal.tsx`**

```tsx
interface Props {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ open, title, message, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel}>Batal</button>
          <button className="primary" onClick={onConfirm}>
            Ya, hapus
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/pages/SettingsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  getSettings,
  saveSettings,
  getSkripsi,
  uploadSkripsi,
  deleteSkripsi,
} from "../api.js";
import type { SettingsView, SkripsiInfo } from "../types.js";

const CLAUDE_MODELS = [
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
];

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("claude-sonnet-5");
  const [apiKey, setApiKey] = useState("");
  const [attackPoints, setAttackPoints] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      setAttackPoints(s.attack_points);
    });
    getSkripsi().then(setSkripsi);
  }, []);

  async function onSave() {
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, string> = { provider, model, attack_points: attackPoints };
      if (apiKey) body.api_key = apiKey;
      const updated = await saveSettings(body);
      setSettings(updated);
      setApiKey("");
      setMsg("Tersimpan.");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      setSkripsi(await uploadSkripsi(file));
      setMsg("Skripsi diunggah.");
    } catch (e) {
      setErr((e as Error).message);
    }
    e.target.value = "";
  }

  async function onDeleteSkripsi() {
    await deleteSkripsi();
    setSkripsi(null);
  }

  return (
    <div>
      <h2>Pengaturan</h2>

      <label>Provider</label>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="claude">Claude</option>
        <option value="openrouter">OpenRouter</option>
      </select>

      <label>Model</label>
      {provider === "claude" ? (
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {CLAUDE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={model}
          placeholder="mis. anthropic/claude-sonnet-4.6"
          onChange={(e) => setModel(e.target.value)}
        />
      )}

      <label>
        API Key — Key tersimpan: {settings?.has_api_key ? "ya" : "tidak"}
      </label>
      <input
        type="password"
        value={apiKey}
        placeholder={settings?.has_api_key ? "(biarkan kosong untuk mempertahankan)" : "tempel API key"}
        onChange={(e) => setApiKey(e.target.value)}
      />

      <label>Poin Serangan Penguji</label>
      <textarea rows={8} value={attackPoints} onChange={(e) => setAttackPoints(e.target.value)} />

      <button className="primary" onClick={onSave}>
        Simpan Pengaturan
      </button>

      <hr />
      <h3>Skripsi (PDF)</h3>
      {skripsi ? (
        <p>
          {skripsi.filename} — {skripsi.char_count} karakter{" "}
          <button onClick={onDeleteSkripsi}>Hapus</button>
        </p>
      ) : (
        <p>Belum ada skripsi.</p>
      )}
      <input type="file" accept="application/pdf" onChange={onUpload} />

      {msg && <p>{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write the failing test `frontend/src/pages/SettingsPage.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import * as api from "../api.js";

beforeEach(() => {
  vi.spyOn(api, "getSettings").mockResolvedValue({
    provider: "claude",
    model: "claude-sonnet-5",
    has_api_key: false,
    attack_points: "POIN A",
  });
  vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("loads settings and shows key-not-stored state", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Key tersimpan: tidak/)).toBeTruthy());
    expect(screen.getByText(/Belum ada skripsi/)).toBeTruthy();
  });
});
```

Note: `@testing-library/react` matchers like `.toBeTruthy()` on elements work without jest-dom; if a truthiness assertion on a queried element is desired, `screen.getByText` throws when not found, so reaching the assertion already proves presence.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ConfirmModal.tsx frontend/src/pages/SettingsPage.tsx frontend/src/pages/SettingsPage.test.tsx
git commit -m "feat(frontend): Settings page (provider/model/key/attack points/skripsi upload)"
```

---

### Task 14: SessionPage + App shell

**Files:**
- Create: `frontend/src/pages/SessionPage.tsx`
- Modify: `frontend/src/App.tsx` (nav between Session and Settings)
- Test: `frontend/src/pages/SessionPage.test.tsx`

**Interfaces:**
- Consumes: `createSession`, `getTurns`, `postTurn`, `deleteSession` (Task 11); `useSpeechRecognition`, `useSpeechSynthesis` (Task 12); `ConfirmModal` (Task 13).
- Produces (`SessionPage.tsx`): `SessionPage(): JSX`. On mount, ensures a session id (persist in `localStorage` under `sibiru_session_id`; create if absent) and loads its turns. Renders turn bubbles; a record toggle (uses STT `transcript`, falls back to a `<textarea>` when `!supported`); "Kirim" posts the transcript, appends both turns, and speaks the examiner reply via TTS; a "Reset Sesi" button opens `ConfirmModal` → `deleteSession` → clears localStorage → creates a fresh session.
- Produces (`App.tsx`): view toggle state `"session" | "settings"`, nav buttons, renders the chosen page.

- [ ] **Step 1: Create `frontend/src/pages/SessionPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { createSession, getTurns, postTurn, deleteSession } from "../api.js";
import type { Turn } from "../types.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis.js";
import { ConfirmModal } from "../components/ConfirmModal.js";

const KEY = "sibiru_session_id";

export function SessionPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const stt = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = await createSession();
        localStorage.setItem(KEY, id);
      }
      setSessionId(id);
      try {
        setTurns(await getTurns(id));
      } catch {
        // stale id (backend db reset): make a fresh one
        const fresh = await createSession();
        localStorage.setItem(KEY, fresh);
        setSessionId(fresh);
        setTurns([]);
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const pending = stt.supported ? stt.transcript : manual;

  async function send() {
    if (!sessionId || !pending.trim() || busy) return;
    if (stt.listening) stt.stop();
    setBusy(true);
    setErr(null);
    const transcript = pending.trim();
    setTurns((t) => [...t, { role: "user", content: transcript }]);
    try {
      const reply = await postTurn(sessionId, transcript);
      setTurns((t) => [...t, { role: "examiner", content: reply }]);
      tts.speak(reply);
    } catch (e) {
      setErr((e as Error).message);
      setTurns((t) => t.slice(0, -1)); // roll back the optimistic user bubble
    } finally {
      stt.reset();
      setManual("");
      setBusy(false);
    }
  }

  async function reset() {
    setConfirming(false);
    if (sessionId) await deleteSession(sessionId).catch(() => {});
    localStorage.removeItem(KEY);
    const fresh = await createSession();
    localStorage.setItem(KEY, fresh);
    setSessionId(fresh);
    setTurns([]);
    tts.cancel();
  }

  return (
    <div>
      <h2>Latihan Sidang</h2>
      <div>
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            <strong>{t.role === "examiner" ? "Penguji" : "Anda"}:</strong> {t.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {stt.supported ? (
        <>
          <p><em>{stt.transcript || "(tekan Rekam, lalu bicara)"}</em></p>
          <button
            className={stt.listening ? "rec" : ""}
            onClick={() => (stt.listening ? stt.stop() : stt.start())}
          >
            {stt.listening ? "Berhenti Rekam" : "Rekam"}
          </button>
        </>
      ) : (
        <>
          <p className="error">Browser tidak mendukung Speech Recognition — ketik manual.</p>
          <textarea
            rows={3}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ketik jawaban Anda"
          />
        </>
      )}

      <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem" }}>
        <button className="primary" onClick={send} disabled={busy || !pending.trim()}>
          {busy ? "Mengirim…" : "Kirim"}
        </button>
        <button onClick={() => setConfirming(true)}>Reset Sesi</button>
      </div>

      {err && <p className="error">{err}</p>}

      <ConfirmModal
        open={confirming}
        title="Reset sesi?"
        message="Seluruh riwayat sesi ini akan dihapus permanen."
        onConfirm={reset}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `frontend/src/App.tsx`**

```tsx
import { useState } from "react";
import { SessionPage } from "./pages/SessionPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

export default function App() {
  const [view, setView] = useState<"session" | "settings">("session");
  return (
    <div className="app">
      <h1>SiBiru — Simulator Sidang Skripsi</h1>
      <nav>
        <button
          className={view === "session" ? "primary" : ""}
          onClick={() => setView("session")}
        >
          Latihan
        </button>
        <button
          className={view === "settings" ? "primary" : ""}
          onClick={() => setView("settings")}
        >
          Pengaturan
        </button>
      </nav>
      {view === "session" ? <SessionPage /> : <SettingsPage />}
    </div>
  );
}
```

- [ ] **Step 3: Write the failing test `frontend/src/pages/SessionPage.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPage } from "./SessionPage.js";
import * as api from "../api.js";

beforeEach(() => {
  localStorage.clear();
  // no SpeechRecognition -> manual textarea fallback path
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  (window as any).speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  vi.spyOn(api, "createSession").mockResolvedValue("sess-1");
  vi.spyOn(api, "getTurns").mockResolvedValue([]);
  vi.spyOn(api, "postTurn").mockResolvedValue("Apa kontribusi utama skripsi Anda?");
});
afterEach(() => vi.restoreAllMocks());

describe("SessionPage", () => {
  it("sends a manual answer and renders the examiner reply", async () => {
    render(<SessionPage />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/Ketik jawaban/);
    fireEvent.change(textarea, { target: { value: "Jawaban saya." } });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() =>
      expect(screen.getByText(/Apa kontribusi utama/)).toBeTruthy(),
    );
    expect(api.postTurn).toHaveBeenCalledWith("sess-1", "Jawaban saya.");
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/SessionPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite + type-check + build**

Run: `cd frontend && npm run typecheck && npm test && npm run build`
Expected: `tsc --noEmit` reports no errors; all tests PASS; Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SessionPage.tsx frontend/src/App.tsx frontend/src/pages/SessionPage.test.tsx
git commit -m "feat(frontend): Session page (record/type, send turn, TTS, reset modal) + app shell"
```

---

### Task 15: End-to-end verification

**Files:** none (verification only). Uses the `verify` skill.

**Interfaces:** none.

- [ ] **Step 1: Prepare backend env**

Run:
```bash
cd backend
mkdir -p data
cp .env.example .env
# generate a real key and write it into .env (replace the placeholder line)
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```
Paste the printed line over the `ENCRYPTION_KEY=` line in `backend/.env`. Confirm `.env` and `data/` are gitignored: `git status --porcelain` shows neither.

- [ ] **Step 2: Run both processes**

Terminal A: `cd backend && npm run dev` → expect `SiBiru backend listening on http://localhost:3001`.
Terminal B: `cd frontend && npm run dev` → expect Vite serving on `http://localhost:5173`.

- [ ] **Step 3: Drive the app via the `verify` skill (real browser)**

Invoke the `verify` skill and drive this flow in Chrome/Edge (Web Speech needs a Chromium browser):
1. Open `http://localhost:5173`, go to **Pengaturan**.
2. Provider = Claude, model = `claude-sonnet-5`, paste a real Anthropic API key, keep default attack points, **Simpan** → confirm "Key tersimpan: ya".
3. Upload a real skripsi PDF → confirm filename + char count appear.
4. Go to **Latihan**, type an answer in the manual box (or record), **Kirim**.
5. Confirm an examiner question appears and is spoken aloud.
6. Check backend Terminal A logs show `[turn usage] { ... cache_creation_input_tokens > 0 ... }` on the first turn.
7. Send a second answer → confirm Terminal A logs show `cache_read_input_tokens > 0` (cache hit).
8. Click **Reset Sesi** → confirm modal → confirm the transcript clears and a new session starts.

- [ ] **Step 4: Record evidence**

Capture: the two `[turn usage]` log lines (cache_creation on turn 1, cache_read on turn 2), and a screenshot of the examiner reply rendering. If `cache_read_input_tokens` is 0 on turn 2, the cached block is being invalidated — inspect `ClaudeProvider.sendTurn` to confirm history is only in `messages`.

- [ ] **Step 5: Run both full test suites once more**

Run: `cd backend && npm test` then `cd ../frontend && npm test`
Expected: all green.

- [ ] **Step 6: Commit any fixes discovered during verification**

```bash
git add -A
git commit -m "chore: fixes from end-to-end verification"
```
