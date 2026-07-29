# PRD — Arsitektur Konteks Efisien (Dossier + Retrieval) untuk SiBiru

**Tanggal:** 2026-07-29
**Status:** Draft, siap ditinjau lalu diturunkan ke implementation plan
**Menggantikan:** keputusan brainstorming #2 pada `2026-07-24-sibiru-sidang-simulator-design.md` ("full text skripsi masuk ke cached system block, tanpa chunking/RAG")

---

## 0. Ringkasan eksekutif

Kirim naskah skripsi utuh (~145k token) di setiap giliran diganti dengan **dossier terstruktur** (~3k token, dibangun sekali per dokumen) plus **kutipan verbatim hasil retrieval** (~2k token, dipilih per giliran).

Input per giliran turun dari ~94–150k menjadi ~12k token. Ini bukan proyek penghematan biaya — biaya sekarang sudah rendah karena model yang dipakai murah. **Tujuan sebenarnya: membuat arsitektur cukup efisien sehingga model yang lebih kuat (GLM 5.2) menjadi terjangkau**, karena model murah diduga tidak sanggup menjalankan aturan penguji secara konsisten lintas 15+ giliran.

---

## 1. Masalah

### 1.1 Bukti terukur

`routes/sessions.ts` mengirim `doc.full_text` ke `provider.sendTurn()` di setiap giliran. `providers/openrouter.ts` menggabungnya jadi satu system message: `` `${personaAttack}\n\n${skripsi}` ``.

Skripsi acuan: 332.670 karakter ≈ 145k token (rasio Indonesia ~2,3 char/token).

Pengukuran dari tabel `usage` aplikasi (model murah via OpenRouter):

| Panggilan | Input (setelah cache) | Dari cache | Total prompt | Rasio cache |
|---|---|---|---|---|
| 2 | 183.738 | 64 | 183.802 | 0,03% |
| 4 | 277.573 | 93.504 | 371.077 | 25% |
| 11 | 657.929 | 376.896 | 1.034.825 | 36% |

~94k token prompt per giliran, output ~126 token. Rasio ~750:1.

### 1.2 Perilaku cache

Cache bersifat biner: kena penuh (~94k) atau meleset total. Sekitar **4 dari 10** panggilan yang kena. Dua penyebab, keduanya terkonfirmasi riset:

- **TTL 5 menit habis.** Aplikasi ini berbasis suara — mahasiswa mendengarkan, berpikir, merekam jawaban lisan. Jeda >5 menit adalah perilaku normal, bahkan diinginkan agar simulasi realistis.
- **Routing OpenRouter berpindah penyedia.** Cache bersifat per-penyedia.

### 1.3 Mengapa caching saja tidak cukup

Batas atas caching sempurna ≈ 3× lebih murah. Dossier ≈ 12× lebih murah, dan tidak bergantung pada seberapa cepat mahasiswa menjawab. Untuk aplikasi latihan di mana satu skripsi dipakai berkali-kali, dossier menang telak karena biaya bangunnya teramortisasi.

### 1.4 Konteks panjang kemungkinan menurunkan kualitas

Riset "Context Rot" (Chroma, Juli 2025, 18 model frontier) menunjukkan performa menurun monoton seiring panjang input, dengan penurunan tercuram justru di rentang 100.000–500.000 token. "Lost in the Middle" (Liu et al., TACL 2024) menegaskan degradasi saat informasi relevan berada di tengah konteks.

**Implikasi:** perubahan ini berpotensi menaikkan kualitas penguji, bukan sekadar menurunkan biaya. Tapi ini hipotesis yang harus diukur (§9), bukan diasumsikan.

---

## 2. Tujuan

1. Input per giliran turun ke **≤15k token** (target ~12k).
2. Kemampuan penguji tidak turun — diukur, bukan diasumsikan (§9).
3. Membuka jalan ke GLM 5.2 sebagai model penguji default dengan biaya ≤$0,20/sesi.
4. Menghilangkan `attack_points` kosong: poin serangan dibangkitkan otomatis dari pembacaan naskah penuh.

### Non-tujuan

- Bukan proyek penghematan biaya semata.
- Tidak menambah dependency berat (LangChain, LlamaIndex, vector DB).
- Tidak mengubah alur UI sidang, agenda fase, `CLOSE_MARKER`, atau skema `Assessment`.

---

## 3. Keputusan (terkunci)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Dossier JSON berskema, bukan prosa bebas | Bisa divalidasi seperti `parseAssessment`, bisa dirender & diedit user |
| 2 | Retrieval **BM25 + stemming Sastrawi**, bukan term-frequency mentah | Imbuhan Indonesia (meN-, di-, -kan, pe-an) membuat TF mentah gagal mencocokkan "menggunakan" dengan "guna" |
| 3 | Tanpa embedding, tanpa vector DB | ~200 chunk; brute-force cukup. Embedding lokal menambah latensi — buruk untuk aplikasi suara |
| 4 | Kutipan retrieval masuk **pesan user**, bukan system block | Menjaga prefix system stabil; kalau masuk system, cache mati tiap giliran |
| 5 | Pertanyaan global/agregatif ditangani **precomputed structural facts** di dossier | GraphRAG/RAPTOR berlebihan untuk satu dokumen |
| 6 | Dossier dibangun dengan model **terkuat** yang terjangkau | Sekali per dokumen, teramortisasi; kualitasnya menentukan semua sesi berikutnya |
| 7 | Dossier **bisa dilihat & diedit user** | Satu-satunya jalan perbaikan bila dossier meleset |
| 8 | Caching **ditunda** ke Tahap 7 (§11) | Setelah dossier, prefix stabil tinggal ~5–8k; hemat marginal |
| 9 | `reasoning effort` tetap penuh untuk turn | Hemat 1,5%, korbannya eksekusi 8 butir `PROBING_RULES` |

---

## 4. Arsitektur

### 4.1 Migrasi DB (idempotent, pola `addColumnIfMissing` yang sudah ada)

```sql
-- kolom baru pada documents
ALTER TABLE documents ADD COLUMN dossier TEXT;            -- JSON, NULL sebelum dibangun
ALTER TABLE documents ADD COLUMN dossier_status TEXT;     -- 'pending'|'ready'|'failed'
ALTER TABLE documents ADD COLUMN dossier_error TEXT;      -- pesan gagal, untuk UI
ALTER TABLE documents ADD COLUMN dossier_version INTEGER; -- naikkan bila skema/prompt berubah
ALTER TABLE documents ADD COLUMN dossier_model TEXT;      -- model yang membangun, untuk audit

-- tabel baru
CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  idx         INTEGER NOT NULL,   -- urutan dalam dokumen
  page        INTEGER,            -- nomor halaman PDF (1-based), NULL bila tak terdeteksi
  heading     TEXT,               -- bab/subbab terdekat di atas chunk
  text        TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id, idx);
```

`documents.full_text` **tetap disimpan** — dibutuhkan untuk membangun ulang dossier/chunk bila skema berubah, tanpa minta user upload lagi.

### 4.2 File baru

```
backend/src/dossier.ts     — skema, prompt pembangun, parser + validator
backend/src/chunker.ts     — pecah full_text per halaman → chunk berstruktur
backend/src/retrieval.ts   — BM25 + stopword/stemmer Indonesia, ambil top-K
backend/src/repos/chunks.ts — simpan/ambil chunk per dokumen
```

### 4.3 File yang berubah

| File | Perubahan |
|---|---|
| `routes/skripsi.ts` | `mergePages: false`; bangun chunk; picu pembangunan dossier |
| `repos/documents.ts` | getter/setter dossier + status |
| `providers/types.ts` | ubah kontrak `sendTurn` |
| `providers/claude.ts` | susun blok system baru + breakpoint cache |
| `providers/openrouter.ts` | susun system message baru |
| `routes/sessions.ts` | pakai dossier + retrieval, bukan `full_text` |
| `assessment.ts` | `buildAssessmentUser` terima dossier, bukan `full_text` |
| `persona.ts`, `questionBank.ts` | bank pertanyaan per-fase, modul kritik bersyarat (Tahap 2) |
| `prompt.ts` | helper penyusun konteks + pemangkas history |

---

## 5. Dossier

### 5.1 Ekstraksi per halaman

`routes/skripsi.ts` saat ini memakai `extractText(pdf, { mergePages: true })` — batas halaman hilang sebelum masuk DB, sehingga peta halaman mustahil dibuat. Ganti:

```ts
const { text } = await extractText(pdf, { mergePages: false }); // string[]
const fullText = text.join("\n\n");   // tetap disimpan di documents.full_text
// text[i] = isi halaman ke-(i+1) → dipakai chunker untuk metadata page
```

Catatan: unpdf memakai PDF.js v5 yang membutuhkan `Promise.withResolvers` (Node ≥22 — sudah terpenuhi).

### 5.2 Skema dossier (JSON)

```ts
interface Dossier {
  judul: string;
  rumusan_masalah: string[];        // VERBATIM, jangan parafrase
  tujuan: string[];
  batasan: string[];
  metode: { nama: string; justifikasi: string };
  instrumen: string[];
  populasi_sampel: { deskripsi: string; jumlah: number | null };
  hasil_kunci: { klaim: string; angka: string; sumber: string }[];  // sumber: "Tabel 4.3" / "hlm. 62"
  kesimpulan: string[];             // VERBATIM
  keterbatasan: string[];
  peta_bab: { judul: string; halaman_mulai: number | null }[];
  fakta_struktural: {
    jumlah_rumusan_masalah: number;
    jumlah_kesimpulan: number;
    rumusan_tanpa_kesimpulan: string[];   // RM yang tidak terjawab di kesimpulan
    sitasi_bab2_tidak_di_daftar_pustaka: string[];
    jumlah_tabel: number;
    jumlah_gambar: number;
  };
  modul_kritik_terpicu: string[];   // "sistem" | "kuesioner" | "ai" | "domain_sensitif"
  poin_serangan: string[];          // inkonsistensi yang ditemukan model saat baca naskah penuh
}
```

**Aturan keras:** `rumusan_masalah`, `kesimpulan`, dan setiap `hasil_kunci.angka` harus kutipan persis dari naskah. Parafrase merusak kemampuan penguji menuntut bukti kata-per-kata (`PROBING_RULES` butir 2 & 3).

`fakta_struktural` adalah jawaban murah untuk pertanyaan agregatif yang tidak bisa dijawab retrieval — misalnya "apakah jumlah poin rumusan masalah sama dengan jumlah poin kesimpulan?" dan "apakah semua referensi Bab 2 ada di Daftar Pustaka?" (keduanya ada di `QUESTION_BANK`).

`modul_kritik_terpicu` menentukan modul mana dari `CRITIQUE_MODULES` yang dikirim (Tahap 2).

### 5.3 Pembangunan

- Dipicu setelah `POST /skripsi` berhasil. **Asinkron** — jangan blokir respons upload.
- `dossier_status`: `pending` → `ready` | `failed`.
- Model: pakai model terkuat yang tersedia di settings user. Biaya ~$0,11 sekali (GLM 5.2), teramortisasi ~$0,02/sesi bila skripsi dipakai 5 kali.
- `max_tokens` generous (≥8000, ikuti pelajaran `ASSESSMENT_MAX_TOKENS`), **deteksi `truncated`** seperti jalur assessment.
- Validasi & parse defensif seperti `parseAssessment`: toleran code fence, validasi bentuk, lempar error bila tak terparse.
- Retry sekali bila JSON rusak. **Jangan** retry bila `truncated` — deterministik, akan gagal sama.

### 5.4 Kegagalan

`dossier_status = 'failed'` → `POST /sessions/:id/turn` mengembalikan **400** dengan pesan "Dossier skripsi gagal dibuat. Buka Pengaturan untuk membangun ulang atau mengisi manual." Jangan jatuh kembali ke `full_text` diam-diam — itu menyembunyikan kegagalan dan mengembalikan biaya lama tanpa user tahu.

---

## 6. Retrieval

### 6.1 Chunking

- Basis: array halaman dari §5.1.
- Deteksi heading (`BAB [IVX]+`, `\d+\.\d+`) untuk mengisi `chunks.heading`; potong di batas heading bila ada.
- Ukuran target ~1200 karakter, overlap ~150 karakter, jangan memotong di tengah kalimat.
- **Buang** daftar pustaka, lampiran, kata pengantar, daftar isi. Alasannya bukan hemat token (chunk tidak dikirim semua) melainkan **kualitas retrieval** — daftar pustaka padat kata kunci dan akan mendominasi skor.
- **JANGAN buang listing kode.** Arketipe penguji `teknis` di `EXAMINER_TYPES` justru menggali arsitektur dan alur data; listing kode adalah bahannya.

### 6.2 Skoring

```ts
retrieve(documentId, query, k = 3): Chunk[]
```

- Query = pertanyaan penguji terakhir + jawaban mahasiswa terbaru.
- Normalisasi: lowercase → buang stopword Indonesia → stemming Sastrawi (`ts-sastrawi` atau `sastrawijs`).
- Skor **BM25** (k1≈1,5, b≈0,75) atas ~200 chunk, brute-force di memori. Ini bukan optimasi prematur — 200 chunk selesai dalam mikrodetik.
- Kembalikan top-3 beserta `page` dan `heading` supaya penguji bisa menyebut lokasi.

### 6.3 Format sisipan

Kutipan ditempel ke pesan user, setelah `withNonAnswerNudge(transcript)`:

```
[jawaban mahasiswa]

---
KUTIPAN NASKAH YANG RELEVAN (rujukan Anda, bukan ucapan mahasiswa):
[Bab 3 Metodologi, hlm. 41] ...isi chunk...
[Bab 4 Hasil, hlm. 58] ...isi chunk...
```

Label "bukan ucapan mahasiswa" wajib — tanpa itu model berisiko memperlakukan kutipan sebagai jawaban dan melanggar `DIALOGUE_RULES`.

---

## 7. Susunan prompt

Prinsip: **stabil di depan, berubah di belakang.**

```
system blok 1 : persona inti (PERSONA_TONE, tone, arketipe, PROBING/DIALOGUE/
                ESCALATION_RULES, agenda) + dossier
                ← tidak pernah berubah dalam satu sesi
                ← [breakpoint cache_control di sini]
system blok 2 : bank pertanyaan fase aktif + modul kritik terpicu   (Tahap 2)
                ← berubah ~6× per sesi, ~800 token
messages      : history (dipangkas)
                nudge + jawaban mahasiswa + kutipan retrieval
                ← berubah tiap giliran
```

Bila blok fase ditaruh sebelum dossier, tiap pergantian fase membatalkan cache seluruh prefix. Bila kutipan ditaruh di system, cache mati setiap giliran. Urutan ini bukan estetika — 376k token cache yang terukur bergantung padanya.

### 7.1 Perubahan kontrak provider

```ts
// providers/types.ts
export interface TurnContext {
  persona: string;      // system blok 1, bagian statis
  dossier: string;      // system blok 1, lanjutan statis
  phaseBlock?: string;  // system blok 2 (Tahap 2; kosong di Tahap 1)
  history: Turn[];
  userInput: string;    // sudah termasuk nudge + kutipan
}

export interface LLMProvider {
  sendTurn(ctx: TurnContext): Promise<LLMResult>;
  generate(system: string, user: string, maxTokens: number): Promise<GenerateResult>;
  checkAuth(): Promise<void>;
}
```

`ClaudeProvider`: blok 1 dan 2 sebagai dua elemen array `system`, `cache_control` di akhir blok 1.
`OpenRouterProvider`: gabung blok 1 + blok 2 jadi satu system message dengan urutan di atas.

**Test yang akan pecah:** `test/routes.sessions.turn.test.ts` meng-assert `expect(sent[1]).toBe("Skor SUS saya 78 dari 20 responden.")`. Ubah ke `toContain`. `test/providers.openrouter.test.ts` meng-assert `content: "PERSONA\n\nSKRIPSI"` — sesuaikan.

### 7.2 Pemangkasan history

- 6 giliran terakhir utuh.
- Lebih lama: pertanyaan penguji **utuh** (persona melarang mengulang pertanyaan), jawaban mahasiswa dipotong ~200 karakter + "…".
- Transkrip penuh untuk penilaian tetap diambil dari SQLite via `formatTranscript`, tidak terpengaruh.

---

## 8. Assessment

`buildAssessmentUser(skripsi, transcript)` menerima dossier, bukan `full_text`. Tambahkan chunk yang paling sering ter-retrieve selama sesi (maks 5) supaya penilaian `kualitas_orisinalitas` tidak hanya bersandar ringkasan.

Skema `Assessment`, `deriveGrade`, `deriveVerdict`, `parseAssessment`, `ASSESSMENT_MAX_TOKENS` — **tidak berubah**.

---

## 9. Kriteria terima

Wajib diukur sebelum dan sesudah, dengan PDF yang sama dan 10 jawaban skrip identik.

| Metrik | Cara ukur | Ambang |
|---|---|---|
| Input token/giliran | tabel `usage`, `input_tokens + cache_read_tokens` ÷ panggilan | ≤15.000 |
| Biaya/sesi GLM 5.2 | `cost_usd` dari OpenRouter | ≤$0,20 |
| **Grounding** | % pertanyaan penguji yang menyebut bab, halaman, tabel, atau angka nyata dari naskah | **≥ baseline** |
| Konfrontasi | jumlah pertanyaan bertipe "di Bab X tertulis…, tapi Anda bilang…" | ≥ baseline |
| Assessment | `parseAssessment` berhasil, skor wajar | tidak regresi |
| Dossier | tinjau manual 3 dossier pertama | kutipan verbatim akurat |

Baris **Grounding** adalah gerbangnya. Kalau turun, retrieval-nya yang salah (biasanya stopword/stemmer atau ukuran chunk) — perbaiki dulu, jangan lanjut.

---

## 10. Frontend

- **SettingsPage:** panel Dossier — status (`pending`/`ready`/`failed`), tombol "Bangun Ulang", editor JSON atau form per-bagian. Textarea `attack_points` yang sekarang kosong digantikan bagian `poin_serangan` dari dossier.
- **Upload:** indikator "Menganalisis skripsi…" saat `dossier_status = 'pending'`; blokir mulai sidang sampai `ready`.
- `types.ts`: tambah `Dossier`, `SkripsiInfo.dossier_status`.

---

## 11. Urutan implementasi

| Tahap | Isi | Alasan urutan |
|---|---|---|
| 0 | ~~Ukur `buildPersona(...).length`; catat baseline grounding & token~~ **SELESAI — hasil di §15** | Kalau persona ternyata 8k, prioritas berubah. Lima menit |
| 1 | `mergePages: false` + `chunker.ts` + tabel `chunks` | Prasyarat; tanpa ini nomor halaman mustahil |
| 2 | `dossier.ts` + `retrieval.ts` + ubah kontrak provider + `routes/sessions.ts` | **Satu tahap, jangan dipisah.** Dossier tanpa retrieval melumpuhkan `PROBING_RULES` butir 2 & 3 |
| 3 | UI dossier di SettingsPage | Jalan perbaikan bila dossier meleset |
| 4 | Assessment pakai dossier | Rendah risiko |
| 5 | Bank pertanyaan per-fase + modul kritik bersyarat | Hemat ~2,5k token + naikkan kepatuhan aturan |
| 6 | Pemangkasan history | Hasil terkecil |
| 7 | Caching: `session_id` OpenRouter, `ttl: "1h"` Claude | Marginal setelah dossier |

Ukur ulang §9 setelah Tahap 2 dan setelah Tahap 5.

---

## 12. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dossier meleset/halusinasi | Kualitas semua sesi dokumen itu runtuh, diam-diam & permanen | Validasi skema, deteksi truncated, UI edit (Tahap 3), tinjau manual 3 pertama |
| Retrieval meleset | Penguji kehilangan kemampuan konfrontasi | Metrik grounding §9 sebagai gerbang; stopword+stemmer wajib |
| Pertanyaan agregatif tak terjawab | Serangan paling mematikan hilang | `fakta_struktural` di dossier |
| Kutipan salah tempat (masuk system) | Cache mati total, biaya naik | Test yang meng-assert kutipan ada di `messages`, bukan `system` |
| GLM 5.2 ternyata tidak lebih baik untuk Indonesia | Upgrade sia-sia | Uji A/B pada 10 giliran sebelum jadikan default |
| Regresi test suite | CI merah | Daftar test yang pecah sudah diidentifikasi di §7.1 |

---

## 13. Di luar lingkup (YAGNI)

Embedding & vector DB, GraphRAG/RAPTOR, LangChain/LlamaIndex, keep-alive ping cache, multi-dokumen per user, dossier lintas-bahasa, penurunan `reasoning effort`.

---

## 14. Catatan angka

Semua estimasi biaya adalah **perkiraan** dengan asumsi ~12k token/giliran dan harga GLM 5.2 di OpenRouter ($0,70/M input, $2,20/M output) per Juli 2026. Harga dan TTL cache berubah cepat — verifikasi ulang dari field `usage` nyata setelah implementasi, jangan percaya tabel ini sebagai fakta permanen.

TTL dan minimum prefix cache Z.AI/GLM **tidak dipublikasikan resmi**; jangan mengimpor angka Anthropic. Verifikasi lewat `prompt_tokens_details.cached_tokens` pada respons.

---

## 15. Hasil Tahap 0 (2026-07-29)

Rasio konversi yang dipakai: **2,3 char/token**, diturunkan dari `usage_events` nyata (332.670 char → 147k token prompt dikurangi persona).

### 15.1 Persona jauh lebih besar dari dugaan

`buildPersona("standar", "", "umum")` = **10.866 char ≈ 4.724 token** — bukan ~1,4k seperti perkiraan awal. Di bawah ambang 8k yang akan mengubah prioritas, jadi urutan §11 tetap berlaku.

| Blok | char | token |
|---|---|---|
| `PERSONA_TONE` | 715 | 311 |
| tone mode (`standar`) | 90 | 39 |
| focus tipe (`umum`) | 205 | 89 |
| `PROBING_RULES` | 1.272 | 553 |
| `DIALOGUE_RULES` | 1.238 | 538 |
| `ESCALATION_RULES` | 557 | 242 |
| **bank pertanyaan (tanpa modul)** | **3.438** | **1.495** |
| **`CRITIQUE_MODULES`** | **1.730** | **752** |
| `EXAMINER_PHRASES` | 383 | 167 |
| `buildAgendaRules()` | 1.222 | 531 |
| **total** | **10.866** | **4.724** |
| `buildAssessmentSystem()` | 1.590 | 691 |

**Temuan yang mengubah rencana:** bank pertanyaan + modul kritik = **2.247 token, 48% dari persona**, dan keduanya dikirim utuh setiap giliran meski hanya satu fase yang aktif dan hanya sebagian modul yang terpicu. Itu persis sasaran Tahap 5.

Konsekuensi: **Tahap 5 bukan opsional.** §11 menempatkannya di urutan kelima dengan alasan "hemat ~2,5k token" — angka itu terkonfirmasi (2.247), tapi bobotnya lebih besar dari yang tersirat karena persona ternyata memakan ~40% anggaran 12k.

### 15.2 Anggaran token per giliran, angka nyata

| Komponen | Setelah Tahap 2 | Setelah Tahap 5 |
|---|---|---|
| persona | 4.724 | ~2.900 |
| dossier | ~3.000 | ~3.000 |
| kutipan retrieval (3 × 1.200 char) | ~1.565 | ~1.565 |
| history dipangkas (§7.2) | ~1.500 | ~1.500 |
| **total** | **~10.800** | **~9.000** |

Target ≤15k dan sasaran ~12k terpenuhi di kedua kolom. Slack tipis: kalau dossier meleset ke 5k, Tahap 2 mendarat di ~12,8k — masih lolos ambang, tapi tanpa ruang untuk history yang panjang. **Batasi dossier ≤3.500 token saat menulis prompt pembangunnya.**

### 15.3 Baseline grounding

Diukur dengan `backend/scripts/grounding.ts` atas giliran penguji yang sudah tersimpan di SQLite (arsitektur full-text lama).

| | sesi acuan `96d30908` | semua sesi |
|---|---|---|
| giliran penguji | 11 | 17 |
| menyebut lokasi (bab/hlm/tabel/gambar) | 5 | 8 |
| menyebut angka naskah | 8 | 9 |
| **tertambat (gabungan)** | **9 — 81,8%** | **13 — 76,5%** |
| konfrontasi bertambat | 2 — 18,2% | 4 — 23,5% |

**Gerbang §9: grounding sesudah harus ≥ 81,8%** pada sesi acuan. Ini bar yang tinggi — konteks full-text memang menambatkan dengan baik, dan itulah yang harus disamai, bukan dilampaui.

Satu keputusan pengukuran yang penting: **tuntutan generik seperti "di halaman berapa?" tidak dihitung tertambat.** Kalimat itu bisa diucapkan model yang tidak membaca naskah sama sekali; hanya rujukan konkret ("Tabel IV-1 pada halaman 62") yang dihitung. Tanpa pembedaan ini, model buta konteks mendapat skor sama dan gerbangnya jadi tidak berarti. Self-check di skrip mengunci perilaku ini.

Sampel 11 giliran itu kecil. Sebelum Tahap 2, jalankan satu sesi baseline penuh (15 giliran, jawaban skrip) supaya perbandingan sesudah punya dasar yang layak.

---

## 16. Hasil Tahap 1 (2026-07-29)

Terkirim: `src/chunker.ts`, `src/repos/chunks.ts`, tabel `chunks` di `db.ts`, `routes/skripsi.ts` dengan `mergePages: false`, `test/chunker.test.ts` (12 kasus). Suite penuh 201 lulus.

### 16.1 `mergePages: true` menghapus seluruh struktur baris

Diverifikasi langsung pada PDF yang sama:

```
mergePages: true   -> 24.513 char,   0 newline
mergePages: false  -> 24.519 char, 884 newline
```

unpdf meratakan setiap line break jadi spasi ketika halaman digabung. Jadi bukan hanya nomor halaman yang hilang di jalur lama (§5.1 sudah menduga itu) — **judul bab dan subbab ikut hilang**, karena keduanya hanya dikenali sebagai baris pendek yang berdiri sendiri.

### 16.2 Premis §4.1 batal untuk dokumen lama

§4.1 menyatakan `documents.full_text` disimpan supaya chunk/dossier bisa dibangun ulang "tanpa minta user upload lagi". Untuk dokumen yang diunggah **sebelum** Tahap 1, premis itu **tidak berlaku**: `full_text` mereka sudah kehilangan newline secara permanen. Dibuktikan pada tiga dokumen nyata di DB — 302.447 / 246.121 / 344.182 karakter, masing-masing **satu baris**, nol kecocokan `BAB`/`DAFTAR PUSTAKA`/subbab.

Konsekuensi: **tiga dokumen yang ada harus diunggah ulang.** Tidak ada kode backfill — dokumen lama juga belum punya dossier, jadi gerbang `dossier_status` di Tahap 2 sudah memaksa unggah ulang. Menambah backfill hanya akan menghasilkan chunk tanpa judul, yang lebih buruk daripada tidak ada.

Mulai Tahap 1 premis §4.1 kembali berlaku: rute menyimpan `pages.join("\n\n")`, sehingga struktur baris ikut tersimpan di `full_text` dan pembangunan ulang tetap mungkin.

### 16.3 Hasil pada PDF nyata (7 halaman, dua kolom)

```
7 halaman -> 26 chunk
retensi 112%          (>100% wajar: overlap 150 char diulang)
chunk ber-heading     23/26
halaman terwakili     7/7
panjang min/med/max   288 / 1.165 / 1.200
```

### 16.4 Regex subbab menuntut huruf besar

Jalannya chunker pada PDF nyata memunculkan dua judul palsu — `"0.13 inches afterward."` dan `"0.4 inches below the final address…"` — baris pendek yang kebetulan diawali angka desimal dan lolos `/^\d+\.\d+[\s.]/`.

Ini bukan cacat kosmetik. Chunk yang dilabeli lokasi salah membuat penguji menyebut bagian yang keliru, dan itu merusak metrik yang justru jadi gerbang §9.

Pola dikeraskan jadi `/^\d+\.\d+(\.\d+)*\.?\s+[A-Z]/` — kata sesudah nomor wajib berhuruf besar. Kedua judul palsu hilang, dua judul asli yang tadinya tertutup (`2.4. Abstract`, `2.5.1. SECTIONS AND SUBSECTIONS`) muncul. Bahasa Indonesia relatif aman di sini karena desimal memakai koma, tapi syarat huruf besar tetap dipasang untuk kasus seperti "2.5 kali lipat".

### 16.5 Catatan untuk Tahap 2

- `getActiveDocument` kini mengembalikan `id`; `replaceDocument` mengembalikan `lastInsertRowid`. Dossier menggantung pada id yang sama.
- Menghapus/mengganti dokumen ikut menghapus chunk lewat `ON DELETE CASCADE` (`foreign_keys` sudah `ON` di `openDb`).
- `POST /skripsi` kini mengembalikan `chunk_count` — dipakai UI Tahap 3 untuk membedakan "PDF terbaca tapi tidak menghasilkan chunk" dari "dossier belum jadi".

---

## 17. Hasil Tahap 2 (2026-07-29)

Terkirim: `src/dossier.ts`, `src/retrieval.ts`, `src/sastrawijs.d.ts`, kolom dossier di `documents`, kontrak `TurnContext`, kedua provider, `routes/skripsi.ts` (+`POST /skripsi/dossier/rebuild`), `routes/sessions.ts`. Suite penuh **223 lulus, 0 gagal**. Dependency baru: `sastrawijs` (929 KB).

### 17.1 Anggaran token tercapai

| Komponen | token |
|---|---|
| persona | 4.724 |
| dossier (fixture contoh) | 395 |
| kutipan 3 × 1.200 char | 1.629 |
| history 15 giliran, belum dipangkas | 3.522 |
| **total** | **10.270** |
| sebelum (terukur) | 147.000 |

**Turun 14,3×.** Target ≤15k dan sasaran ~12k terpenuhi.

Dua koreksi terhadap perkiraan §15.2:

- Dossier fixture hanya 395 token karena isinya contoh. Dossier nyata akan mendekati batas 3.500 yang dipasang di prompt, sehingga total realistis **~12.900** — masih di bawah ambang, tapi jauh lebih rapat dari angka di tabel ini.
- History 15 giliran ternyata **3.522 token**, bukan ~1.500 seperti diperkirakan. **Tahap 6 (pemangkasan history) karena itu bukan "hasil terkecil"** seperti tertulis di §11; ia menyumbang lebih besar daripada Tahap 5.

### 17.2 Cache index retrieval dihapus, bukan diperbaiki

Rancangan awal meng-cache index BM25 per `documentId`. Test menangkapnya sebagai kutipan yang tidak pernah muncul: tiap test memakai DB `:memory:` baru, `documentId` mulai dari 1 lagi, dan cache tingkat-modul menyajikan index basi dari test sebelumnya.

Pengukuran menjawab apakah cache itu layak diperbaiki (400 chunk × 180 kata):

```
buildIndex pertama : 29,5 ms
buildIndex ulang   : 10,1 ms   (stem cache panas)
search             :  0,39 ms
```

10 ms pada giliran yang sudah menunggu STT dan LLM berdetik-detik. Cache index dihapus seluruhnya; cache stemmer — yang mengerjakan 2/3 biayanya — tetap. Menghapus keadaan yang bisa basi lebih murah daripada mengunci ulang kuncinya.

### 17.3 Sastrawi terbukti perlu

```
menggunakan  -> guna      pengumpulan  -> kumpul
dikembangkan -> kembang   pengujian    -> uji
kecemasan    -> cemas     menguji      -> uji
```

Test mengunci perilaku yang jadi alasan keputusan #2: kueri "bagaimana Anda menguji" menemukan chunk berisi "Pengujian", dan "apa yang Anda bangun" menemukan "dibangun".

Paket mengirim `dist/index.d.ts` tetapi tidak memetakannya di `exports` package.json, jadi TypeScript tidak menemukannya — `src/sastrawijs.d.ts` menambalnya.

### 17.4 Kata perintah penguji wajib jadi stopword

IDF dihitung atas isi skripsi. Kata seperti "jelaskan", "sebutkan", "tunjukkan" hampir tidak pernah muncul di naskah, sehingga IDF-nya tinggi dan kueri justru didominasi kata perintah alih-alih istilah yang dicari. Daftar stopword memuat keduanya: kata fungsi dan kata perintah penguji.

### 17.5 Hitungan struktural tidak dipercaya dari model

`parseDossier` menurunkan `jumlah_rumusan_masalah` dan `jumlah_kesimpulan` dari panjang array yang sudah terparse, bukan dari angka yang ditulis model. Model kerap menyebut "5 rumusan masalah" lalu mendaftar 3 — dan pertanyaan "apakah jumlahnya sama dengan kesimpulan?" justru bergantung pada angka itu.

### 17.6 Tidak ada jatuh-balik ke `full_text`

`POST /sessions/:id/turn` mengembalikan 400 bila `dossier_status ≠ 'ready'`, dengan pesan berbeda untuk `pending` dan `failed`. Jatuh-balik diam-diam ke naskah utuh akan menyembunyikan kegagalan sekaligus mengembalikan biaya 147k token per giliran tanpa user tahu.

### 17.7 Belum diverifikasi

- **Dossier nyata belum pernah dibangun.** Semua test memakai fixture. Ukuran, kualitas kutipan verbatim, dan ketepatan `poin_serangan` baru terbukti setelah satu skripsi asli diunggah.
- **Grounding belum diukur ulang.** Gerbang §9 (≥81,8%) masih terbuka; butuh sesi nyata dengan `scripts/grounding.ts`.
- `phaseBlock` sudah ada di kontrak tetapi belum diisi — itu Tahap 5.

---

## 18. Hasil Tahap 3 (2026-07-29)

Terkirim: `GET/PUT /skripsi/dossier`, panel Dossier di SettingsPage, `types.ts` + `api.ts`, `.dossier-facts` di `styles.css`. Backend **228 lulus**, frontend **72 lulus**, keduanya typecheck, frontend build bersih.

### 18.1 Gerbang "blokir mulai sidang" tidak perlu kode frontend

§10 meminta UI memblokir mulai sidang sampai `dossier_status = 'ready'`. Ternyata sudah berlaku tanpa kode baru: SessionPage tidak pernah punya gerbang skripsi sendiri — ia menampilkan pesan error dari backend, dan Tahap 2 sudah membuat `POST /sessions/:id/turn` membalas 400 dengan pesan yang membedakan `pending` dari `failed`.

Menambah gerbang kedua di frontend hanya menduplikasi aturan yang sudah dipegang backend, dan duplikat itulah yang biasanya lepas sinkron. Yang ditambahkan cuma penjelasannya di panel Pengaturan ("sidang belum bisa dimulai sampai selesai"), bukan penegakannya.

### 18.2 Suntingan manual lewat validator yang sama

`PUT /skripsi/dossier` memvalidasi lewat `parseDossier` yang sama dengan keluaran model. Dossier hasil suntingan tangan tidak boleh bisa melanggar bentuk yang akan ditolak dari model — kalau tidak, jalur pemulihan justru jadi jalur masuk dossier rusak. Test mengunci: suntingan yang menghapus judul ditolak 400 dan yang tersimpan tetap versi lama.

### 18.3 Tujuan #4 tercapai

§2 tujuan 4: "Menghilangkan `attack_points` kosong." Textarea manual yang selalu kosong diganti daftar `poin_serangan` hasil pembacaan naskah — tetap bisa disunting, tetapi tidak lagi dimulai dari nol.

Setelan `attack_points` di backend **tidak dihapus**. Nilainya masih ikut `buildPersona` dan masih di-round-trip oleh form, jadi user lama yang pernah mengisinya tidak kehilangan apa pun; user baru mendapat "" dan hanya melihat poin dari dossier. Membuang setelannya berarti perubahan yang merusak tanpa keuntungan sepadan.

### 18.4 Polling, bukan push

Pembangunan dossier berjalan di luar request upload, jadi panel menanya ulang tiap 3 detik selama `pending`. Tidak ada websocket/SSE: satu polling ringan selama ~1 menit, sekali per unggahan.

### 18.5 Panel menampilkan fakta agregatif

Selain poin serangan, panel menampilkan `jumlah_rumusan_masalah / jumlah_kesimpulan`, jumlah rumusan yang belum terjawab, metode, jumlah responden, dan modul kritik yang terpicu. Itu justru bagian dossier yang paling sulit diverifikasi user dari naskah, dan paling merusak bila salah — menaruhnya di depan mata membuat dossier meleset ketahuan sebelum sidang dimulai, bukan sesudah.

### 18.7 `dossier` masuk rincian pemakaian token

`UsageKind` bertambah `"dossier"`, dan panel Pemakaian token melabelinya "Baca skripsi" — biaya sekali-per-dokumen itu harus terlihat terpisah dari biaya per giliran, karena keduanya berperilaku sangat berbeda.

---

## 19. Hasil Tahap 4 (2026-07-29)

Terkirim: `buildAssessmentUser` menerima dossier + kutipan, rute `close` memakai keduanya, `formatChunks` dipisah dari `formatExcerpts`. Backend **231 lulus**, tsc bersih.

### 19.1 Penilaian turun 13,6×

| | token |
|---|---|
| sebelum (terukur) | 142.884 |
| sesudah, dossier ~3.500 | **10.520** |
| — system | 691 |
| — dossier | ~3.500 |
| — transkrip 30 giliran | ~3.600 |
| — 5 kutipan × 1.200 char | ~2.700 |

Skema `Assessment`, `deriveGrade`, `deriveVerdict`, `parseAssessment`, dan `ASSESSMENT_MAX_TOKENS` tidak berubah, sesuai §8.

### 19.2 Riwayat retrieval tidak dicatat

§8 meminta "chunk yang paling sering ter-retrieve selama sesi (maks 5)". Itu menuntut pencatatan hasil retrieval tiap giliran — tabel baru, tulisan tiap giliran, dan satu lagi keadaan yang bisa lepas sinkron dengan `chunks`.

Satu pencarian pada saat menutup, dengan **transkrip penuh sebagai kueri**, memberi hasil yang setara: chunk yang paling menyangkut apa yang benar-benar dibahas. Frekuensi retrieval per giliran hanyalah perkiraan kasar dari hal yang sama. Skor BM25 di sini memakai himpunan istilah unik kueri, jadi transkrip panjang terbaca sebagai "seluruh topik yang dibahas", bukan didominasi kata yang paling sering diulang.

Test menguncinya: chunk tentang SUS/responden terpilih, chunk tentang fotosintesis tidak — semata karena yang pertama dibahas di sidang.

### 19.3 Gerbang dossier ikut ke rute close

`POST /sessions/:id/close` kini menolak 400 bila dossier tidak `ready`, sama seperti rute turn. Tanpa itu satu sesi bisa berjalan penuh lalu gagal dinilai di ujung — kegagalan pada titik paling mahal.

---

## 20. Hasil Tahap 5 (2026-07-29)

Terkirim: `CRITIQUE_MODULES` jadi record berkunci, `phaseWindow`, `buildPhaseBlock`, bank pertanyaan keluar dari `buildPersona`, `phaseBlock` terisi di rute turn. Backend **242 lulus**, tsc bersih.

### 20.1 Penghematan jauh lebih kecil dari perkiraan §11

§11 menulis "Hemat ~2,5k token". Persona memang turun **4.724 → 2.477** (−2.247, persis). Tapi sebagian besarnya kembali sebagai blok fase:

| posisi | 0 modul | 2 modul | 4 modul |
|---|---|---|---|
| n=0 | 489 | 873 | 1.243 |
| n=4 | 855 | 1.239 | 1.609 |
| n=8 | 953 | 1.337 | 1.707 |
| n≥12 | 407 | 791 | 1.161 |

Neto: **persona + blok fase = 3.814 token** (2 modul, tengah sidang) atau **4.199** (keempat modul terpicu), lawan 4.724 sebelumnya.

**Hemat nyata 525–1.200 token, bukan 2.247.** Sekitar 4–9% anggaran per giliran, bukan 17%. Perkiraan §11 mengabaikan bahwa isi yang dipindahkan sebagian besar tetap harus dikirim.

Yang tidak masuk hitungan token: penguji tidak lagi melihat empat modul kritik ketika skripsinya hanya memicu satu. Itu klaim kedua §11 ("naikkan kepatuhan aturan") dan kemungkinan besar nilainya lebih besar daripada penghematan tokennya — tetapi belum terukur.

### 20.2 Fase ditaksir, bukan diketahui

Tidak ada sumber kebenaran posisi fase: model menjalankan agendanya sendiri dan tidak melaporkan posisinya. `phaseWindow` menaksir dari jumlah giliran penguji (`floor(n / 2)`, kalibrasi 8–15 pertanyaan untuk 7 fase).

Tiga hal menahan risiko taksiran yang meleset:

1. Yang dikirim adalah **jendela 2–3 fase**, bukan satu fase. Meleset satu langkah tetap mengenai.
2. **Agenda lengkap tetap di persona.** Model selalu tahu ketujuh fase dan urutannya; hanya contoh pertanyaannya yang dipersempit.
3. Bank pertanyaan memang berlabel "bahan, bukan naskah" — kehilangan contoh untuk satu fase menurunkan mutu pertanyaan sedikit, tidak membuat penguji kehilangan arah.

Jalur upgrade sudah ditulis sebagai komentar `ponytail:` di `phaseWindow`: minta model menempelkan penanda fase seperti `CLOSE_MARKER`, lalu baca posisinya alih-alih menaksir. Mesinnya sudah ada (`stripCloseMarker`).

**Ini satu-satunya komponen menebak di seluruh sistem, dan ia masuk sebelum gerbang §9 pernah diukur.** Bila grounding turun setelah ini, `phaseWindow` adalah tersangka pertama.

### 20.3 Nama modul kini satu sumber

`CRITIQUE_TRIGGERS` pindah ke `questionBank.ts` dan diekspor ulang oleh `dossier.ts`. Sebelumnya daftar nama ada dua kali di dua file — dossier bisa menandai modul yang tidak punya isi, dan tidak ada yang menangkapnya.

### 20.4 Anggaran per giliran sesudah Tahap 5

| Komponen | token |
|---|---|
| persona | 2.477 |
| blok fase (2 modul, n=8) | 1.337 |
| dossier ~3.500 | 3.500 |
| kutipan 3 × 1.200 char | 1.629 |
| history 15 giliran, belum dipangkas | 3.522 |
| **total** | **12.465** |

Tahap 6 (pemangkasan history) kini jelas menjadi sisa terbesar: 3.522 token, **lebih besar dari seluruh hasil Tahap 5**.
