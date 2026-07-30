import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingPage } from "./LandingPage.js";

describe("LandingPage", () => {
  it("swaps the examiner card when mode and type change", () => {
    render(<LandingPage onStart={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Penguji Kritis · Metodolog/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Galak" }));
    fireEvent.click(screen.getByRole("button", { name: "Ketua Sidang" }));

    expect(screen.getByRole("heading", { name: /Penguji Galak · Ketua Sidang/ })).toBeTruthy();
    expect(screen.getByText(/Rangkum sendiri poin kunci fase ini/)).toBeTruthy();
  });

  it("toggles a FAQ item open and closed", () => {
    render(<LandingPage onStart={vi.fn()} />);
    const q = screen.getByRole("button", { name: /Saya harus punya API key sendiri/ });

    fireEvent.click(q);
    expect(q.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/SiBiru memakai key Anda sendiri/)).toBeTruthy();

    fireEvent.click(q);
    expect(q.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/SiBiru memakai key Anda sendiri/)).toBeNull();
  });

  it("keeps a revealed FAQ row visible after it is toggled", () => {
    render(<LandingPage onStart={vi.fn()} />);
    const row = screen.getByRole("button", { name: /Saya harus punya API key sendiri/ }).parentElement!;
    expect(row.hasAttribute("data-in")).toBe(true);

    fireEvent.click(row.querySelector("button")!);

    // re-rendering with the "open" class must not drop the reveal flag
    expect(row.hasAttribute("data-in")).toBe(true);
  });

  it("routes every CTA to onStart", () => {
    const onStart = vi.fn();
    render(<LandingPage onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    fireEvent.click(screen.getByRole("button", { name: "Mulai latihan gratis" }));
    fireEvent.click(screen.getByRole("button", { name: "Mulai latihan sekarang" }));
    expect(onStart).toHaveBeenCalledTimes(3);
  });
});
