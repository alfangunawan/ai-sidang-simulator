import { describe, it, expect } from "vitest";
import { parseDossier, formatDossier, attackPointsFor } from "../src/dossier.js";
import { SIDANG_PHASES } from "../src/phases.js";
import { SAMPLE_DOSSIER } from "./fixtures/dossier.js";

const minimal = {
  judul: "Judul Skripsi",
  rumusan_masalah: ["RM satu?", "RM dua?"],
  kesimpulan: ["Kesimpulan satu."],
};

describe("parseDossier", () => {
  it("tolerates a code fence and surrounding prose", () => {
    const d = parseDossier("Berikut hasilnya:\n```json\n" + JSON.stringify(minimal) + "\n```");
    expect(d.judul).toBe("Judul Skripsi");
    expect(d.rumusan_masalah).toHaveLength(2);
  });

  it("fills absent sections with empty values instead of undefined", () => {
    const d = parseDossier(JSON.stringify(minimal));
    expect(d.tujuan).toEqual([]);
    expect(d.metode).toEqual({ nama: "", justifikasi: "" });
    expect(d.populasi_sampel.jumlah).toBeNull();
    expect(d.poin_serangan).toEqual([]);
  });

  // Kegagalan dossier bersifat senyap dan permanen untuk dokumen itu: setiap
  // sesi berikutnya berjalan tanpa dasar. Lebih baik gagal keras.
  it("rejects a dossier missing judul or rumusan_masalah", () => {
    expect(() => parseDossier(JSON.stringify({ ...minimal, judul: "" }))).toThrow(/missing/);
    expect(() => parseDossier(JSON.stringify({ ...minimal, rumusan_masalah: [] }))).toThrow(/missing/);
  });

  it("rejects output with no JSON at all", () => {
    expect(() => parseDossier("Maaf, saya tidak bisa membaca PDF ini.")).toThrow(/not found/);
  });

  // Model kerap menyebut "5 rumusan masalah" lalu mendaftar 3. Panjang array
  // yang sudah terparse tidak bisa berbeda dari isinya.
  it("derives structural counts from the parsed arrays, not the model's arithmetic", () => {
    const d = parseDossier(
      JSON.stringify({ ...minimal, fakta_struktural: { jumlah_rumusan_masalah: 99, jumlah_kesimpulan: 99 } }),
    );
    expect(d.fakta_struktural.jumlah_rumusan_masalah).toBe(2);
    expect(d.fakta_struktural.jumlah_kesimpulan).toBe(1);
  });

  it("drops critique modules outside the known set", () => {
    const d = parseDossier(
      JSON.stringify({ ...minimal, modul_kritik_terpicu: ["sistem", "astrologi"] }),
    );
    expect(d.modul_kritik_terpicu).toEqual(["sistem"]);
  });
});

describe("formatDossier", () => {
  it("carries the verbatim quotes and attack points the examiner needs", () => {
    const out = formatDossier(SAMPLE_DOSSIER);
    expect(out).toContain(SAMPLE_DOSSIER.rumusan_masalah[0]);
    expect(out).toContain(SAMPLE_DOSSIER.kesimpulan[0]);
    expect(out).toContain("71,7%");
    expect(out).toContain("Tabel IV-1");
    expect(out).toContain("POIN SERANGAN");
    expect(out).toContain("hlm. 41");
  });

  it("omits empty sections rather than printing blank headings", () => {
    const out = formatDossier(parseDossier(JSON.stringify(minimal)));
    expect(out).not.toContain("Tujuan:");
    expect(out).not.toContain("Instrumen:");
    expect(out).toContain("Judul: Judul Skripsi");
  });

  // Anggaran §15.2: dossier di atas ~3.500 token memakan jatah kutipan retrieval.
  it("stays well inside the per-turn budget", () => {
    expect(Math.round(formatDossier(SAMPLE_DOSSIER).length / 2.3)).toBeLessThan(3500);
  });
});

describe("attackPointsFor", () => {
  const POINTS = [
    "[Metodologi] Iterasi prototyping tidak didokumentasikan.",
    "[Hasil & Pembahasan] Abstrak menyebut 16 skenario, Tabel V-1 memuat 15.",
    "[Kesimpulan & Kontribusi] Klaim stigma tanpa instrumen pengukur.",
  ];

  // Persona menyuruh memprioritaskan poin serangan, jadi poin dari bab yang
  // tidak diuji akan menarik sidang keluar agenda.
  it("keeps only the points that belong to the chosen phases", () => {
    expect(attackPointsFor(POINTS, ["Pembukaan", "Metodologi", "Penutup"])).toEqual([POINTS[0]]);
  });

  it("keeps every point when the whole agenda runs", () => {
    expect(attackPointsFor(POINTS, SIDANG_PHASES)).toEqual(POINTS);
  });

  // Dossier yang dibangun sebelum penanda ini ada tidak boleh kehilangan poinnya.
  it("keeps untagged points regardless of the agenda", () => {
    expect(attackPointsFor(["Angka berbeda antar bab."], ["Pembukaan", "Metodologi"])).toEqual([
      "Angka berbeda antar bab.",
    ]);
  });
});
