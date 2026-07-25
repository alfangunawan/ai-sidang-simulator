import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { HistoryPage } from "./HistoryPage.js";
import * as api from "../api.js";
import * as csv from "../lib/csv.js";

beforeEach(() => {
  vi.spyOn(api, "listSessions").mockResolvedValue([
    { id: "s1", created_at: "2026-07-25T14:30:00Z", label: null, turn_count: 4 },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("HistoryPage", () => {
  it("lists past sessions with their turn count", async () => {
    render(<HistoryPage />);
    expect(await screen.findByText(/4 percakapan/)).toBeTruthy();
  });

  it("deletes a session after confirming", async () => {
    const del = vi.spyOn(api, "deleteSession").mockResolvedValue();
    render(<HistoryPage />);
    await screen.findByText(/4 percakapan/);

    fireEvent.click(screen.getByText("Hapus"));
    fireEvent.click(screen.getByText("Ya, hapus"));

    await waitFor(() => expect(del).toHaveBeenCalledWith("s1"));
    await waitFor(() =>
      expect(screen.queryByText(/4 percakapan/)).toBeNull(),
    );
  });

  it("exports a session to CSV from the detail view", async () => {
    vi.spyOn(api, "getTurns").mockResolvedValue([
      { role: "user", content: "halo" },
      { role: "examiner", content: "pertanyaan?" },
    ]);
    const download = vi.spyOn(csv, "downloadCsv").mockImplementation(() => {});

    render(<HistoryPage />);
    await screen.findByText(/4 percakapan/);
    fireEvent.click(screen.getByText("Buka"));

    await screen.findByText("pertanyaan?");
    fireEvent.click(screen.getByText("Export CSV"));

    expect(download).toHaveBeenCalledTimes(1);
    const [, csvText] = download.mock.calls[0];
    expect(csvText).toContain("no,peran,isi");
    expect(csvText).toContain("Penguji,pertanyaan?");
  });
});
