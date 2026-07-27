import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";

function cols(db: any, t: string): string[] {
  return (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
}

describe("collab schema", () => {
  it("creates collab tables and key_owner column", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["collaborations", "collaboration_members"]));
    expect(cols(db, "usage_events")).toContain("key_owner_user_id");
    expect(cols(db, "collaborations")).toEqual(expect.arrayContaining(["id", "host_user_id", "invite_code", "share_ai", "share_tts", "share_stt", "created_at"]));
    expect(cols(db, "collaboration_members")).toEqual(expect.arrayContaining(["collaboration_id", "member_user_id", "joined_at"]));
  });
});
