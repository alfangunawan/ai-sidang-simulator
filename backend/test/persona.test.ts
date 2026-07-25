import { describe, it, expect } from "vitest";
import {
  buildPersona,
  EXAMINER_MODES,
  DEFAULT_EXAMINER_MODE,
  DEFAULT_ATTACK_POINTS,
} from "../src/persona.js";

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
