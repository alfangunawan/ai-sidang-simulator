import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DossierProgress } from "./DossierProgress.js";

afterEach(() => vi.useRealTimers());

describe("DossierProgress", () => {
  it("names the stage in progress and keeps the clock running", () => {
    vi.useFakeTimers();
    render(<DossierProgress charCount={145230} />);

    expect(screen.getByText("Teks terekstraksi")).toBeTruthy();
    expect(screen.getByText(/145\.230 karakter/)).toBeTruthy();
    expect(screen.getByText(/^· 0:00/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByText(/^· 1:05/)).toBeTruthy();
  });
});
