import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { recordUsage, getKeyUsageView, getUsageView } from "../src/repos/usage.js";

const U = { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.02 };

describe("key-owner usage", () => {
  it("aggregates borrowed usage under the key owner, per member", () => {
    const db = openDb(":memory:");
    const host = createUser(db, "host", "h", "t");
    const m1 = createUser(db, "m1", "h", "t");
    // m1 borrows host's key twice; host uses own key once
    recordUsage(db, m1, host, "t", "claude", "m", "turn", U);
    recordUsage(db, m1, host, "t", "claude", "m", "assessment", U);
    recordUsage(db, host, host, "t", "claude", "m", "turn", U);

    const view = getKeyUsageView(db, host);
    expect(view.total.calls).toBe(2); // only borrowed (user_id != host), both by m1
    expect(view.by_member).toEqual([{ member_user_id: m1, username: "m1", totals: expect.objectContaining({ calls: 2 }) }]);

    // member's own view still counts all their own calls
    expect(getUsageView(db, m1).total.calls).toBe(2);
    expect(getUsageView(db, host).total.calls).toBe(1);
  });
});
