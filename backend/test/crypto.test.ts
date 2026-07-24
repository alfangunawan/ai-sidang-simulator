import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../src/crypto.js";

const key = randomBytes(32);

describe("crypto AES-256-GCM", () => {
  it("round-trips a string", () => {
    const secret = "sk-ant-abc123-VERY-SECRET";
    const blob = encrypt(secret, key);
    expect(blob).not.toContain(secret);
    expect(decrypt(blob, key)).toBe(secret);
  });

  it("produces different ciphertext each call (random iv)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("throws when the auth tag is tampered", () => {
    const blob = encrypt("hello", key);
    const bytes = Buffer.from(blob, "base64");
    bytes[13] ^= 0xff; // flip a bit inside the auth tag region
    const tampered = bytes.toString("base64");
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("throws with the wrong key", () => {
    const blob = encrypt("hello", key);
    expect(() => decrypt(blob, randomBytes(32))).toThrow();
  });
});
