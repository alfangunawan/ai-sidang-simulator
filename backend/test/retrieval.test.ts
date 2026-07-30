import { describe, it, expect } from "vitest";
import { terms, buildIndex, search, formatExcerpts } from "../src/retrieval.js";
import type { Chunk } from "../src/chunker.js";

const chunk = (idx: number, text: string, page = idx + 1, heading: string | null = null): Chunk => ({
  idx,
  page,
  heading,
  text,
});

describe("terms", () => {
  // Alasan Sastrawi ada di sini: tanpa stemming, "menggunakan" di pertanyaan
  // tidak pernah cocok dengan "digunakan" di naskah.
  it("stems Indonesian affixes to a shared root", () => {
    expect(terms("menggunakan")).toEqual(terms("digunakan"));
    expect(terms("pengumpulan data")).toEqual(terms("mengumpulkan data"));
  });

  it("drops function words and examiner command verbs", () => {
    expect(terms("coba jelaskan dan sebutkan yang ini")).toEqual([]);
  });

  it("keeps numbers verbatim, without stemming", () => {
    expect(terms("skor 71,7% dari 113 responden")).toContain("71,7");
    expect(terms("skor 71,7% dari 113 responden")).toContain("113");
  });
});

describe("search", () => {
  const chunks = [
    chunk(0, "Metode prototyping dipilih karena iterasi cepat dengan pengguna.", 41, "BAB III"),
    chunk(1, "Pengujian memakai kuesioner SUS dengan 113 responden mahasiswa.", 62, "BAB IV"),
    chunk(2, "Kesimpulan penelitian ini adalah sistem berhasil dibangun.", 88, "BAB V"),
  ];
  const index = buildIndex(chunks);

  it("ranks the chunk that shares terms with the query first", () => {
    expect(search(index, "berapa responden kuesioner", 1)[0].idx).toBe(1);
    expect(search(index, "mengapa memilih metode prototyping", 1)[0].idx).toBe(0);
  });

  // Inti keputusan #2 PRD. Kueri dan naskah memakai imbuhan berbeda untuk akar
  // yang sama; tanpa stemming keduanya tidak pernah bertemu.
  it("matches a query affix against a different affix in the text", () => {
    expect(search(index, "bagaimana Anda menguji", 1)[0].idx).toBe(1); // menguji -> uji -> "Pengujian"
    expect(search(index, "apa yang Anda bangun", 1)[0].idx).toBe(2); // bangun -> "dibangun"
  });

  it("returns at most k and never a zero-scoring chunk", () => {
    expect(search(index, "kuesioner", 2).length).toBeLessThanOrEqual(2);
    expect(search(index, "xylophone kriptografi kuantum")).toEqual([]);
  });

  it("returns nothing when the query is all stopwords", () => {
    expect(search(index, "coba jelaskan yang ini")).toEqual([]);
  });

  it("survives an empty corpus", () => {
    expect(search(buildIndex([]), "apa saja")).toEqual([]);
  });
});

describe("formatExcerpts", () => {
  it("labels excerpts as reference material, not student speech", () => {
    const out = formatExcerpts([chunk(0, "isi naskah", 41, "BAB III METODOLOGI")]);
    // Tanpa label ini model bisa membaca kutipan sebagai jawaban mahasiswa dan
    // melanggar DIALOGUE_RULES.
    expect(out).toContain("bukan ucapan mahasiswa");
    expect(out).toContain("[BAB III METODOLOGI, hlm. 41]");
  });

  it("is empty when nothing was retrieved", () => {
    expect(formatExcerpts([])).toBe("");
  });
});
