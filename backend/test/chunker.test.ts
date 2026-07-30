import { describe, it, expect } from "vitest";
import { chunkPages } from "../src/chunker.js";

const para = (n: number) =>
  Array.from({ length: n }, (_, i) => `Kalimat nomor ${i} berisi penjelasan metode penelitian.`).join(
    " ",
  );

describe("chunkPages", () => {
  it("attaches 1-based page numbers", () => {
    const chunks = chunkPages([`BAB I\n${para(20)}`, `BAB II\n${para(20)}`]);
    expect(chunks[0].page).toBe(1);
    expect(chunks[chunks.length - 1].page).toBe(2);
  });

  it("carries the nearest heading, including subheadings", () => {
    const chunks = chunkPages([`BAB III METODOLOGI\n3.2 Pengumpulan Data\n${para(20)}`]);
    expect(chunks[0].heading).toBe("3.2 Pengumpulan Data");
  });

  // Ditemukan saat menjalankan chunker pada PDF asli: "0.13 inches afterward."
  // terbaca sebagai subbab dan chunk-nya dilabeli lokasi yang salah.
  it("does not mistake a sentence starting with a decimal for a subheading", () => {
    const chunks = chunkPages([
      `BAB IV HASIL\n0.13 inci setelahnya.\n2.5 kali lipat dibanding basis.\n${para(20)}`,
    ]);
    expect(chunks[0].heading).toBe("BAB IV HASIL");
  });

  it("keeps a heading across page boundaries", () => {
    const chunks = chunkPages([`BAB III METODOLOGI\n${para(10)}`, para(10)]);
    expect(chunks.find((c) => c.page === 2)?.heading).toBe("BAB III METODOLOGI");
  });

  it("drops back matter from DAFTAR PUSTAKA onward", () => {
    const chunks = chunkPages([
      `BAB V PENUTUP\n${para(20)}`,
      `DAFTAR PUSTAKA\n${para(20)}`,
      `LAMPIRAN\n${para(20)}`,
    ]);
    expect(chunks.every((c) => c.page === 1)).toBe(true);
  });

  it("drops front matter but resumes at BAB I", () => {
    const chunks = chunkPages([
      `KATA PENGANTAR\n${para(20)}`,
      `DAFTAR ISI\n${para(20)}`,
      `BAB I PENDAHULUAN\n${para(20)}`,
    ]);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.page === 3)).toBe(true);
  });

  // Kata "Lampiran" di tengah kalimat pernah jadi cara paling gampang membuang
  // separuh naskah tanpa sadar.
  it("does not drop a page that merely mentions lampiran mid-sentence", () => {
    const chunks = chunkPages([`BAB IV HASIL\n${para(5)} Hasil lengkap ada di Lampiran A. ${para(15)}`]);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("splits an oversized single-line paragraph at a sentence boundary", () => {
    const chunks = chunkPages([`BAB II\n${para(200)}`]);
    expect(chunks.length).toBeGreaterThan(1);
    // Tidak ada chunk yang berakhir di tengah kata.
    for (const c of chunks) expect(c.text).not.toMatch(/\bKalima$/);
  });

  it("overlaps consecutive chunks so a cross-boundary sentence survives", () => {
    const chunks = chunkPages([`BAB II\n${para(200)}`]);
    const tail = chunks[0].text.slice(-40);
    expect(chunks[1].text).toContain(tail);
  });

  it("emits no fragment chunks", () => {
    const chunks = chunkPages([`BAB II\n${para(200)}`, "Sisa.", `BAB III\n${para(50)}`]);
    for (const c of chunks) expect(c.text.length).toBeGreaterThanOrEqual(200);
  });

  it("numbers chunks contiguously from zero", () => {
    const chunks = chunkPages([`BAB I\n${para(30)}`, `BAB II\n${para(30)}`]);
    expect(chunks.map((c) => c.idx)).toEqual(chunks.map((_, i) => i));
  });

  it("returns nothing for empty input", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages(["", "   "])).toEqual([]);
  });

  // Diukur pada dua naskah asli: indeks PDF mendahului nomor cetak 21 dan 19
  // halaman. Penguji menyitir nomor cetak (lewat dossier) dan indeks PDF (lewat
  // kutipan chunk) dalam napas yang sama, lalu menuduh mahasiswa salah halaman.
  it("uses the printed folio, not the PDF index, once the sequence starts", () => {
    const chunks = chunkPages([
      `KATA PENGANTAR\n${para(20)}`,
      `DAFTAR ISI\n${para(20)}`,
      `1\nBAB I PENDAHULUAN\n${para(20)}`,
      `2\n${para(20)}`,
      `3\n${para(20)}`,
    ]);
    expect(chunks[0].page).toBe(1);
    expect(chunks[chunks.length - 1].page).toBe(3);
  });

  it("ignores a stray leading number that does not continue the sequence", () => {
    const chunks = chunkPages([
      `1\nBAB IV HASIL\n${para(20)}`,
      `2\n${para(20)}`,
      // Nomor tabel di kepala halaman, bukan folio.
      `7 Tipe Use Case Ref Tujuan Pengujian\n${para(20)}`,
    ]);
    expect(chunks[chunks.length - 1].page).toBe(3);
  });
});
