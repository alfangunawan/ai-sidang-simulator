import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import * as api from "../api.js";

beforeEach(() => {
  vi.spyOn(api, "getSettings").mockResolvedValue({
    provider: "claude",
    model: "claude-sonnet-5",
    has_api_key: false,
    attack_points: "POIN A",
    examiner_mode: "standar",
    examiner_modes: [
      { value: "santai", label: "Santai" },
      { value: "standar", label: "Standar" },
      { value: "kritis", label: "Kritis" },
      { value: "galak", label: "Galak" },
    ],
  });
  vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("loads settings and shows key-not-stored state", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Key tersimpan: tidak/)).toBeTruthy());
    expect(screen.getByText(/Belum ada skripsi/)).toBeTruthy();
  });

  it("keeps skripsi state and shows error when delete fails", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({
      filename: "x.pdf",
      char_count: 10,
      uploaded_at: "t",
    });
    vi.spyOn(api, "deleteSkripsi").mockRejectedValue(new Error("gagal hapus"));

    render(<SettingsPage />);
    expect(await screen.findByText(/x\.pdf/)).toBeTruthy();

    fireEvent.click(screen.getByText("Hapus"));

    expect(await screen.findByText("gagal hapus")).toBeTruthy();
    expect(screen.getByText(/x\.pdf/)).toBeTruthy();
  });
});
