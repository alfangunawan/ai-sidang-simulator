# Design Spec — Simulator Sidang Skripsi (SiBiru) v1

**Tanggal:** 2026-07-24
**Status:** Approved design, siap ke implementation plan
**Basis:** PRD user + 4 keputusan brainstorming (lihat §0)

---

## 0. Keputusan brainstorming (delta atas PRD)

Empat fork diputuskan sebelum spec ini ditulis:

1. **Sumber konten skripsi:** upload PDF → ekstrak teks → simpan di DB. (Bukan file hardcoded, bukan paste textarea.)
2. **Strategi context:** full text skripsi masuk ke cached system block. **Tanpa** chunking/RAG/embedding. Prompt caching yang menanggung biaya, bukan pengecilan context.
3. **Provider:** build **dua-duanya** di v1 — Claude native + OpenRouter — di belakang interface `LLMProvider`.
4. **Scope dokumen:** **satu dokumen skripsi aktif global**. Upload sekali, dipakai semua sesi. Re-upload mengganti dokumen aktif.

Semua bagian PRD lain berlaku apa adanya kecuali dikoreksi eksplisit di §4 (struktur cache).

---

## 1. Tujuan & scope

Alat latihan pribadi (single-user, jalan lokal) untuk simulasi sidang skripsi, **turn-based** (bukan voice-to-voice real-time). Penguji AI mengajukan pertanyaan berbasis (a) teks skripsi yang di-upload dan (b) poin serangan yang sudah diidentifikasi. User menjawab lewat suara (STT browser), jawaban penguji dibacakan (TTS browser). Sesi tersimpan, bisa dilanjut.

**Out of scope v1** (per PRD §11): voice-to-voice real-time, multi-user/auth, koneksi ke `pha_db`/Prisma produksi, dashboard skor otomatis, RAG/chunking, fetch daftar model dinamis.

---

## 2. Arsitektur & repo layout

```
Browser (React) ──HTTP──▶ Backend (Express+TS) ──API──▶ Claude API / OpenRouter
   │  Web Speech STT/TTS       │  stateless per-request        (cache di Claude native)
   │                           ▼
   │                        SQLite (better-sqlite3)
   └───────────◀──────────  sessions, turns, settings, documents
```

Monorepo, dua folder, tanpa workspace tooling (npm workspaces tidak perlu untuk 2 paket):

```
sidang-simulation-ai/
  backend/
    src/
      index.ts              # bootstrap Express
      db.ts                 # better-sqlite3 init + migrations (idempotent CREATE TABLE IF NOT EXISTS)
      crypto.ts             # AES-256-GCM encrypt/decrypt
      prompt.ts             # bangun system blocks + messages dari turns
      routes/
        sessions.ts         # POST /sessions, GET/POST turn, DELETE
        settings.ts         # GET/POST /settings
        skripsi.ts          # POST/GET/DELETE /skripsi
      providers/
        types.ts            # interface LLMProvider, tipe Turn
        claude.ts           # ClaudeProvider (Anthropic SDK, cache_control)
        openrouter.ts       # OpenRouterProvider (fetch, OpenAI-compat)
        index.ts            # factory: baca settings.provider → pilih impl
    data/                   # (gitignored) file sqlite + uploads
    .env                    # (gitignored) ENCRYPTION_KEY
    .env.example            # template tanpa nilai rahasia
    package.json
  frontend/
    src/
      App.tsx
      api.ts                # wrapper fetch ke backend
      pages/
        SessionPage.tsx     # layar latihan (rekam, riwayat, TTS, reset)
        SettingsPage.tsx    # provider/model/apikey + attack points + upload skripsi
      hooks/
        useSpeechRecognition.ts
        useSpeechSynthesis.ts
      components/
        ConfirmModal.tsx    # konfirmasi reset sesi
    vite.config.ts          # proxy /api → backend saat dev
    package.json
  docs/superpowers/specs/...
  .gitignore
```

**Prinsip:** backend stateless per-request. Riwayat percakapan direkonstruksi dari SQLite tiap panggilan (Claude API tidak simpan memori antar-call).

---

## 3. Skema database (SQLite)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,          -- uuid/crypto.randomUUID
  created_at TEXT NOT NULL,
  label TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,           -- 'examiner' | 'user'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,         -- 'provider' | 'api_key' | 'model' | 'attack_points'
  value TEXT
);

-- baru (dari keputusan #1, #4)
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  full_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

- `PRAGMA foreign_keys = ON` di init supaya cascade delete jalan.
- **Dokumen aktif** = baris `documents` dengan `created_at` terbaru (atau `MAX(id)`). Re-upload = INSERT baris baru + (opsional) hapus baris lama supaya tabel tetap satu baris. Keputusan: hapus baris lama saat upload baru → tabel selalu ≤1 baris (single active doc). Sederhana, sesuai keputusan #4.
- `settings.attack_points` menyimpan poin serangan §9 (editable). Default di-seed saat init kalau kosong.
- `settings.api_key` menyimpan **ciphertext** (lihat §6), bukan plaintext.

---

## 4. Struktur request LLM & prompt caching (KOREKSI atas PRD §8)

PRD §8 menaruh semua (system + skripsi + history) dalam satu array. Anthropic API memisahkan `system` (array content blocks, boleh `cache_control`) dari `messages`. Struktur benar:

```ts
// ClaudeProvider.sendTurn(...)
messages.create({
  model,                                  // dari settings.model
  max_tokens: 1024,
  system: [
    { type: "text", text: PERSONA_TONE + ATTACK_POINTS,  cache_control: { type: "ephemeral" } },
    { type: "text", text: SKRIPSI_FULL_TEXT,             cache_control: { type: "ephemeral" } },
    // --- breakpoint cache berhenti di sini ---
  ],
  messages: [
    ...history.map(t => ({ role: t.role === "examiner" ? "assistant" : "user", content: t.content })),
    { role: "user", content: userInput }   // turn user terbaru
  ]
})
```

**Aturan keras (PRD §8):** riwayat turn TIDAK BOLEH masuk blok cached. History hidup di `messages`, uncached, berubah tiap turn.

**Verifikasi tiap panggilan:** log `response.usage.cache_read_input_tokens` dan `cache_creation_input_tokens`. Call pertama sesi → `cache_creation` > 0; call berikutnya → `cache_read` > 0. Kalau `cache_read` selalu 0, ada yang salah (biasanya blok cached ikut berubah).

**Detail API pasti (model id, param cache, min token cache, field usage) diverifikasi via skill `claude-api` saat fase implementasi, bukan dihafal.**

### 4.1 System prompt penguji (isi wajib, PRD §9)

`PERSONA_TONE` (statis, di kode) + `ATTACK_POINTS` (dari `settings.attack_points`, default = bullet §9):

- Persona: penguji sidang skripsi, Bahasa Indonesia, skeptis, minta bukti/data, tidak puas dengan jawaban permukaan.
- Attack points default:
  - Beck Hal.105/350/356 — referral dalam konteks medis
  - Beck Hal.121/134 — cap 2 masalah per sesi (rasional pacing + depth)
  - Klaim arsitektur multi-flow: migration `is_carryover` harus ada sebelum sidang
  - CB2-04 — journal context compliance 54.5%, tiga penjelasan teknis terverifikasi
  - NFR-04 — 0 istilah klinis di 469 respons, 18 sesi
- Instruksi output: satu pertanyaan/tanggapan penguji per turn, ringkas, menggali.

---

## 5. Endpoint backend

| Method | Path | Fungsi |
|---|---|---|
| POST | `/sessions` | buat sesi baru, return `{ session_id }` |
| GET | `/sessions/:id/turns` | ambil riwayat turn (render ulang frontend) |
| POST | `/sessions/:id/turn` | body `{ transcript }` → simpan user turn, panggil provider, simpan examiner turn, return `{ reply }` |
| DELETE | `/sessions/:id` | hapus sesi + turn-nya (cascade) |
| GET | `/settings` | return `{ provider, model, has_api_key: boolean, attack_points }` — **tidak pernah** api_key |
| POST | `/settings` | body `{ provider, api_key?, model, attack_points? }` → encrypt api_key, simpan |
| POST | `/skripsi` | multipart PDF → ekstrak teks (`unpdf`) → hapus doc lama, INSERT baru |
| GET | `/skripsi` | metadata `{ filename, char_count, uploaded_at }` (bukan full_text) |
| DELETE | `/skripsi` | hapus dokumen aktif |

Alur `POST /sessions/:id/turn`:
1. Ambil turns sesi (urut `turn_number`).
2. INSERT turn user baru (`turn_number = max+1`).
3. Ambil `settings` (provider, model, decrypt api_key) + `documents` aktif (full_text) + `attack_points`.
4. Factory pilih provider → `sendTurn(persona+attack, skripsi, history, transcript)`.
5. INSERT turn examiner (reply).
6. Return `{ reply }`.

**Guard:** kalau belum ada api_key → 400 "set API key di Settings". Kalau belum ada dokumen skripsi → 400 "upload skripsi dulu". Frontend tampilkan pesan ini, bukan crash.

---

## 6. Keamanan API key (PRD §5.6)

- `ENCRYPTION_KEY` = 32 byte random, di `backend/.env`, **wajib** gitignore. `.env.example` beri instruksi generate (`openssl rand -hex 32`).
- `POST /settings`: encrypt `api_key` dengan **AES-256-GCM** sebelum simpan. Format kolom: base64(`iv` ‖ `authTag` ‖ `ciphertext`) dalam satu string.
- Saat panggil provider: decrypt on-the-fly di memory. **Jangan pernah** log plaintext.
- `GET /settings`: tidak pernah kembalikan api_key (encrypted maupun plaintext) → cuma `has_api_key: boolean`.
- Dua lapis: enkripsi kolom **dan** file DB di `.gitignore`. Jalan bersamaan.

---

## 7. Abstraksi provider (PRD §5.3)

```ts
// providers/types.ts
export interface Turn { role: "examiner" | "user"; content: string; }
export interface LLMProvider {
  sendTurn(personaAttack: string, skripsi: string, history: Turn[], userInput: string): Promise<string>;
}
```

- `ClaudeProvider` — Anthropic SDK, `cache_control` §4. Caching aktif.
- `OpenRouterProvider` — endpoint OpenAI-compatible `chat.completions`. **Tidak** ada jaminan cache (PRD §5.5 caveat) — persona+skripsi+history digabung jadi `messages` biasa; bayar full context tiap turn. Log peringatan biaya sekali saat provider ini dipilih.
- `providers/index.ts` factory: baca `settings.provider` tiap request → return impl. Endpoint turn tidak berubah antar-provider.
- Model: Claude → dropdown (`claude-sonnet-5` default, `claude-haiku-4-5-20251001`, `claude-opus-4-8`). OpenRouter → input teks bebas.

---

## 8. Frontend (React + Vite)

- **SessionPage:** tombol rekam (toggle `SpeechRecognition`), transkrip live, kirim ke backend, render riwayat turn (bubble user/penguji), auto-`speechSynthesis` jawaban penguji, tombol "Reset Sesi" → `ConfirmModal` → `DELETE /sessions/:id` → buat sesi baru.
- **SettingsPage:** pilih provider (dropdown), model (dropdown/input tergantung provider), input api_key (write-only; tampil "key tersimpan: ya/tidak"), textarea attack points, upload skripsi (file input → `POST /skripsi`, tampil nama file + char count).
- **STT/TTS:** `hooks/useSpeechRecognition` (lang `id-ID`), `hooks/useSpeechSynthesis` (lang `id-ID`). Deteksi kalau browser tak dukung → tampil pesan (Chrome/Edge dukung; Firefox terbatas).
- Dev: Vite proxy `/api` → `http://localhost:PORT` backend. Prod lokal: build statis, serve dari Express (opsional v1; cukup dua proses saat dev).

---

## 9. Error handling

- Backend: try/catch tiap route, return `{ error: string }` + status code sesuai (400 guard, 500 provider gagal). Error provider (rate limit, key invalid) → pesan ramah ke frontend, jangan bocorkan stack/plaintext key.
- Frontend: tampil error inline (toast/banner), tombol rekam tidak nge-freeze kalau turn gagal — user bisa retry.
- STT gagal / browser tak dukung → fallback textarea manual (ketik jawaban) supaya tetap bisa latihan.

---

## 10. Testing

- **Backend unit:** `crypto.ts` (encrypt→decrypt roundtrip, tamper authTag → gagal), `prompt.ts` (susunan system blocks + mapping role history benar, history tidak masuk blok cached), factory provider.
- **Backend integration:** endpoint dengan SQLite in-memory — buat sesi → turn (provider di-mock) → cek turns tersimpan urut; delete cascade; settings encrypt/roundtrip; skripsi upload (PDF sample kecil) → char_count > 0, doc lama terhapus.
- **Provider:** `ClaudeProvider` dengan Anthropic SDK di-mock → assert `system` punya `cache_control` di dua blok, history di `messages`, bukan di system.
- **Frontend:** minimal — smoke test render SessionPage/SettingsPage; STT/TTS di-mock (Web Speech tak ada di jsdom).
- **Manual/e2e:** satu jalur nyata (upload PDF → set key → beberapa turn → cek log cache_read > 0 di call ke-2) diverifikasi lewat skill `verify` saat implementasi.

---

## 11. Estimasi biaya (PRD §10, tetap)

~$0.30–0.50 per sesi ~30 turn (Sonnet + caching). STT/TTS $0. OpenRouter = profil biaya beda (markup + kemungkinan tanpa cache).

---

## 12. Urutan implementasi (untuk writing-plans)

1. Scaffold repo (backend + frontend + tooling).
2. DB + migrations + crypto (dengan test).
3. Provider interface + ClaudeProvider (+ test cache structure).
4. Endpoints sessions/turns + settings (+ integration test).
5. Skripsi upload + unpdf (+ test).
6. OpenRouterProvider.
7. Frontend: Settings → Session → STT/TTS → reset modal.
8. Verifikasi e2e (cache hit, satu sesi nyata) via skill `verify`.
