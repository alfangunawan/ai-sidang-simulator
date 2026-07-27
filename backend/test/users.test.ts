import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import {
  createUser, getUserByUsername, getUserById,
  createToken, getUserIdByToken, deleteToken,
} from "../src/repos/users.js";

describe("users repo", () => {
  it("creates and fetches a user", () => {
    const db = openDb(":memory:");
    const id = createUser(db, "alfan", "salt:hash", "2026-07-27T00:00:00.000Z");
    expect(getUserByUsername(db, "alfan")).toMatchObject({ id, username: "alfan", password_hash: "salt:hash" });
    expect(getUserById(db, id)).toEqual({ id, username: "alfan" });
    expect(getUserByUsername(db, "nobody")).toBeNull();
  });

  it("resolves a live token and rejects an expired or deleted one", () => {
    const db = openDb(":memory:");
    const uid = createUser(db, "u", "salt:hash", "2026-07-27T00:00:00.000Z");
    createToken(db, "tok", uid, "2026-07-27T00:00:00.000Z", "2026-08-26T00:00:00.000Z");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBe(uid);
    expect(getUserIdByToken(db, "tok", "2026-09-01T00:00:00.000Z")).toBeNull(); // expired
    deleteToken(db, "tok");
    expect(getUserIdByToken(db, "tok", "2026-08-01T00:00:00.000Z")).toBeNull();
  });
});
