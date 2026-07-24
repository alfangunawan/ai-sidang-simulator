import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import * as api from "../api.js";

beforeEach(() => {
  vi.spyOn(api, "getSettings").mockResolvedValue({
    provider: "claude",
    model: "claude-sonnet-5",
    has_api_key: false,
    attack_points: "POIN A",
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
});
