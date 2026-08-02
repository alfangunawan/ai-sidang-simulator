import { describe, it, expect } from "vitest";
import {
  CORE_PHASES,
  SIDANG_PHASES,
  normalizePhases,
  sessionPhases,
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
