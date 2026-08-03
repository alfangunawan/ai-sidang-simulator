import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import {
  freshInviteCode, validateInviteCode, getHostCollab, createCollab, setShares, setInviteCode,
  deleteCollab, getMembership, joinByCode, leave, listMembers, kickMember,
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
    setInviteCode(db, host, "CCC");
    expect(getHostCollab(db, host)!.invite_code).toBe("CCC");
    joinByCode(db, m1, "CCC", "t");
    deleteCollab(db, host);
    expect(getHostCollab(db, host)).toBeNull();
    expect(getMembership(db, m1)).toBeNull(); // cascade
  });

  it("kickMember is scoped to host: hostB cannot kick hostA's members", () => {
    const db = openDb(":memory:");
    const hostA = createUser(db, "hostA", "h", "t");
    const hostB = createUser(db, "hostB", "h", "t");
    const m2 = createUser(db, "m2", "h", "t");

    // hostA creates collab, hostB creates separate collab
    createCollab(db, hostA, "CODEA", "t");
    createCollab(db, hostB, "CODEB", "t");

    // m2 joins hostA's collab
    expect(joinByCode(db, m2, "CODEA", "t")).toEqual({ ok: true });

    // hostB tries to kick m2 (should be no-op: m2 is not in hostB's collab)
    kickMember(db, hostB, m2);

    // m2 should still be in hostA's collab
    const mem = getMembership(db, m2);
    expect(mem).not.toBeNull();
    expect(mem!.host_user_id).toBe(hostA);
    expect(listMembers(db, hostA)).toHaveLength(1);
    expect(listMembers(db, hostA)[0].member_user_id).toBe(m2);

    // hostA kicks m2 (should work)
    kickMember(db, hostA, m2);
    expect(getMembership(db, m2)).toBeNull();
    expect(listMembers(db, hostA)).toHaveLength(0);
  });

  it("matches codes case-insensitively on join", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "Sibiru2026", "t");
    expect(joinByCode(db, m1, "SIBIRU2026", "t")).toEqual({ ok: true });
  });

  it("validateInviteCode rejects bad shapes", () => {
    const { db, host } = seed();
    for (const bad of ["", "abc", "kode akses", "sidang@2026", "a".repeat(33), null]) {
      const v = validateInviteCode(db, bad, host);
      expect(v).toMatchObject({ status: 400 });
    }
    expect(validateInviteCode(db, "  sibiru-2026  ", host)).toEqual({ code: "sibiru-2026" });
    expect(validateInviteCode(db, "KELAS_A", host)).toEqual({ code: "KELAS_A" });
  });

  it("validateInviteCode blocks another host's code, ignoring case", () => {
    const { db, host, m1 } = seed();
    createCollab(db, host, "sibiru-2026", "t");
    expect(validateInviteCode(db, "SIBIRU-2026", m1)).toMatchObject({
      status: 409,
      error: "Kode akses sudah dipakai",
    });
  });

  it("validateInviteCode lets a host re-save its own code", () => {
    const { db, host } = seed();
    createCollab(db, host, "sibiru-2026", "t");
    expect(validateInviteCode(db, "sibiru-2026", host)).toEqual({ code: "sibiru-2026" });
    expect(validateInviteCode(db, "SIBIRU-2026", host)).toEqual({ code: "SIBIRU-2026" });
  });

  it("freshInviteCode throws after 5 collisions", () => {
    const { db, host } = seed();
    createCollab(db, host, "TAKEN", "t");

    // gen always returns "TAKEN", should exhaust retries and throw
    expect(() => freshInviteCode(db, () => "TAKEN")).toThrow("Gagal membuat kode undangan");
  });
});
