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
| 8 | Caching **ditunda** ke Tahap 3 | Setelah dossier, prefix stabil tinggal ~5–8k; hemat marginal |
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
| 0 | Ukur `buildPersona(...).length`; catat baseline grounding & token | Kalau persona ternyata 8k, prioritas berubah. Lima menit |
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
