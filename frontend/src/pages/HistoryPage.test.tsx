import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { HistoryPage } from "./HistoryPage.js";
import * as api from "../api.js";
import * as csv from "../lib/csv.js";

beforeEach(() => {
  vi.spyOn(api, "listSessions").mockResolvedValue([
    {
      id: "s1",
      created_at: "2026-07-25T14:30:00Z",
      label: null,
      turn_count: 4,
      status: "active",
      final_score: null,
    },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("HistoryPage", () => {
  it("lists past sessions with their turn count", async () => {
    render(<HistoryPage onOpenResult={vi.fn()} />);
    expect(await screen.findByText(/4 percakapan/)).toBeTruthy();
  });

  it("deletes a session after confirming", async () => {
    const del = vi.spyOn(api, "deleteSession").mockResolvedValue();
    render(<HistoryPage onOpenResult={vi.fn()} />);
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

    render(<HistoryPage onOpenResult={vi.fn()} />);
    await screen.findByText(/4 percakapan/);
    fireEvent.click(screen.getByText("Buka"));

    await screen.findByText("pertanyaan?");
    fireEvent.click(screen.getByText("Export CSV"));

    expect(download).toHaveBeenCalledTimes(1);
    const [, csvText] = download.mock.calls[0];
    expect(csvText).toContain("no,peran,isi");
    expect(csvText).toContain("Penguji,pertanyaan?");
  });

  it("shows Lihat Hasil for closed sessions and calls onOpenResult", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([
      {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        label: null,
        turn_count: 12,
        status: "closed",
        final_score: 82,
      },
    ]);
    const onOpenResult = vi.fn();
    render(<HistoryPage onOpenResult={onOpenResult} />);
    await waitFor(() => expect(screen.getByText("Lihat Hasil")).toBeTruthy());
    expect(screen.getByText(/Skor 82/)).toBeTruthy();
    fireEvent.click(screen.getByText("Lihat Hasil"));
    expect(onOpenResult).toHaveBeenCalledWith("s1");
  });

  // Sidang yang ditutup lewat "Keluar" tidak punya penilaian: menawarkan
  // "Lihat Hasil" di situ hanya menghasilkan tombol yang tidak melakukan apa-apa.
  it("offers grading, not a dead result button, for a sidang closed without a score", async () => {
    vi.spyOn(api, "listSessions").mockResolvedValue([
      {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        label: null,
        turn_count: 12,
        status: "closed",
        final_score: null,
      },
    ]);
    const close = vi.spyOn(api, "closeSession").mockResolvedValue({} as any);
    const onOpenResult = vi.fn();
    render(<HistoryPage onOpenResult={onOpenResult} />);

    await waitFor(() => expect(screen.getByText("Nilai")).toBeTruthy());
    expect(screen.queryByText("Lihat Hasil")).toBeNull();

    fireEvent.click(screen.getByText("Nilai"));
    await waitFor(() => expect(close).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(onOpenResult).toHaveBeenCalledWith("s1"));
  });
});
