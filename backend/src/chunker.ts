/**
 * Memecah naskah skripsi (array halaman dari unpdf `mergePages: false`) menjadi
 * potongan berukuran retrieval, lengkap dengan nomor halaman dan bab/subbab
 * terdekat. Metadata itulah alasan chunking ada di sini: tanpa `page` dan
 * `heading`, penguji tidak bisa berkata "Tabel IV-1 pada halaman 62" — dan
 * kemampuan itu yang diukur gerbang grounding (§9 PRD).
 */

export interface Chunk {
  idx: number;
  page: number | null;
  heading: string | null;
  text: string;
}

const TARGET = 1200; // panjang sasaran satu chunk, karakter
const OVERLAP = 150; // ekor chunk sebelumnya yang diulang, menjaga kalimat lintas-batas
const MIN_CHUNK = 200; // di bawah ini bukan chunk, cuma serpihan — digabung ke tetangga
const HEADING_MAX = 60; // baris lebih panjang dari ini adalah paragraf, bukan judul
const SCAN_LINES = 6; // penanda bagian selalu di kepala halaman

/**
 * Bagian yang dibuang. Alasannya bukan hemat token — chunk tidak semuanya
 * dikirim — melainkan kualitas retrieval: daftar pustaka padat kata kunci dan
 * akan mendominasi skor BM25 untuk hampir semua kueri.
 *
 * Listing kode SENGAJA tidak dibuang: arketipe penguji `teknis` menggali
 * arsitektur dan alur data, dan listing kode adalah bahannya.
 */
const DROP =
  /^(daftar\s+(isi|pustaka|tabel|gambar|lampiran|singkatan|istilah|simbol|notasi)|kata\s+pengantar|ucapan\s+terima\s+kasih|lampiran|lembar\s+pengesahan|halaman\s+pengesahan|lembar\s+persembahan|pernyataan\s+orisinalitas)\b/i;
const BAB = /^bab\s+[ivxlc]+\b/i;
/**
 * Subbab bernomor. Kata sesudah nomor WAJIB berhuruf besar — tanpa syarat itu
 * kalimat pendek yang kebetulan diawali desimal ("0,13 inci setelahnya.",
 * "2.5 kali lipat dibanding…") ikut terbaca sebagai judul, dan chunk-nya
 * dilabeli lokasi yang salah. Penguji lalu menyebut bagian yang keliru —
 * kerusakan langsung pada metrik grounding.
 */
const SUB = /^\d+\.\d+(\.\d+)*\.?\s+[A-Z]/;

function isHeading(line: string): boolean {
  return line.length <= HEADING_MAX && (BAB.test(line) || SUB.test(line));
}

/**
 * Apakah halaman ini membuka bagian yang dibuang, atau membuka bab yang
 * mengakhiri pembuangan. Judul dicari hanya di kepala halaman dan hanya pada
 * baris pendek, supaya kata "Lampiran" di tengah paragraf tidak memotong
 * separuh naskah.
 */
function pageMarker(page: string): "drop" | "resume" | null {
  const lines = page
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, SCAN_LINES);
  for (const line of lines) {
    if (line.length > HEADING_MAX) continue;
    if (BAB.test(line)) return "resume";
    if (DROP.test(line)) return "drop";
  }
  return null;
}

// Paragraf hasil ekstraksi PDF kerap jadi satu baris sangat panjang. Potong di
// batas kalimat bila ada di paruh belakang jendela; kalau tidak ada, potong keras.
function splitLong(line: string): string[] {
  if (line.length <= TARGET) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > TARGET) {
    const window = rest.slice(0, TARGET);
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
    );
    const at = cut > TARGET / 2 ? cut + 1 : TARGET;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function packPage(
  page: string,
  headingIn: string | null,
): { chunks: { heading: string | null; text: string }[]; heading: string | null } {
  let heading = headingIn;
  const pieces: { text: string; heading: string | null; isHead: boolean }[] = [];
  for (const raw of page.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const head = isHeading(line);
    if (head) heading = line;
    for (const piece of splitLong(line)) pieces.push({ text: piece, heading, isHead: head });
  }

  const chunks: { heading: string | null; text: string }[] = [];
  let buf = "";
  let bufHeading = headingIn;
  // Judul yang berdiri di kepala chunk memperkenalkan isi chunk itu, jadi ia
  // yang dipakai — bukan judul bab di atasnya. "3.2 Pengumpulan Data, hlm. 41"
  // menuntun penguji lebih tepat daripada "BAB III METODOLOGI".
  let bufHasBody = false;
  for (const pc of pieces) {
    if (buf && buf.length + pc.text.length + 1 > TARGET) {
      chunks.push({ heading: bufHeading, text: buf });
      buf = buf.slice(-OVERLAP);
      bufHasBody = false;
    }
    if (!bufHasBody) bufHeading = pc.heading;
    if (!pc.isHead) bufHasBody = true;
    buf = buf ? `${buf}\n${pc.text}` : pc.text;
  }
  if (buf) chunks.push({ heading: bufHeading, text: buf });

  // Sisa akhir halaman yang terlalu pendek digabung ke chunk sebelumnya, bukan
  // dibiarkan jadi chunk sendiri — serpihan 40 karakter mengacaukan IDF BM25.
  if (chunks.length > 1 && chunks[chunks.length - 1].text.length < MIN_CHUNK) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1].text += `\n${tail.text}`;
  }
  return { chunks, heading };
}

/**
 * Nomor halaman cetak di kepala halaman. unpdf mengekstraknya sebagai token
 * pertama teks halaman, dan nomor ITU yang dilihat mahasiswa di naskahnya —
 * indeks PDF berbeda darinya sebanyak tebal halaman depan (21 dan 19 halaman
 * pada dua naskah yang diuji).
 *
 * Tanpa ini penguji menyitir dua sistem penomoran sekaligus dalam satu giliran:
 * dossier dibaca dari teks jadi ia memakai nomor cetak, sedangkan kutipan
 * chunk memakai indeks PDF. Terlihat di transkrip nyata — penguji menuduh
 * mahasiswa salah halaman selama 8 giliran berturut-turut atas beda 21 itu.
 */
const FOLIO = /^\s*(\d{1,4})(?!\S)/;

function folioAt(pages: string[], p: number): number | null {
  const m = FOLIO.exec(pages[p] ?? "");
  return m ? Number(m[1]) : null;
}

export function chunkPages(pages: string[]): Chunk[] {
  const out: Chunk[] = [];
  let dropping = false;
  let heading: string | null = null;
  // Selisih indeks PDF terhadap nomor cetak, sekali ketemu dipakai seterusnya.
  let offset: number | null = null;

  for (let p = 0; p < pages.length; p++) {
    // Dihitung sebelum penyaringan halaman: halaman depan yang dibuang tetap
    // menggeser penomoran, jadi offset harus ikut berjalan melewatinya.
    const folio = folioAt(pages, p);
    const expected: number | null = offset === null ? null : p + 1 - offset;
    // Deret dimulai hanya bila halaman berikutnya melanjutkan hitungan. Tanpa
    // syarat itu satu angka nyasar di kepala halaman (nomor tabel, sisa header)
    // cukup untuk menggeser penomoran seluruh naskah.
    const starts = expected === null && folio !== null && folioAt(pages, p + 1) === folio + 1;
    let page = expected ?? p + 1;
    if (folio !== null && (starts || folio === expected)) {
      page = folio;
      offset = p + 1 - folio;
    }

    const marker = pageMarker(pages[p]);
    if (marker === "resume") dropping = false;
    else if (marker === "drop") dropping = true;
    if (dropping) continue;

    const packed = packPage(pages[p], heading);
    heading = packed.heading;
    for (const c of packed.chunks) {
      if (c.text.trim().length < MIN_CHUNK) continue;
      out.push({ idx: out.length, page, heading: c.heading, text: c.text.trim() });
    }
  }
  return out;
}
