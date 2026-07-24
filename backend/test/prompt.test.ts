import { describe, it, expect } from "vitest";
import { buildSystemText, mapHistory } from "../src/prompt.js";
import type { Turn } from "../src/providers/types.js";

describe("prompt builder", () => {
  it("keeps persona and skripsi as separate strings", () => {
    const out = buildSystemText("PERSONA+ATTACK", "SKRIPSI TEXT");
    expect(out.persona).toBe("PERSONA+ATTACK");
    expect(out.skripsi).toBe("SKRIPSI TEXT");
  });

  it("maps examiner->assistant and user->user, preserving order", () => {
    const history: Turn[] = [
      { role: "examiner", content: "Apa kontribusi utama?" },
      { role: "user", content: "Arsitektur multi-flow." },
    ];
    expect(mapHistory(history)).toEqual([
      { role: "assistant", content: "Apa kontribusi utama?" },
      { role: "user", content: "Arsitektur multi-flow." },
    ]);
  });

  it("returns empty array for empty history", () => {
    expect(mapHistory([])).toEqual([]);
  });
});
