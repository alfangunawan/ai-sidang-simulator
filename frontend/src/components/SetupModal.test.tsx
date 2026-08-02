import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupModal } from "./SetupModal.js";
import { DEFAULT_PERSONA, PERSONAS } from "../personas.js";
import { ALL_PHASES } from "../phases.js";

// The dialog's step lives in App; this harness stands in for it.
function Harness({
  onStart,
  from = 1,
}: {
  onStart: (p: any, phases: string[]) => void;
  from?: 1 | 3;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(from);
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
  it("carries the picked examiner and every bab through the three steps into onStart", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} />);

    fireEvent.click(screen.getByText("Prof. Dr. Bambang Sutrisno"));
    fireEvent.click(screen.getByText("Lanjut"));

    // step 2 opens with every bab already on: a full sidang is the default
    expect(screen.getByText("Pilih bab yang diuji")).toBeTruthy();
    expect(screen.getByText(`${ALL_PHASES.length} dari ${ALL_PHASES.length} bab diuji`)).toBeTruthy();
    fireEvent.click(screen.getByText("Lanjut"));

    // step 3 confirms who is waiting before the sidang opens
    expect(screen.getByText("Cek kesiapan Anda")).toBeTruthy();
    expect(screen.getByText(/Penguji: Prof. Dr. Bambang Sutrisno/)).toBeTruthy();

    fireEvent.click(screen.getByText("Mulai Sidang"));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ key: "bambang", mode: "galak", type: "domain" }),
      ALL_PHASES,
    );
  });

  it("starts with only the bab left switched on, in agenda order", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} />);
    fireEvent.click(screen.getByText("Lanjut"));

    // Off with Bab I and Bab IV; the two remaining keep their agenda order.
    fireEvent.click(screen.getByText(/Bab I — /));
    fireEvent.click(screen.getByText(/Bab IV — /));
    fireEvent.click(screen.getByText(/Bab V — /));
    expect(screen.getByText(`2 dari ${ALL_PHASES.length} bab diuji`)).toBeTruthy();

    fireEvent.click(screen.getByText("Lanjut"));
    fireEvent.click(screen.getByText("Mulai Sidang"));
    expect(onStart).toHaveBeenCalledWith(expect.anything(), [
      "Tinjauan Pustaka",
      "Metodologi",
    ]);
  });

  it("refuses to move on when every bab is switched off", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} />);
    fireEvent.click(screen.getByText("Lanjut"));
    for (const bab of ["Bab I — ", "Bab II — ", "Bab III — ", "Bab IV — ", "Bab V — "]) {
      fireEvent.click(screen.getByText(new RegExp(bab)));
    }

    expect(screen.getByText("Pilih minimal satu bab untuk diuji.")).toBeTruthy();
    fireEvent.click(screen.getByText("Lanjut"));
    expect(screen.getByText("Pilih bab yang diuji")).toBeTruthy(); // still on step 2
  });

  it("opened as a bare mic test, closes instead of falling back to the picker", () => {
    const onStart = vi.fn();
    render(<Harness onStart={onStart} from={3} />);

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
