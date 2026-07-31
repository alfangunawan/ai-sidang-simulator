import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupModal } from "./SetupModal.js";
import { DEFAULT_PERSONA, PERSONAS } from "../personas.js";

// The dialog's step lives in App; this harness stands in for it.
function Harness({ onStart, from = 1 }: { onStart: (p: any) => void; from?: 1 | 2 }) {
  const [step, setStep] = useState<0 | 1 | 2>(from);
  if (step === 0) return <p>ditutup</p>;
  return (
    <SetupModal
      step={step}
      initial={DEFAULT_PERSONA}
      personas={PERSONAS}
      mic="idle"
      starting={false}
      onStep={setStep}
      onMic={vi.fn()}
      onStart={onStart}
    />
  );
}

describe("SetupModal", () => {
  it("carries the picked examiner through both steps into onStart", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} />);

    fireEvent.click(screen.getByText("Prof. Dr. Bambang Sutrisno"));
    fireEvent.click(screen.getByText("Lanjut"));

    // step 2 confirms who is waiting before the sidang opens
    expect(screen.getByText("Cek kesiapan Anda")).toBeTruthy();
    expect(screen.getByText(/Penguji: Prof. Dr. Bambang Sutrisno/)).toBeTruthy();

    fireEvent.click(screen.getByText("Mulai Sidang"));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ key: "bambang", mode: "galak", type: "domain" }),
    );
  });

  it("opened as a bare mic test, closes instead of falling back to the picker", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} from={2} />);

    expect(screen.getByText("Cek kesiapan Anda")).toBeTruthy();
    expect(screen.queryByText("Kembali")).toBeNull();

    fireEvent.click(screen.getByText("Tutup"));
    expect(screen.getByText("ditutup")).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("Batal on step 1 closes without starting anything", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} />);
    fireEvent.click(screen.getByText("Batal"));
    expect(screen.getByText("ditutup")).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
  });
});
