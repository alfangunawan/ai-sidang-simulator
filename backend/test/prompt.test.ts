import { describe, it, expect } from "vitest";
import { mapHistory, trimHistory } from "../src/prompt.js";
import type { Turn } from "../src/providers/types.js";

const long = (n: number) => "x".repeat(n);

// Sidang panjang: 10 tanya-jawab, jawaban mahasiswa sepanjang rata-rata nyata.
function session(pairs: number): Turn[] {
  const out: Turn[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ role: "examiner", content: `Pertanyaan ${i} ${long(300)}` });
    out.push({ role: "user", content: `Jawaban ${i} ${long(580)}` });
  }
  return out;
}

describe("mapHistory", () => {
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

  // Pemangkasan duduk di dalam mapHistory supaya tak ada jalur provider yang
  // bisa melewatinya.
  it("trims on the way through, so no provider path can skip it", () => {
    const mapped = mapHistory(session(10));
    expect(mapped.some((m) => m.content.endsWith("…"))).toBe(true);
  });
});

describe("trimHistory", () => {
  it("leaves a short history untouched", () => {
    const h = session(3).slice(0, 6);
    expect(trimHistory(h)).toEqual(h);
  });

  it("keeps the last six turns verbatim", () => {
    const h = session(10);
    const out = trimHistory(h);
    expect(out.slice(-6)).toEqual(h.slice(-6));
  });

  // Persona melarang mengulang pertanyaan yang sudah diajukan; penguji hanya
  // bisa mematuhinya kalau pertanyaan lamanya masih terbaca utuh.
  it("never truncates an examiner question, however old", () => {
    const out = trimHistory(session(10));
    for (const t of out.filter((x) => x.role === "examiner")) {
      expect(t.content).not.toMatch(/…$/);
      expect(t.content.length).toBeGreaterThan(300);
    }
  });

  it("truncates only older student answers, and marks them", () => {
    const out = trimHistory(session(10));
    const olderAnswers = out.slice(0, -6).filter((t) => t.role === "user");
    expect(olderAnswers.length).toBeGreaterThan(0);
    for (const t of olderAnswers) {
      expect(t.content).toMatch(/…$/);
      expect(t.content.length).toBeLessThanOrEqual(201);
      // Awal jawaban dipertahankan — di situ mahasiswa menyebut intinya.
      expect(t.content.startsWith("Jawaban")).toBe(true);
    }
  });

  it("leaves a short old answer alone rather than adding an ellipsis", () => {
    const h = session(10);
    h[0] = { role: "examiner", content: "Q" };
    h[1] = { role: "user", content: "Ya, 113 responden." };
    expect(trimHistory(h)[1].content).toBe("Ya, 113 responden.");
  });

  it("does not mutate the turns it was given", () => {
    const h = session(10);
    const before = h[1].content;
    trimHistory(h);
    expect(h[1].content).toBe(before);
  });

  // ~34% terpangkas, bukan separuh: pertanyaan penguji sengaja dibiarkan utuh
  // dan pada sidang panjang merekalah bagian terbesar yang tersisa.
  it("cuts about a third off a long sidang", () => {
    const h = session(15);
    const size = (ts: Turn[]) => ts.reduce((n, t) => n + t.content.length, 0);
    const ratio = size(trimHistory(h)) / size(h);
    expect(ratio).toBeLessThan(0.7);
    expect(ratio).toBeGreaterThan(0.55);
  });
});
