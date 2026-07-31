import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Overview } from "./Overview.js";
import * as adminApi from "../../adminApi.js";

function baseOverview(signups: { day: string; count: number }[]) {
  return {
    users: 12,
    sessions: 34,
    documents: 9,
    turns: 210,
    cost_usd: 1.5,
    tokens: 4000,
    top_spenders: [],
    signups,
  };
}

// jsdom never lays anything out, so it cannot catch a bar that measures 0px in
// a real browser (that needs the flex/height fix verified visually). What it
// *can* catch: the inline height style computing the wrong percentage, or
// blowing up into NaN when every day is zero.
describe("Overview signup chart", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sets each bar's inline height to its share of the peak day", async () => {
    const signups = [
      { day: "2026-07-18", count: 0 },
      { day: "2026-07-19", count: 5 },
      { day: "2026-07-20", count: 10 },
    ];
    vi.spyOn(adminApi, "getOverview").mockResolvedValue(baseOverview(signups) as any);
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue([]);
    render(<Overview />);

    await screen.findByText("12");
    const bars = document.querySelectorAll<HTMLElement>("[title] > div");
    expect(bars).toHaveLength(3);
    expect(bars[0].style.height).toBe("0%");
    expect(bars[1].style.height).toBe("50%");
    expect(bars[2].style.height).toBe("100%");
  });

  it("renders 14 zero-height bars — no NaN, no division by zero — when every day is 0", async () => {
    const signups = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-07-${String(i + 18).padStart(2, "0")}`,
      count: 0,
    }));
    vi.spyOn(adminApi, "getOverview").mockResolvedValue(baseOverview(signups) as any);
    vi.spyOn(adminApi, "listAllSessions").mockResolvedValue([]);
    render(<Overview />);

    await screen.findByText("12");
    const bars = document.querySelectorAll<HTMLElement>("[title] > div");
    expect(bars).toHaveLength(14);
    bars.forEach((bar) => expect(bar.style.height).toBe("0%"));
  });
});
