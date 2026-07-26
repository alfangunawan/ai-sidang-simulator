import { describe, it, expect } from "vitest";
import {
  buildPersona,
  EXAMINER_MODES,
  EXAMINER_TYPES,
  DEFAULT_EXAMINER_MODE,
  DEFAULT_EXAMINER_TYPE,
  DEFAULT_ATTACK_POINTS,
  PROBING_RULES,
  ESCALATION_RULES,
} from "../src/persona.js";
import { QUESTION_BANK, CRITIQUE_MODULES } from "../src/questionBank.js";

describe("persona", () => {
  it("default attack points are empty (optional)", () => {
    expect(DEFAULT_ATTACK_POINTS).toBe("");
  });

  it("includes the short-output instruction", () => {
    const p = buildPersona("standar", "");
    expect(p).toMatch(/1–2 kalimat/);
    expect(p).toMatch(/35 kata/);
  });

  it("includes the selected mode's tone", () => {
    const galak = buildPersona("galak", "");
    expect(galak).toContain(EXAMINER_MODES.galak.tone);
    const santai = buildPersona("santai", "");
    expect(santai).toContain(EXAMINER_MODES.santai.tone);
    expect(santai).not.toContain(EXAMINER_MODES.galak.tone);
  });

  it("omits the attack-points block when attack points are empty/whitespace", () => {
    expect(buildPersona("standar", "")).not.toContain("POIN SERANGAN");
    expect(buildPersona("standar", "   \n  ")).not.toContain("POIN SERANGAN");
  });

  it("includes the attack-points block when provided", () => {
    const p = buildPersona("kritis", "Bab 3 metodologi lemah.");
    expect(p).toContain("POIN SERANGAN (prioritaskan):");
    expect(p).toContain("Bab 3 metodologi lemah.");
  });

  it("falls back to the default mode for an unknown mode", () => {
    expect(buildPersona("tidak-ada", "")).toContain(
      EXAMINER_MODES[DEFAULT_EXAMINER_MODE].tone,
    );
  });
});

describe("persona probing rules", () => {
  it("embeds the probing and escalation rules", () => {
    const p = buildPersona("standar", "");
    expect(p).toContain(PROBING_RULES);
    expect(p).toContain(ESCALATION_RULES);
  });

  it("forbids moving on when an answer lacks specifics", () => {
    expect(PROBING_RULES).toMatch(/JANGAN pindah topik/);
    expect(PROBING_RULES).toMatch(/bab\/halaman\/tabel/);
  });

  it("caps follow-ups so the examiner cannot stall on one topic", () => {
    expect(ESCALATION_RULES).toMatch(/Maksimal 3 follow-up/);
  });

  it("targets 8-15 main questions per sidang", () => {
    expect(buildPersona("standar", "")).toMatch(/8–15 pertanyaan utama/);
  });
});

describe("persona examiner types", () => {
  it("includes the selected archetype's focus and not the others", () => {
    const teknis = buildPersona("standar", "", "teknis");
    expect(teknis).toContain(EXAMINER_TYPES.teknis.focus);
    expect(teknis).not.toContain(EXAMINER_TYPES.metodolog.focus);
  });

  it("defaults to the umum archetype when no type is given", () => {
    expect(buildPersona("standar", "")).toContain(
      EXAMINER_TYPES[DEFAULT_EXAMINER_TYPE].focus,
    );
  });

  it("falls back to the default archetype for an unknown type", () => {
    expect(buildPersona("standar", "", "tidak-ada")).toContain(
      EXAMINER_TYPES[DEFAULT_EXAMINER_TYPE].focus,
    );
  });
});

describe("persona question bank", () => {
  it("embeds a question from every core phase", () => {
    const p = buildPersona("standar", "");
    for (const phase of ["Metodologi", "Hasil & Pembahasan", "Kesimpulan & Kontribusi"]) {
      expect(p).toContain(QUESTION_BANK[phase][0]);
    }
  });

  it("tells the model to adapt rather than read the bank verbatim", () => {
    expect(buildPersona("standar", "")).toMatch(/Jangan membacakan pertanyaan apa adanya/);
  });

  it("embeds the conditional critique modules", () => {
    expect(buildPersona("standar", "")).toContain(CRITIQUE_MODULES);
    expect(CRITIQUE_MODULES).toMatch(/BUKAN persentase/);
    expect(CRITIQUE_MODULES).toMatch(/halusinasi/);
    expect(CRITIQUE_MODULES).toMatch(/krisis/);
  });
});

import { SIDANG_PHASES, buildAgendaRules } from "../src/persona.js";
import { CLOSE_MARKER } from "../src/sidang.js";

describe("persona agenda", () => {
  it("lists all sidang phases in order", () => {
    expect(SIDANG_PHASES[0]).toBe("Pembukaan");
    expect(SIDANG_PHASES[SIDANG_PHASES.length - 1]).toBe("Penutup");
    expect(SIDANG_PHASES).toContain("Metodologi");
  });

  it("agenda rules instruct to use the marker only when done", () => {
    const rules = buildAgendaRules();
    expect(rules).toContain(CLOSE_MARKER);
    expect(rules).toMatch(/JANGAN menyatakan sidang selesai/);
  });

  it("buildPersona embeds the agenda and the marker rule", () => {
    const p = buildPersona("standar", "");
    expect(p).toContain("AGENDA SIDANG");
    expect(p).toContain(CLOSE_MARKER);
  });
});
