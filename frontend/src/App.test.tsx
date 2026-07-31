import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App.js";
import * as api from "./api.js";
import { PERSONAS } from "./personas.js";

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

  // Picker ini mengandalkan PERSONAS statis sebagai nilai awal App, bukan [];
  // kalau seed itu pernah dihapus, tes ini gagal sebelum mahasiswa yang
  // menemukan penguji tanpa nama.
  it("shows all six named personas in the picker while the persona fetch is still in flight", async () => {
    localStorage.setItem("sibiru_early_access", "1");
    vi.spyOn(api, "getSkripsi").mockResolvedValue({
      filename: "skripsi.pdf",
      char_count: 100,
      uploaded_at: "2026-01-01",
      dossier_status: "ready",
    });
    vi.spyOn(api, "getPersonas").mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    await screen.findByText(/Siap latihan sidang/);

    fireEvent.click(screen.getByRole("button", { name: "Mulai Latihan Sidang" }));

    await screen.findByText("Pilih dosen penguji Anda");
    for (const p of PERSONAS) expect(screen.getByText(p.name)).toBeTruthy();
  });
});
