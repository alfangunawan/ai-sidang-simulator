import { describe, it, expect } from "vitest";
import { turnsToCsv } from "./csv.js";

describe("turnsToCsv", () => {
  it("numbers rows, labels roles, and CSV-escapes commas/quotes/newlines", () => {
    const csv = turnsToCsv([
      { role: "user", content: "halo" },
      { role: "examiner", content: 'ya, "benar"\nlanjut' },
    ]);
    expect(csv).toBe(
      [
        "no,peran,isi",
        "1,Anda,halo",
        '2,Penguji,"ya, ""benar""',
        'lanjut"',
      ].join("\n"),
    );
  });

  it("produces just the header for no turns", () => {
    expect(turnsToCsv([])).toBe("no,peran,isi");
  });
});
