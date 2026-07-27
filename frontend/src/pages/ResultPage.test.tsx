import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultPage } from "./ResultPage.js";
import type { Assessment } from "../types.js";

const A: Assessment = {
  scores: { penguasaan_materi: 80, metodologi: 70, kualitas_orisinalitas: 75, argumentasi: 88 },
  final_score: 78,
  grade: "B",
  verdict: "Lulus dengan revisi",
  ringkasan: "Sidang berjalan baik.",
  kelebihan: ["Argumentasi kuat"],
  kekurangan: ["Metodologi kurang dalam"],
  saran: ["Perkuat bab 3"],
};

describe("ResultPage", () => {
  it("renders score, grade, verdict, dimensions and feedback", () => {
    render(<ResultPage assessment={A} onNewSession={() => {}} onBack={() => {}} />);
    expect(screen.getByText("78")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("Lulus dengan revisi")).toBeTruthy();
    expect(screen.getByText("Penguasaan Materi")).toBeTruthy();
    expect(screen.getByText("Argumentasi kuat")).toBeTruthy();
    expect(screen.getByText("Perkuat bab 3")).toBeTruthy();
  });

  it("exports through the print dialog under a dated document title, then restores it", () => {
    const original = document.title;
    let titleWhilePrinting = "";
    const print = vi.fn(() => {
      // The document title is what the browser offers as the PDF filename.
      titleWhilePrinting = document.title;
      window.dispatchEvent(new Event("afterprint"));
    });
    vi.stubGlobal("print", print);

    render(<ResultPage assessment={A} onNewSession={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByText(/Export PDF/));

    expect(print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toMatch(/Penilaian Sidang/);
    expect(document.title).toBe(original);
    vi.unstubAllGlobals();
  });

  it("wires the action buttons", () => {
    const onNewSession = vi.fn();
    const onBack = vi.fn();
    render(<ResultPage assessment={A} onNewSession={onNewSession} onBack={onBack} />);
    fireEvent.click(screen.getByText("Sesi Baru"));
    fireEvent.click(screen.getByText(/Kembali/));
    expect(onNewSession).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
