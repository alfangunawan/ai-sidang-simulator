import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, newToken, expiresAt, readAuthCookie } from "../src/auth.js";

describe("password", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const h = hashPassword("correct horse");
    expect(h).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("rejects a malformed stored hash without throwing", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("token + cookie", () => {
  it("newToken is 64 hex chars and unique", () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it("expiresAt adds days", () => {
    expect(expiresAt("2026-01-01T00:00:00.000Z", 30)).toBe("2026-01-31T00:00:00.000Z");
  });
  it("readAuthCookie parses the sid cookie", () => {
    expect(readAuthCookie({ headers: { cookie: "foo=1; sid=abc123; bar=2" } } as any)).toBe("abc123");
    expect(readAuthCookie({ headers: {} } as any)).toBeNull();
  });
});
