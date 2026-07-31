import { describe, it, expect } from "vitest";
import { PERSONAS, personaFor } from "./personas.js";

describe("personaFor", () => {
  it("finds a persona in the supplied list", () => {
    const hit = personaFor(PERSONAS, "santai", "umum");
    expect(hit.key).toBe("hendra");
  });

  // Persona bisa dihapus admin di tengah sidang yang sedang berjalan; header
  // sidang harus tetap punya nama, bukan undefined.
  it("falls back to a plain examiner when the pair is missing", () => {
    const hit = personaFor([], "galak", "domain");
    expect(hit.name).toBe("Penguji");
    expect(hit.mode).toBe("galak");
  });
});
