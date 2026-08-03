import { describe, it, expect } from "vitest";
import {
  CORE_PHASES,
  SIDANG_PHASES,
  normalizePhases,
  sessionPhases,
  pagesForPhases,
  phaseSchedule,
  scheduledPhase,
} from "../src/phases.js";
import { MIN_EXAMINER_QUESTIONS, minQuestions } from "../src/sidang.js";
import { buildPersona } from "../src/persona.js";
import { phaseWindow } from "../src/questionBank.js";

describe("normalizePhases", () => {
  it("keeps a subset in agenda order, whatever order it arrives in", () => {
    expect(normalizePhases(["Metodologi", "Tinjauan Pustaka"])).toEqual([
      "Tinjauan Pustaka",
      "Metodologi",
    ]);
  });

  it("collapses 'everything' to null, so the stored form has one meaning", () => {
    expect(normalizePhases(undefined)).toBeNull();
    expect(normalizePhases(null)).toBeNull();
    expect(normalizePhases([...CORE_PHASES])).toBeNull();
  });

  it("rejects unknown names instead of silently dropping them", () => {
    expect(() => normalizePhases(["Metodologi", "Bab VI"])).toThrow();
    expect(() => normalizePhases(["Pembukaan"])).toThrow(); // ritual, not a bab
    expect(() => normalizePhases([])).toThrow();
    expect(() => normalizePhases("Metodologi")).toThrow();
  });
});

describe("sessionPhases", () => {
  it("gives the full agenda when nothing was picked", () => {
    expect(sessionPhases(null)).toEqual(SIDANG_PHASES);
    expect(sessionPhases("")).toEqual(SIDANG_PHASES);
  });

  it("always keeps Pembukaan and Penutup around the chosen bab", () => {
    expect(sessionPhases("Metodologi")).toEqual(["Pembukaan", "Metodologi", "Penutup"]);
  });

  // Fase disimpan sebagai CSV; koma di dalam nama fase akan memecahnya diam-diam.
  it("has no phase name containing the separator", () => {
    for (const p of SIDANG_PHASES) expect(p).not.toContain(",");
  });
});

describe("minQuestions", () => {
  it("leaves a full sidang at the calibrated 15", () => {
    expect(minQuestions()).toBe(MIN_EXAMINER_QUESTIONS);
    expect(minQuestions(SIDANG_PHASES)).toBe(15);
  });

  it("scales the close floor down with the chosen bab", () => {
    expect(minQuestions(sessionPhases("Metodologi"))).toBe(5);
    expect(minQuestions(sessionPhases("Metodologi,Hasil & Pembahasan"))).toBe(6);
  });
});

describe("a partial sidang agenda", () => {
  const agenda = sessionPhases("Metodologi");

  it("lists only the chosen bab and forbids wandering outside it", () => {
    const p = buildPersona("standar", "", "umum", agenda);
    expect(p).toContain("1. Pembukaan\n2. Metodologi\n3. Penutup");
    expect(p).not.toContain("Tinjauan Pustaka");
    expect(p).toContain("DILARANG mengajukan pertanyaan di luar fase itu");
  });

  it("scales the question target instead of asking for a full sidang's worth", () => {
    expect(buildPersona("standar", "", "umum", agenda)).toMatch(/3–5 pertanyaan utama/);
    expect(buildPersona("standar", "")).toMatch(/8–15 pertanyaan utama/);
  });

  it("slides the example-question window across the short agenda", () => {
    expect(phaseWindow(0, agenda)).toContain("Pembukaan");
    expect(phaseWindow(minQuestions(agenda), agenda).at(-1)).toBe("Penutup");
  });
});

const PETA = [
  { judul: "BAB I PENDAHULUAN", halaman_mulai: 1 },
  { judul: "BAB II TINJAUAN PUSTAKA", halaman_mulai: 11 },
  { judul: "BAB III METODE PENYELESAIAN MASALAH", halaman_mulai: 38 },
  { judul: "BAB IV HASIL PENELITIAN", halaman_mulai: 61 },
  { judul: "BAB V VALIDASI HASIL DAN DISKUSI", halaman_mulai: 150 },
  { judul: "BAB VI KESIMPULAN DAN SARAN", halaman_mulai: 203 },
];

describe("pagesForPhases", () => {
  it("maps a single bab onto its own page span", () => {
    expect(pagesForPhases(sessionPhases("Metodologi"), PETA)).toEqual([{ from: 38, to: 60 }]);
  });

  it("gives Hasil & Pembahasan both of its chapters, the last one open-ended", () => {
    const r = pagesForPhases(sessionPhases("Hasil & Pembahasan"), PETA);
    expect(r).toEqual([
      { from: 61, to: 149 },
      { from: 150, to: 202 },
    ]);
  });

  it("does not narrow a full sidang", () => {
    expect(pagesForPhases(SIDANG_PHASES, PETA)).toEqual([]);
  });

  // Naskah dengan judul bab tak lazim tidak boleh kehilangan kutipannya.
  it("returns no range when the peta bab has no roman numerals", () => {
    expect(pagesForPhases(sessionPhases("Metodologi"), [{ judul: "Pendahuluan", halaman_mulai: 1 }])).toEqual([]);
  });
});

// Inti step 3: cakupan berhenti jadi statistik. "Tiap bab terpilih dapat >=2
// pertanyaan" dibuktikan di sini, bukan dengan menjalankan ratusan sidang.
describe("phaseSchedule", () => {
  const combos = [];
  for (let mask = 1; mask < 1 << CORE_PHASES.length; mask++) {
    combos.push(CORE_PHASES.filter((_, i) => mask & (1 << i)));
  }

  it("gives every chosen bab at least two turns, for all 31 combinations", () => {
    for (const core of combos) {
      const agenda = sessionPhases(core.join(","));
      const s = phaseSchedule(agenda, minQuestions(agenda));
      for (const bab of core) {
        const n = s.filter((p) => p === bab).length;
        expect(n, `${core.join("+")} -> ${bab} hanya ${n} giliran`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never schedules a bab the student did not choose", () => {
    for (const core of combos) {
      const agenda = sessionPhases(core.join(","));
      const s = phaseSchedule(agenda, minQuestions(agenda));
      for (const p of s) expect(agenda).toContain(p);
    }
  });

  it("opens on Pembukaan and ends on Penutup", () => {
    const agenda = sessionPhases("Metodologi");
    const s = phaseSchedule(agenda, minQuestions(agenda));
    expect(s[0]).toBe("Pembukaan");
    expect(s.at(-1)).toBe("Penutup");
  });

  it("fills the schedule up to the close floor", () => {
    for (const core of combos) {
      const agenda = sessionPhases(core.join(","));
      const min = minQuestions(agenda);
      expect(phaseSchedule(agenda, min).length).toBeGreaterThanOrEqual(min);
    }
  });

  // Sidang boleh berjalan lebih panjang dari ambang; giliran tambahan tetap
  // harus punya tuan rumah di dalam agenda.
  it("keeps assigning chosen bab past the end of the schedule", () => {
    const agenda = sessionPhases("Metodologi,Hasil & Pembahasan");
    for (let n = 0; n < 40; n++) {
      expect(agenda).toContain(scheduledPhase(n, agenda, minQuestions(agenda)));
    }
  });
});
