import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { listPersonas, upsertPersona, deletePersona, seedPersonas } from "../src/repos/personas.js";
import { PERSONA_SEED } from "../src/personas.js";

describe("personas repo", () => {
  it("seeds the six presets on a fresh db and does not duplicate on reseed", () => {
    const db = openDb(":memory:");
    expect(listPersonas(db).map((p) => p.key)).toEqual(PERSONA_SEED.map((p) => p.key));
    seedPersonas(db);
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length);
  });

  it("upserts by key and orders by position", () => {
    const db = openDb(":memory:");
    upsertPersona(db, {
      key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
      mode: "kritis", type: "domain", color: "#123456", trait: "Baru.",
      position: 99, active: true,
    });
    const list = listPersonas(db);
    expect(list.at(-1)!.key).toBe("zaki");

    upsertPersona(db, { ...list.at(-1)!, name: "Dr. Zaki Rahman" });
    expect(listPersonas(db).find((p) => p.key === "zaki")!.name).toBe("Dr. Zaki Rahman");
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length + 1);
  });

  it("hides inactive personas from the list", () => {
    const db = openDb(":memory:");
    const first = listPersonas(db)[0];
    upsertPersona(db, { ...first, active: false });
    expect(listPersonas(db).some((p) => p.key === first.key)).toBe(false);
    expect(listPersonas(db, { includeInactive: true }).some((p) => p.key === first.key)).toBe(true);
  });

  it("deletes a persona", () => {
    const db = openDb(":memory:");
    deletePersona(db, PERSONA_SEED[0].key);
    expect(listPersonas(db)).toHaveLength(PERSONA_SEED.length - 1);
  });
});
