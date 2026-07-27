import { describe, it, expect, vi, afterEach } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { recordUsage, getUsageView, resetUsage } from "../src/repos/usage.js";
import type { TokenUsage } from "../src/providers/types.js";

afterEach(() => vi.restoreAllMocks());

function usage(over: Partial<TokenUsage> = {}): TokenUsage {
  return {
    input_tokens: 1000,
    output_tokens: 50,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0.001,
    ...over,
  };
}

function seedUser(db: ReturnType<typeof openDb>) {
  return createUser(db, "tester", "h", "2026-01-01T00:00:00Z");
}

describe("usage repo", () => {
  it("reports zeroes and a null start on an empty table", () => {
    const db = openDb(":memory:");
    const u = seedUser(db);
    const view = getUsageView(db, u);
    expect(view.total).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: 0,
      calls: 0,
    });
    expect(view.by_kind).toEqual([]);
    expect(view.since).toBeNull();
  });

  it("sums across calls and splits the totals by kind", () => {
    const db = openDb(":memory:");
    const u = seedUser(db);
    recordUsage(db, u, "2026-01-01T00:00:00Z", "claude", "m", "turn", usage());
    recordUsage(db, u, "2026-01-01T00:01:00Z", "claude", "m", "turn", usage({ cache_read_tokens: 900 }));
    recordUsage(db, u, "2026-01-01T00:02:00Z", "claude", "m", "assessment", usage({ output_tokens: 400 }));

    const view = getUsageView(db, u);
    expect(view.total.input_tokens).toBe(3000);
    expect(view.total.output_tokens).toBe(500);
    expect(view.total.cache_read_tokens).toBe(900);
    expect(view.total.calls).toBe(3);
    expect(view.total.cost_usd).toBeCloseTo(0.003, 6);
    expect(view.since).toBe("2026-01-01T00:00:00Z");

    const byKind = Object.fromEntries(view.by_kind.map((k) => [k.kind, k.totals]));
    expect(byKind.turn.calls).toBe(2);
    expect(byKind.assessment.output_tokens).toBe(400);
  });

  it("ignores a call that reported no usage", () => {
    const db = openDb(":memory:");
    const u = seedUser(db);
    recordUsage(db, u, "2026-01-01T00:00:00Z", "claude", "m", "turn", undefined);
    expect(getUsageView(db, u).total.calls).toBe(0);
  });

  it("swallows a write failure so accounting cannot break a turn", () => {
    const db = openDb(":memory:");
    const u = seedUser(db);
    db.exec("DROP TABLE usage_events");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      recordUsage(db, u, "2026-01-01T00:00:00Z", "claude", "m", "turn", usage()),
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("reset clears every recorded event", () => {
    const db = openDb(":memory:");
    const u = seedUser(db);
    recordUsage(db, u, "2026-01-01T00:00:00Z", "claude", "m", "turn", usage());
    resetUsage(db, u);
    expect(getUsageView(db, u).total.calls).toBe(0);
  });
});
