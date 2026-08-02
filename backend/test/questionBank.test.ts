import { describe, it, expect } from "vitest";
import {
  buildPhaseBlock,
  phaseWindow,
  QUESTION_BANK,
  CRITIQUE_MODULES,
  CRITIQUE_TRIGGERS,
} from "../src/questionBank.js";
import { SIDANG_PHASES } from "../src/phases.js";
import { MIN_EXAMINER_QUESTIONS } from "../src/sidang.js";

const tok = (s: string) => Math.round(s.length / 2.3);

describe("phaseWindow", () => {
  it("opens on the first phases and ends on the last", () => {
    expect(phaseWindow(0)[0]).toBe("Pembukaan");
    expect(phaseWindow(99).at(-1)).toBe("Penutup");
  });

  it("advances as the examiner asks more questions", () => {
    expect(phaseWindow(0)).not.toContain("Hasil & Pembahasan");
    expect(phaseWindow(10)).toContain("Hasil & Pembahasan");
  });

  // Dulu jendela mentok di [Kesimpulan, Penutup] pada giliran 12 padahal sidang
  // tidak boleh tutup sebelum 15: tiga giliran terakhir kehabisan bahan selain
  // fase penutup, dan model merangkum sebelum waktunya.
  it("keeps a non-closing phase in the window until the sidang may close", () => {
    const closing = ["Kesimpulan & Kontribusi", "Penutup"];
    for (let n = 0; n < MIN_EXAMINER_QUESTIONS; n++) {
      const w = phaseWindow(n);
      expect(w.some((p) => !closing.includes(p)), `giliran ${n}: ${w.join(", ")}`).toBe(true);
    }
    expect(phaseWindow(MIN_EXAMINER_QUESTIONS)).toEqual(closing);
  });

  // Fase ditaksir, bukan diketahui. Jendela tiga fase adalah toleransi terhadap
  // taksiran yang meleset satu langkah.
  it("never returns fewer than two phases, so a one-phase drift still lands", () => {
    for (let n = 0; n <= 40; n++) {
      const w = phaseWindow(n);
      expect(w.length).toBeGreaterThanOrEqual(2);
      expect(w.length).toBeLessThanOrEqual(3);
      expect(w.every((p) => SIDANG_PHASES.includes(p))).toBe(true);
    }
  });
});

describe("buildPhaseBlock", () => {
  it("carries questions for the nearby phases only", () => {
    const block = buildPhaseBlock(0, []);
    expect(block).toContain(QUESTION_BANK["Pembukaan"][0]);
    expect(block).not.toContain(QUESTION_BANK["Penutup"][0]);
  });

  // Dossier menentukan modul mana yang relevan dengan membaca naskah penuh,
  // jadi tidak ada tebakan di sini — dan modul yang tidak dipicu tidak boleh
  // ikut, supaya penguji skripsi logistik tidak ditanyai etika klinis.
  it("includes only the critique modules the dossier triggered", () => {
    const block = buildPhaseBlock(6, ["kuesioner"]);
    expect(block).toContain(CRITIQUE_MODULES.kuesioner);
    expect(block).not.toContain(CRITIQUE_MODULES.domain_sensitif);
    expect(block).not.toContain(CRITIQUE_MODULES.ai);
  });

  it("omits the critique heading entirely when nothing was triggered", () => {
    expect(buildPhaseBlock(6, [])).not.toContain("MODUL KRITIK");
  });

  it("ignores trigger names that have no module", () => {
    expect(buildPhaseBlock(6, ["astrologi"])).not.toContain("MODUL KRITIK");
  });

  it("keeps telling the model to adapt rather than read the bank verbatim", () => {
    expect(buildPhaseBlock(4, [])).toMatch(/Jangan membacakan pertanyaan apa adanya/);
  });

  // §7 PRD memperkirakan blok fase ~800 token. Terukur: 407-953 tanpa modul,
  // sampai 1.707 bila keempat modul terpicu. Ambang ini menjaga agar penambahan
  // pertanyaan atau modul baru tidak diam-diam menelan anggaran per giliran.
  it("stays inside its token budget even with every module triggered", () => {
    const worst = Math.max(
      ...Array.from({ length: 20 }, (_, n) => tok(buildPhaseBlock(n, CRITIQUE_TRIGGERS))),
    );
    expect(worst).toBeLessThan(1800);
  });
});
