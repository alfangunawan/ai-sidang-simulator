import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { listQuestions, replacePhase, seedQuestions } from "../src/repos/questions.js";
import { QUESTION_BANK, buildPhaseBlock } from "../src/questionBank.js";

describe("question bank repo", () => {
  it("seeds from the constant on a fresh db and does not duplicate on reopen", () => {
    const db = openDb(":memory:");
    const first = listQuestions(db);
    expect(first["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);

    // openDb menyemai; menyemai lagi tidak boleh menggandakan apa pun.
    seedQuestions(db, QUESTION_BANK);
    expect(listQuestions(db)["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);
  });

  it("replaces one phase and leaves the others alone", () => {
    const db = openDb(":memory:");
    replacePhase(db, "Pembukaan", ["Pertanyaan baru?", "Dan satu lagi?"]);
    const bank = listQuestions(db);
    expect(bank["Pembukaan"]).toEqual(["Pertanyaan baru?", "Dan satu lagi?"]);
    expect(bank["Metodologi"]).toEqual(QUESTION_BANK["Metodologi"]);
  });

  // Menghapus semua pertanyaan sebuah fase lewat editor tidak boleh membuat
  // penguji kehabisan bahan di tengah sidang.
  it("falls back to the constant when a phase is emptied", () => {
    const db = openDb(":memory:");
    replacePhase(db, "Pembukaan", []);
    expect(listQuestions(db)["Pembukaan"]).toEqual(QUESTION_BANK["Pembukaan"]);
  });
});

describe("buildPhaseBlock with an injected bank", () => {
  it("uses the supplied bank and still defaults to the constant", () => {
    const custom = { ...QUESTION_BANK, Pembukaan: ["Pertanyaan khusus?"] };
    expect(buildPhaseBlock(0, [], custom)).toContain("Pertanyaan khusus?");
    expect(buildPhaseBlock(0, [])).toContain(QUESTION_BANK["Pembukaan"][0]);
  });
});
