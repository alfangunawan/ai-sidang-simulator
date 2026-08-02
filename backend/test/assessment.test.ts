import { describe, it, expect } from "vitest";
import {
  parseAssessment,
  deriveGrade,
  deriveVerdict,
  formatTranscript,
  buildAssessmentUser,
} from "../src/assessment.js";

const VALID = JSON.stringify({
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 90 },
  final_score: 79,
  grade: "AB",
  verdict: "Lulus dengan revisi",
  ringkasan: "Cukup baik.",
  kelebihan: ["Argumentasi kuat"],
  kekurangan: ["Metodologi tipis"],
  saran: ["Perkuat bab 3"],
});

describe("assessment helpers", () => {
  // Skema huruf mutu Telkom University: A >85, AB 75-85, B 65-75, BC 60-65,
  // C 50-60 (batas minimal lulus), D 40-50, E <=40.
  it("derives grade from the Telkom letter-grade bands", () => {
    expect(deriveGrade(90)).toBe("A");
    expect(deriveGrade(79)).toBe("AB");
    expect(deriveGrade(72)).toBe("B");
    expect(deriveGrade(62)).toBe("BC");
    expect(deriveGrade(55)).toBe("C");
    expect(deriveGrade(45)).toBe("D");
    expect(deriveGrade(30)).toBe("E");
  });

  it("derives verdict from score bands (lulus requires >50)", () => {
    expect(deriveVerdict(85)).toBe("Lulus");
    expect(deriveVerdict(65)).toBe("Lulus dengan revisi");
    expect(deriveVerdict(51)).toBe("Lulus dengan revisi");
    expect(deriveVerdict(50)).toBe("Tidak lulus");
  });

  it("formats a labelled transcript", () => {
    const t = formatTranscript([
      { role: "examiner", content: "Q1" },
      { role: "user", content: "A1" },
    ]);
    expect(t).toBe("Penguji: Q1\nMahasiswa: A1");
  });

  it("embeds skripsi + transcript in the user prompt", () => {
    const u = buildAssessmentUser("ISI", "TRX");
    expect(u).toContain("ISI");
    expect(u).toContain("TRX");
  });
});

describe("parseAssessment", () => {
  it("parses clean JSON", () => {
    const a = parseAssessment(VALID);
    expect(a.scores.penguasaan_materi).toBe(80);
    expect(a.final_score).toBe(79);
    expect(a.grade).toBe("AB");
    expect(a.kelebihan).toEqual(["Argumentasi kuat"]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const a = parseAssessment("Berikut hasilnya:\n```json\n" + VALID + "\n```\nSemoga membantu.");
    expect(a.final_score).toBe(79);
  });

  it("clamps out-of-range scores and derives final_score when missing", () => {
    const a = parseAssessment(
      JSON.stringify({
        scores: { penguasaan_materi: 120, metodologi: -5, kualitas_orisinalitas: 50, argumentasi: 50 },
      }),
    );
    expect(a.scores.penguasaan_materi).toBe(100);
    expect(a.scores.metodologi).toBe(0);
    expect(a.final_score).toBe(50); // avg of 100,0,50,50
    expect(a.grade).toBe(deriveGrade(50));
  });

  it("re-derives grade even when the model gives a wrong one", () => {
    const a = parseAssessment(JSON.stringify({ final_score: 90, grade: "D" }));
    expect(a.grade).toBe("A");
  });

  // Ditemukan di 3 dari 13 sidang uji: skor 41-50 keluar sebagai "D" tetapi
  // "Lulus dengan revisi", karena verdict model dipakai apa adanya asal
  // string-nya sah.
  it("re-derives verdict from the score, not from the model", () => {
    const failing = parseAssessment(
      JSON.stringify({ final_score: 45, verdict: "Lulus dengan revisi" }),
    );
    expect(failing.grade).toBe("D");
    expect(failing.verdict).toBe("Tidak lulus");

    const passing = parseAssessment(JSON.stringify({ final_score: 80, verdict: "Tidak lulus" }));
    expect(passing.verdict).toBe("Lulus");
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseAssessment("maaf, tidak bisa menilai")).toThrow();
  });
});
