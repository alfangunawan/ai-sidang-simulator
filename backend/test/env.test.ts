import { describe, it, expect, vi } from "vitest";
import { resolveKey } from "../src/env.js";

const validHex = "a".repeat(64);

describe("resolveKey", () => {
  it("returns the 32-byte key for a valid 64-hex value without generating", () => {
    const genHex = vi.fn(() => "b".repeat(64));
    const persist = vi.fn();
    const buf = resolveKey(validHex, { genHex, persist });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(32);
    expect(buf.toString("hex")).toBe(validHex);
    expect(genHex).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("generates and persists a key when the raw value is undefined (fresh clone)", () => {
    const generated = "c".repeat(64);
    const genHex = vi.fn(() => generated);
    const persist = vi.fn();
    const onGenerate = vi.fn();
    const buf = resolveKey(undefined, { genHex, persist, onGenerate });
    expect(buf.length).toBe(32);
    expect(buf.toString("hex")).toBe(generated);
    expect(persist).toHaveBeenCalledWith(generated);
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("throws (does not clobber) when the value is present but empty", () => {
    const persist = vi.fn();
    expect(() =>
      resolveKey("", { genHex: () => validHex, persist }),
    ).toThrow(/tidak valid/i);
    expect(persist).not.toHaveBeenCalled();
  });

  it("throws when the value is present but malformed (e.g. placeholder)", () => {
    expect(() =>
      resolveKey("REPLACE_WITH_64_HEX_CHARS", {
        genHex: () => validHex,
        persist: vi.fn(),
      }),
    ).toThrow(/tidak valid/i);
  });
});
