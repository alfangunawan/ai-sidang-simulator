import { describe, it, expect } from "vitest";
import {
  CLOSE_MARKER,
  MIN_EXAMINER_QUESTIONS,
  CLOSE_COOLDOWN,
  stripCloseMarker,
  shouldProposeClose,
} from "../src/sidang.js";

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
