import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App.js";
import * as api from "./api.js";

// Modalnya sempat tidak muncul di produksi walau komponennya lolos tes sendiri:
// yang salah selalu di perakitan App, bukan di dalam modal. Tes ini menjaga
// jalur itu — login pertama harus membuka sambutan early access.
describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, "me").mockResolvedValue({ id: 1, username: "alfan", is_admin: false });
    vi.spyOn(api, "getSettings").mockRejectedValue(new Error("offline"));
    vi.spyOn(api, "listSessions").mockResolvedValue([]);
    vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens the early access welcome on first login", async () => {
    render(<App />);
    expect(await screen.findByLabelText(/Kode early access/)).toBeTruthy();
  });

  it("stays out of the way once it has been seen, but the banner reopens it", async () => {
    localStorage.setItem("sibiru_early_access", "1");
    render(<App />);
    await screen.findByText(/Siap latihan sidang/);
    expect(screen.queryByLabelText(/Kode early access/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Masukkan kode" }));
    expect(await screen.findByLabelText(/Kode early access/)).toBeTruthy();
  });
});
