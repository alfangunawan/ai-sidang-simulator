/**
 * Migrasi satu kali: `chunks.page` dari indeks PDF ke nomor halaman cetak.
 *
 * Chunker lama menyimpan `page = indeks halaman PDF`, sedangkan dossier dibaca
 * dari teks sehingga memakai nomor cetak. Selisihnya setebal halaman depan (21
 * dan 19 halaman pada dua naskah yang ada) — dan penguji menyitir keduanya
 * dalam satu giliran lalu menuduh mahasiswa salah halaman.
 *
 * PDF asli tidak disimpan, jadi rekonstruksi memakai folio yang ikut terekstrak
 * sebagai token pertama teks halaman dan masih ada di chunk pertama tiap
 * halaman. Dokumen yang diunggah setelah perbaikan chunker sudah benar dan
 * offset-nya terbaca 0, jadi menjalankan ulang script ini aman.
 *
 *   npx tsx scripts/fix-chunk-pages.ts [path/ke/sibiru.sqlite] [--apply]
 *
 * Tanpa --apply hanya mencetak rencananya.
 */
import Database from "better-sqlite3";

const FOLIO = /^\s*(\d{1,4})(?!\S)/;

export interface PageHead {
  page: number;
  text: string;
}

/**
 * Selisih indeks PDF terhadap nomor cetak, diambil dari selisih yang PALING
 * SERING muncul. Modus, bukan halaman pertama yang kebetulan berangka: nomor
 * tabel dan sisa header juga mendarat di kepala halaman, dan satu di antaranya
 * cukup untuk menggeser seluruh naskah kalau yang dipakai suara pertama.
 */
export function pageOffset(heads: PageHead[]): number | null {
  const votes = new Map<number, number>();
  for (const h of heads) {
    const m = FOLIO.exec(h.text);
    if (!m) continue;
    const diff = h.page - Number(m[1]);
    if (diff < 0) continue; // folio tidak mungkin mendahului indeks PDF
    votes.set(diff, (votes.get(diff) ?? 0) + 1);
  }
  let best: number | null = null;
  let top = 0;
  for (const [diff, n] of votes) {
    if (n > top) {
      top = n;
      best = diff;
    }
  }
  return best;
}

function main(): void {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dbPath = args.find((a) => !a.startsWith("--")) ?? "data/sibiru.sqlite";
  const db = new Database(dbPath);

  const docs = db.prepare("SELECT DISTINCT document_id AS id FROM chunks").all() as { id: number }[];
  for (const { id } of docs) {
    // Chunk pertama tiap halaman: hanya dia yang membawa folio, chunk
    // berikutnya dibuka oleh ekor tumpang-tindih chunk sebelumnya.
    const heads = db
      .prepare(
        "SELECT page, text FROM chunks WHERE document_id = ? AND idx IN (SELECT MIN(idx) FROM chunks WHERE document_id = ? GROUP BY page) ORDER BY page",
      )
      .all(id, id) as PageHead[];
    const offset = pageOffset(heads);

    if (offset === null) {
      console.log(`doc ${id}: tidak ada folio terbaca — dilewati`);
      continue;
    }
    if (offset === 0) {
      console.log(`doc ${id}: offset 0 — sudah benar`);
      continue;
    }
    // Halaman depan (indeks <= offset) bernomor romawi dan tidak punya padanan
    // arab; biarkan memakai indeks PDF, sama seperti perilaku chunker sekarang.
    const affected = db
      .prepare("SELECT COUNT(*) AS n FROM chunks WHERE document_id = ? AND page > ?")
      .get(id, offset) as { n: number };
    console.log(`doc ${id}: offset ${offset}, ${affected.n} chunk digeser${apply ? "" : " (dry-run)"}`);
    if (apply) {
      db.prepare("UPDATE chunks SET page = page - ? WHERE document_id = ? AND page > ?").run(
        offset,
        id,
        offset,
      );
    }
  }
  if (!apply) console.log("\nTidak ada yang ditulis. Tambahkan --apply untuk menjalankan.");
}

// ponytail: self-check, bukan test suite. `npx tsx scripts/fix-chunk-pages.ts --check`
//
// Yang dijaga: satu angka nyasar di kepala halaman tidak boleh mengalahkan
// deret folio yang sebenarnya. Itu satu-satunya cara migrasi ini merusak data.
if (process.argv.includes("--check")) {
  const offset = pageOffset([
    { page: 22, text: "1\nBAB I PENDAHULUAN" },
    { page: 23, text: "2\nlanjutan" },
    { page: 24, text: "3\nlanjutan" },
    { page: 25, text: "7 Tipe Use Case Ref" }, // nomor tabel, bukan folio
    { page: 26, text: "tanpa angka sama sekali" },
  ]);
  if (offset !== 21) throw new Error(`offset=${offset}, harusnya 21`);
  if (pageOffset([{ page: 1, text: "tanpa angka" }]) !== null) throw new Error("harusnya null");
  console.log("ok");
} else if (process.argv[1]?.endsWith("fix-chunk-pages.ts")) {
  main();
}
