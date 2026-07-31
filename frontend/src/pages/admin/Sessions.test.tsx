import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sessions } from "./Sessions.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    id: "s-1", user_id: 2, username: "budi", created_at: "2026-07-30T00:00:00.000Z",
    status: "closed", label: "Sidang 1", turn_count: 12, final_score: 78,
  },
];

describe("Sessions", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "getAdminSession").mockResolvedValue({
      session: ROWS[0],
      turns: [{ role: "examiner", content: "Apa rumusan masalahnya?" }],
      assessment: null,
    } as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists sessions with their owner and score", async () => {
    render(<Sessions />);
    expect(await screen.findByText("budi")).toBeTruthy();
    expect(screen.getByText("78")).toBeTruthy();
  });

  it("opens the transcript on demand", async () => {
    render(<Sessions />);
    fireEvent.click(await screen.findByRole("button", { name: /Lihat transkrip/ }));
    expect(await screen.findByText("Apa rumusan masalahnya?")).toBeTruthy();
  });

  it("renders a stalled session (0 turns, no score) as 0 and a dash, not blank", async () => {
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue([
      { ...ROWS[0], id: "s-2", turn_count: 0, final_score: null, status: "open" },
    ] as any);
    render(<Sessions />);
    await screen.findByText("budi");
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("surfaces an error when the transcript fetch fails, without opening a blank dialog", async () => {
    vi.spyOn(adminApi, "getAdminSession").mockRejectedValue(new Error("Sesi tidak ditemukan"));
    render(<Sessions />);
    fireEvent.click(await screen.findByRole("button", { name: /Lihat transkrip/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Sesi tidak ditemukan");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
