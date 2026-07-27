import { describe, it, expect } from "vitest";
import {
  CLOSE_MARKER,
  MIN_EXAMINER_QUESTIONS,
  CLOSE_COOLDOWN,
  NON_ANSWER_NUDGE,
  stripCloseMarker,
  shouldProposeClose,
  isNonAnswer,
  withNonAnswerNudge,
} from "../src/sidang.js";

describe("isNonAnswer", () => {
  it("flags bare prods that ask the examiner to move on", () => {
    for (const t of ["Lalu", "lanjut", "Lanjutkan pak", "terus?", "ya", "Oke", "sudah", "hmm", "Selanjutnya"]) {
      expect(isNonAnswer(t), t).toBe(true);
    }
  });

  it("flags an empty or whitespace-only message", () => {
    expect(isNonAnswer("   ")).toBe(true);
  });

  it("does not flag a real answer that merely opens with a prod word", () => {
    expect(isNonAnswer("Lalu saya memakai metode prototyping Pressman")).toBe(false);
    expect(isNonAnswer("Sudah dijelaskan di Bab 3 halaman 42")).toBe(false);
  });

  it("does not flag ordinary substantive answers", () => {
    expect(isNonAnswer("Skor SUS saya 78 dari 20 responden")).toBe(false);
  });
});

describe("withNonAnswerNudge", () => {
  it("appends the nudge to a prod without altering the original text", () => {
    const out = withNonAnswerNudge("Lalu");
    expect(out.startsWith("Lalu")).toBe(true);
    expect(out).toContain(NON_ANSWER_NUDGE);
  });

  it("leaves a substantive answer untouched", () => {
    const answer = "Responden UAT saya 15 orang, dipilih purposive.";
    expect(withNonAnswerNudge(answer)).toBe(answer);
  });
});

describe("stripCloseMarker", () => {
  it("removes the marker and trims trailing whitespace", () => {
    const out = stripCloseMarker(`Baik, saya rasa cukup.\n\n${CLOSE_MARKER}`);
    expect(out.hasMarker).toBe(true);
    expect(out.reply).toBe("Baik, saya rasa cukup.");
  });

  it("reports no marker and returns the reply unchanged (trimmed)", () => {
    const out = stripCloseMarker("Apa kontribusi utama Anda?");
    expect(out.hasMarker).toBe(false);
    expect(out.reply).toBe("Apa kontribusi utama Anda?");
  });
});

describe("shouldProposeClose", () => {
  it("is false without the marker", () => {
    expect(
      shouldProposeClose({ hasMarker: false, examinerCount: 20, declinedTurn: null }),
    ).toBe(false);
  });

  it("is false below the minimum-question floor", () => {
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: MIN_EXAMINER_QUESTIONS - 1,
        declinedTurn: null,
      }),
    ).toBe(false);
  });

  it("is true at/above the floor with the marker and no prior decline", () => {
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: MIN_EXAMINER_QUESTIONS,
        declinedTurn: null,
      }),
    ).toBe(true);
  });

  it("suppresses during the cooldown after a decline", () => {
    const declinedTurn = 12;
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: declinedTurn + CLOSE_COOLDOWN - 1,
        declinedTurn,
      }),
    ).toBe(false);
    expect(
      shouldProposeClose({
        hasMarker: true,
        examinerCount: declinedTurn + CLOSE_COOLDOWN,
        declinedTurn,
      }),
    ).toBe(true);
  });
});
