import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HomePage } from "./HomePage.js";
import * as api from "../api.js";

const props = {
  mic: "idle" as const,
  resumable: false,
  onStart: vi.fn(),
  onResume: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenSession: vi.fn(),
  onOpenSettings: vi.fn(),
  onTestMic: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(api, "listSessions").mockResolvedValue([
    {
      id: "s2",
      created_at: "2026-07-30T08:02:00.000Z",
      label: "Fokus metodologi",
      turn_count: 28,
      status: "closed",
      final_score: 71,
    },
  ]);
  vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
  vi.spyOn(api, "getSettings").mockResolvedValue({
    provider: "claude",
    model: "claude-sonnet-5",
    has_api_key: true,
  } as any);
});
afterEach(() => vi.restoreAllMocks());

describe("HomePage", () => {
  it("flags a missing skripsi and routes the fix to Pengaturan", async () => {
    const onOpenSettings = vi.fn();
    const { container } = render(<HomePage {...props} onOpenSettings={onOpenSettings} />);

    const row = await screen.findByText("Belum diunggah");
    expect(row.closest(".ready-row")?.querySelector(".ready-dot.warn")).toBeTruthy();

    fireEvent.click(screen.getByText("Unggah"));
    expect(onOpenSettings).toHaveBeenCalled();
    // the model row is satisfied, so it must not raise the same flag
    expect(container.querySelectorAll(".ready-dot.warn")).toHaveLength(2); // skripsi + mic
  });

  it("shows the last scored session with its grade", async () => {
    const { container } = render(<HomePage {...props} />);
    await waitFor(() => expect(screen.getByText("Fokus metodologi")).toBeTruthy());
    const card = container.querySelector(".score-card");
    expect(card?.textContent).toContain("71");
    expect(card?.textContent).toContain("/100 · B"); // 71 → B, same table as the backend
  });

  it("offers to resume only while a sitting is still open", async () => {
    const onResume = vi.fn();
    const { rerender } = render(<HomePage {...props} />);
    expect(screen.queryByText("Lanjutkan Sidang")).toBeNull();
    expect(screen.getByText("Mulai Latihan Sidang")).toBeTruthy();

    rerender(<HomePage {...props} resumable onResume={onResume} />);
    fireEvent.click(screen.getByText("Lanjutkan Sidang"));
    expect(onResume).toHaveBeenCalled();
    expect(screen.getByText("Mulai Sesi Baru")).toBeTruthy();
  });
});
