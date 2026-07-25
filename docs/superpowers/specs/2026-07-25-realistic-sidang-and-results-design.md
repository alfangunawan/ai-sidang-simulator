# Sidang Realistis + Halaman Hasil — Design Spec

**Date:** 2026-07-25
**Status:** Approved, ready for planning

## Problem

Sesi latihan terasa terlalu singkat: penguji AI hanya mengajukan beberapa pertanyaan lalu menyatakan sidang selesai di dalam teks balasannya. Sidang skripsi nyata jauh lebih panjang, menelusuri banyak topik, dan diakhiri dengan penilaian.

Akar masalah: persona hanya menginstruksikan "satu pertanyaan per giliran, ringkas." Tidak ada agenda, target jumlah pertanyaan, konsep status sesi, maupun penilaian. Model cepat merasa cukup dan menutup sendiri di prosa balasan.

## Goals

1. Sidang panjang & realistis — banyak pertanyaan yang menelusuri fase-fase sidang nyata.
2. Halaman hasil di akhir sesi: skor penguji + feedback.
3. Penguji AI tidak menutup sepihak. Saat penguji merasa cukup, muncul modal konfirmasi ke user. Setuju → tampilkan hasil. Tidak setuju → sidang lanjut.
4. User juga bisa mengakhiri sidang manual kapan saja (tetap lewat modal konfirmasi).

## Decisions (locked)

- **Panjang & cakupan:** agenda berfase — penguji menelusuri fase sidang nyata secara berurutan.
- **Rubrik penilaian:** 4 dimensi + skor akhir 0–100 + huruf + status kelulusan.
- **Kontrol tutup:** usulan AI + konfirmasi user, plus tombol "Akhiri Sidang" manual.
- **Sinyal tutup:** penanda tersembunyi di balasan + batas (floor/cooldown) sisi server. Netral terhadap provider (Claude & OpenRouter), state minim.

## Constants (config)

- `SIDANG_PHASES` (berurutan): Pembukaan → Latar Belakang & Rumusan Masalah → Tinjauan Pustaka → Metodologi → Hasil & Pembahasan → Kesimpulan & Kontribusi → Penutup. (Pembukaan & Penutup ringan.)
- `MIN_QUESTIONS = 10` — lantai jumlah giliran penguji sebelum usulan tutup dihormati.
- `CLOSE_COOLDOWN = 3` — jumlah giliran penguji yang menahan usulan tutup setelah user menolak.
- `CLOSE_MARKER = "[[CUKUP]]"` — penanda yang ditempel model saat puas; di-strip server sebelum dikirim ke UI.

## Architecture

### Backend

**DB migrasi (idempotent, kolom baru pada `sessions`):**

| kolom | tipe | keterangan |
|---|---|---|
| `status` | TEXT NOT NULL DEFAULT 'active' | `'active'` \| `'closed'` |
| `closed_at` | TEXT | ISO timestamp saat ditutup |
| `assessment` | TEXT | JSON hasil penilaian |
| `close_declined_turn` | INTEGER | jumlah giliran penguji saat user terakhir menolak (untuk cooldown) |

Migrasi harus idempotent (DB lama sudah ada): cek `pragma table_info(sessions)` lalu `ALTER TABLE ... ADD COLUMN` hanya untuk kolom yang belum ada.

**`persona.ts`:**
- Tambah `SIDANG_PHASES` dan `buildAgendaRules()`.
- `buildPersona()` menyisipkan aturan agenda ke system text. Instruksi kunci:
  - Satu pertanyaan per giliran.
  - Telusuri fase secara berurutan; minimal ~2 pertanyaan menggali per fase inti.
  - Kejar jawaban yang dangkal / menghindar sebelum pindah fase.
  - **Jangan pernah menyatakan sidang selesai dalam prosa.**
  - Saat benar-benar puas (semua fase termasuk Penutup terlewati), tempel `[[CUKUP]]` di baris terakhir balasan — dan hanya saat itu.

**`assessment.ts` (baru):**
- Tipe `Assessment`:
  ```ts
  interface Assessment {
    scores: {
      penguasaan_materi: number;   // 0-100
      metodologi: number;          // 0-100
      kualitas_orisinalitas: number; // 0-100
      argumentasi: number;         // 0-100
    };
    final_score: number;           // 0-100
    grade: string;                 // A | B | C | D
    verdict: string;               // Lulus | Lulus dengan revisi | Tidak lulus
    ringkasan: string;
    kelebihan: string[];
    kekurangan: string[];
    saran: string[];
  }
  ```
- `buildAssessmentSystem(persona)` + `buildAssessmentUser(skripsi, transcript)` — prompt yang meminta model mengeluarkan **hanya JSON** sesuai skema.
- `parseAssessment(text): Assessment` — parse defensif:
  - Toleran terhadap code fence (```json ... ```).
  - Validasi bentuk; clamp semua skor ke 0–100.
  - Turunkan `grade` dari `final_score` bila hilang/invalid: A ≥ 85, B 70–84, C 55–69, D < 55.
  - Petakan/validasi `verdict`.
  - Lempar error bila JSON tak dapat di-parse (dipakai untuk retry di route).

**`providers` (interface + Claude + OpenRouter):**
- Tambah primitif `generate(system: string, user: string, maxTokens: number): Promise<{ text: string; usage?: Usage }>`.
- Claude: `messages.create` dengan satu system + satu user, `max_tokens` ~1024.
- OpenRouter: chat completion setara.
- `sendTurn()` tetap seperti sekarang.

**Route `POST /sessions/:id/turn`:**
- Tolak bila `status='closed'` → 409.
- Setelah balasan LLM: `hasMarker = reply.includes(CLOSE_MARKER)`; strip marker → reply bersih disimpan & dikirim.
- Hitung jumlah giliran penguji setelah menambah giliran ini.
- `propose_close = hasMarker && examinerCount >= MIN_QUESTIONS && examinerCount >= (close_declined_turn ?? 0) + CLOSE_COOLDOWN`.
- Balas `{ reply, propose_close }`.

**Route `POST /sessions/:id/continue` (baru):**
- Set `close_declined_turn` = jumlah giliran penguji saat ini. Balas `{ ok: true }`.
- Dipanggil saat user menolak modal usulan-tutup dari AI.

**Route `POST /sessions/:id/close` (baru):**
- Idempotent: bila sudah `closed` dan punya assessment → balas assessment yang ada.
- Bangun prompt penilaian dari persona dasar + skripsi + transkrip penuh; panggil `provider.generate(...)`.
- `parseAssessment`; bila gagal → retry sekali; bila tetap gagal → 500 "Gagal menilai, coba lagi" dan **jangan** set status closed (agar bisa retry).
- Bila sukses: set `status='closed'`, `closed_at`, simpan `assessment` JSON, balas assessment.

**Route `GET /sessions/:id/result` (baru):**
- Balas `{ status, assessment }` untuk halaman hasil & Riwayat.

### Frontend

- **types.ts / api.ts:** tambah `Assessment`; `postTurn` mengembalikan `{ reply, propose_close }`; tambah `continueSession(id)`, `closeSession(id)`, `getResult(id)`; `SessionSummary.status`.
- **ConfirmModal.tsx:** generalisasi label — prop opsional `confirmLabel` & `cancelLabel` (default seperti sekarang agar pemakaian hapus di Riwayat tetap jalan).
- **SessionPage.tsx:**
  - State modal tutup + sumber usulan (AI vs manual).
  - Setelah `postTurn`, jika `propose_close` → buka modal: "Penguji merasa sidang sudah cukup. Akhiri sidang & lihat hasil?" dengan `[Lanjut bertanya]` / `[Akhiri & lihat hasil]`.
  - Tombol **Akhiri Sidang** (manual) → modal sama.
  - Konfirmasi → `closeSession(id)` → pindah ke halaman hasil (via callback ke App).
  - Tolak usulan AI → `continueSession(id)` → tutup modal, lanjut. (Batal pada modal manual cukup tutup modal, tanpa `continue`.)
  - Blokir kirim saat sesi closed.
- **ResultPage.tsx (baru):** skor akhir besar + huruf + badge verdict berwarna (Lulus / Lulus dengan revisi / Tidak lulus); 4 bar dimensi 0–100; Ringkasan; daftar Kelebihan / Kekurangan / Saran; tombol Sesi Baru & kembali ke Riwayat.
- **App.tsx:** tambah view `result` + `activeResultSessionId`. SessionPage dapat prop `onClosed(id)`; HistoryPage dapat prop `onOpenResult(id)`.
- **HistoryPage.tsx:** badge status + skor akhir + tombol **Lihat Hasil** untuk sesi closed.

## Data flow

1. Tiap turn: FE → `POST /turn` → `{ reply, propose_close }`. Bila `propose_close` → modal.
2. Konfirmasi → `POST /close` → assessment JSON → simpan → tampilkan ResultPage.
3. Tolak → `POST /continue` → set cooldown → sidang lanjut.
4. Manual "Akhiri Sidang" → modal → konfirmasi → `POST /close`.
5. Riwayat → `GET /result` → ResultPage.

## Error handling

- Assessment JSON gagal di-parse → retry sekali → 500 "Gagal menilai, coba lagi"; sesi tetap `active` agar dapat diulang.
- Turn pada sesi closed → 409.
- Error provider pada `generate()` → 500, mengikuti pola penanganan error yang sudah ada (tidak membocorkan internal/key).

## Testing

**Backend:**
- Teks agenda pada `buildPersona`.
- Strip marker + logika `propose_close` (floor & cooldown).
- `parseAssessment`: JSON valid, code-fenced, rusak→retry, clamping skor, penurunan huruf.
- `close`: set status + simpan assessment; idempotent.
- Turn ditolak saat sesi closed (409).
- `continue`: set `close_declined_turn`.

**Frontend:**
- SessionPage memunculkan modal saat `propose_close`.
- Tolak → memanggil `continue` & sidang lanjut.
- Konfirmasi → memanggil `close` & menampilkan hasil.
- ResultPage merender skor/verdict/bar.
- HistoryPage menampilkan "Lihat Hasil" untuk sesi closed.

## Out of scope (YAGNI)

Progress-bar fase, bobot rubrik yang dapat diedit, export PDF hasil. Export CSV transkrip yang sudah ada tetap dipertahankan.
