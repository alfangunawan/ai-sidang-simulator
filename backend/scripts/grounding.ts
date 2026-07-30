/**
 * Metrik gerbang §9 PRD: seberapa sering penguji menambatkan pertanyaannya ke
 * naskah (bab/halaman/tabel/gambar/angka) dan seberapa sering ia mengonfrontasi
 * jawaban dengan isi naskah.
 *
 * Jalankan sebelum dan sesudah Tahap 2 dengan PDF dan jawaban yang sama.
 * Grounding SESUDAH tidak boleh turun di bawah SEBELUM — kalau turun, retrieval
 * yang salah, bukan dossier.
 *
 *   npx tsx scripts/grounding.ts [path/ke/sibiru.sqlite] [session_id]
 */
import Database from "better-sqlite3";

// Penambat lokasi: "Bab IV", "halaman 62", "hlm. 41", "Tabel IV-1", "Gambar I-1".
const LOCATOR = /\b(bab\s+[ivx\d]|halaman\s+\d|hlm\.?\s*\d|tabel\s+[ivx\d]|gambar\s+[ivx\d])/i;
// Angka yang hanya bisa berasal dari naskah: persentase, n=113, skor 2+ digit.
const FIGURE = /(\d+(?:[.,]\d+)?\s*%|\bn\s*=\s*\d+|\b\d{2,}\b)/;
// Konfrontasi: mengadu isi naskah dengan ucapan mahasiswa.
const CONFRONT = /\b(tapi|namun|padahal|sedangkan|justru)\b/i;

export interface Grounding {
  examiner_turns: number;
  locator: number;
  figure: number;
  grounded: number;
  confront: number;
  grounded_pct: number;
  confront_pct: number;
}

export function score(questions: string[]): Grounding {
  const has = (re: RegExp) => questions.filter((q) => re.test(q)).length;
  const grounded = questions.filter((q) => LOCATOR.test(q) || FIGURE.test(q)).length;
  // Konfrontasi hanya dihitung bila juga tertambat — "tapi" tanpa rujukan naskah
  // cuma retorika, bukan konfrontasi berbasis bukti.
  const confront = questions.filter(
    (q) => CONFRONT.test(q) && (LOCATOR.test(q) || FIGURE.test(q)),
  ).length;
  const n = questions.length;
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  return {
    examiner_turns: n,
    locator: has(LOCATOR),
    figure: has(FIGURE),
    grounded,
    confront,
    grounded_pct: pct(grounded),
    confront_pct: pct(confront),
  };
}

function main(): void {
  const [dbPath = "data/sibiru.sqlite", sessionId] = process.argv.slice(2);
  const db = new Database(dbPath, { readonly: true });
  const rows = (
    sessionId
      ? db
          .prepare("SELECT content FROM turns WHERE role='examiner' AND session_id=? ORDER BY turn_number")
          .all(sessionId)
      : db.prepare("SELECT content FROM turns WHERE role='examiner' ORDER BY session_id, turn_number").all()
  ) as { content: string }[];

  const g = score(rows.map((r) => r.content));
  console.log(sessionId ? `session ${sessionId}` : "SEMUA sesi");
  console.table(g);
}

// ponytail: self-check, bukan test suite. `npx tsx scripts/grounding.ts --check`
//
// Yang dijaga self-check ini: "di halaman berapa?" TIDAK boleh dihitung
// tertambat. Itu tuntutan generik yang bisa diucapkan model tanpa membaca
// naskah sama sekali. Kalau ikut dihitung, model buta konteks mendapat skor
// sama dengan model yang benar-benar merujuk Tabel IV-1 — dan gerbang §9
// kehilangan seluruh dayanya.
if (process.argv.includes("--check")) {
  const g = score([
    "Tunjukkan di halaman berapa data itu disajikan.", // tuntutan generik -> TIDAK tertambat
    "Anda menyebut 71,7%, tapi Tabel IV-1 mencantumkan n=113.", // locator+figure+confront
    "Coba jelaskan penelitian Anda dalam 3-5 menit.", // tidak tertambat
    "Tapi itu asumsi Anda.", // konfrontasi tanpa tambatan -> tidak dihitung
  ]);
  if (g.examiner_turns !== 4) throw new Error("examiner_turns");
  if (g.grounded !== 1) throw new Error(`grounded=${g.grounded}, harusnya 1`);
  if (g.confront !== 1) throw new Error(`confront=${g.confront}, harusnya 1`);
  console.log("ok");
} else if (process.argv[1]?.endsWith("grounding.ts")) {
  main();
}
