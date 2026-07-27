import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  freshInviteCode, getHostCollab, createCollab, setShares, regenerateCode, deleteCollab,
  getMembership, joinByCode, leave, listMembers, kickMember,
} from "../src/repos/collab.js";

function seed() {
  const db = openDb(":memory:");
  const host = createUser(db, "host", "h", "t");
  const m1 = createUser(db, "m1", "h", "t");
  const m2 = createUser(db, "m2", "h", "t");
  return { db, host, m1, m2 };
}

describe("collab repo", () => {
  it("hosts, shares, and lists/kicks members", () => {
    const { db, host, m1, m2 } = seed();
    createCollab(db, host, "CODE123", "t");
    setShares(db, host, { share_ai: 1, share_tts: 0, share_stt: 1 });
    const c = getHostCollab(db, host)!;
    expect(c).toMatchObject({ invite_code: "CODE123", share_ai: 1, share_tts: 0, share_stt: 1 });

    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: true });
    expect(joinByCode(db, m2, "CODE123", "t")).toEqual({ ok: true });
    expect(listMembers(db, host).map((m) => m.username).sort()).toEqual(["m1", "m2"]);

    const mem = getMembership(db, m1)!;
    expect(mem).toMatchObject({ host_user_id: host, share_ai: 1, share_stt: 1 });

    kickMember(db, host, m1);
    expect(getMembership(db, m1)).toBeNull();
    expect(listMembers(db, host).map((m) => m.username)).toEqual(["m2"]);
  });

  it("enforces join rules and one-membership", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "CODE123", "t");
    expect(joinByCode(db, m1, "NOPE", "t")).toEqual({ ok: false, reason: "not_found" });
    expect(joinByCode(db, host, "CODE123", "t")).toEqual({ ok: false, reason: "own" });
    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: true });
    expect(joinByCode(db, m1, "CODE123", "t")).toEqual({ ok: false, reason: "already" });
    leave(db, m1);
    expect(getMembership(db, m1)).toBeNull();
  });

  it("freshInviteCode avoids collisions and regenerate/delete work", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "AAA", "t");
    // gen returns a taken code once, then a free one
    let calls = 0;
    const code = freshInviteCode(db, () => (calls++ === 0 ? "AAA" : "BBB"));
    expect(code).toBe("BBB");
    regenerateCode(db, host, "CCC");
    expect(getHostCollab(db, host)!.invite_code).toBe("CCC");
    joinByCode(db, m1, "CCC", "t");
    deleteCollab(db, host);
    expect(getHostCollab(db, host)).toBeNull();
    expect(getMembership(db, m1)).toBeNull(); // cascade
  });
});
