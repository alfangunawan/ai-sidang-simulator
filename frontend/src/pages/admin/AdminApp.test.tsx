import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminApp } from "./AdminApp.js";
import * as adminApi from "../../adminApi.js";

const OVERVIEW = {
  users: 12,
  sessions: 34,
  documents: 9,
  turns: 210,
  cost_usd: 1.5,
  tokens: 4000,
  top_spenders: [{ user_id: 2, username: "budi", cost_usd: 1.5, tokens: 4000 }],
  signups: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-07-${String(i + 18).padStart(2, "0")}`,
    count: i,
  })),
};

describe("AdminApp", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getOverview").mockResolvedValue(OVERVIEW as any);
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the section nav and the overview counters", async () => {
    render(<AdminApp user={{ id: 1, username: "alfan", is_admin: true }} />);
    // Token, bukan jumlah pengguna: angka pengguna juga muncul sebagai hitungan
    // di samping menu, jadi "12" tidak lagi menunjuk satu elemen.
    expect(await screen.findByText("4.000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pengguna" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ringkasan" })).toBeTruthy();
  });

  // Angka biaya tidak boleh dibaca sebagai kebenaran: provider Claude langsung
  // selalu menulis cost_usd 0, jadi labelnya harus menyebut batasannya.
  it("labels the cost figure as router-only", async () => {
    render(<AdminApp user={{ id: 1, username: "alfan", is_admin: true }} />);
    expect(await screen.findByText(/router saja/i)).toBeTruthy();
  });
});
