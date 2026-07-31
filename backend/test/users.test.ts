import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createUser, getUserByUsername, getUserById,
  createToken, getUserIdByToken, deleteToken,
  setAdmin, setSuspended, countAdmins,
} from "../src/repos/users.js";

describe("users repo", () => {
  it("creates and fetches a user", () => {
    const db = openDb(":memory:");
    const id = createUser(db, "alfan", "salt:hash", "2026-07-27T00:00:00.000Z");
    expect(getUserByUsername(db, "alfan")).toMatchObject({ id, username: "alfan", password_hash: "salt:hash" });
    expect(getUserById(db, id)).toEqual({ id, username: "alfan", is_admin: false });
    expect(getUserByUsername(db, "nobody")).toBeNull();
  });

  it("resolves a live token and rejects an expired or deleted one", () => {
    const db = openDb(":memory:");
    const uid = createUser(db, "u", "salt:hash", "2026-07-27T00:00:00.000Z");
    createToken(db, "tok", uid, "2026-07-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBe(uid);
    expect(getUserIdByToken(db, "tok", "2026-09-01T00:00:00.000Z")).toBeNull(); // expired
    createToken(db, "tok2", uid, "2026-07-27T00:00:00.000Z", "2026-08-15T00:00:00.000Z");
    expect(getUserIdByToken(db, "tok2", "2026-08-15T00:00:00.000Z")).toBeNull(); // expires exactly at now → expired
    deleteToken(db, "tok");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBeNull();
  });

  // A suspended admin can't act, so counting them as usable would let a
  // future relaxation of self-demotion pass countAdmins() <= 1 while leaving
  // zero admins actually able to run the panel.
  it("countAdmins excludes suspended admins", () => {
    const db = openDb(":memory:");
    const a = createUser(db, "a", "salt:hash", "2026-07-27T00:00:00.000Z");
    const b = createUser(db, "b", "salt:hash", "2026-07-27T00:00:00.000Z");
    setAdmin(db, a, 1);
    setAdmin(db, b, 1);
    expect(countAdmins(db)).toBe(2);
    setSuspended(db, b, 1);
    expect(countAdmins(db)).toBe(1);
  });
});
