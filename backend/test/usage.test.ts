import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { recordUsage, getUsageView, resetUsage } from "../src/repos/usage.js";

const U = { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.01 };

describe("per-user usage", () => {
  it("counts only the caller's events", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    recordUsage(db, u1, u1, "t", "claude", "m", "turn", U);
    recordUsage(db, u1, u1, "t", "claude", "m", "turn", U);
    recordUsage(db, u2, u2, "t", "claude", "m", "turn", U);
    expect(getUsageView(db, u1).total.calls).toBe(2);
    expect(getUsageView(db, u2).total.calls).toBe(1);
    resetUsage(db, u1);
    expect(getUsageView(db, u1).total.calls).toBe(0);
    expect(getUsageView(db, u2).total.calls).toBe(1); // untouched
  });
});
