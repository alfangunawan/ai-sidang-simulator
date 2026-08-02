import { describe, it, expect } from "vitest";
import { getProvider } from "../src/providers/index.js";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenAICompatProvider } from "../src/providers/openaiCompat.js";

describe("getProvider", () => {
  it("returns ClaudeProvider for claude", () => {
    const p = getProvider({ provider: "claude", apiKey: "k", model: "claude-sonnet-5" });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });

  it("returns OpenAICompatProvider for openrouter", () => {
    const p = getProvider({ provider: "openrouter", apiKey: "k", model: "x/y" });
    expect(p).toBeInstanceOf(OpenAICompatProvider);
  });

  it("returns OpenAICompatProvider for 9router", () => {
    const p = getProvider({
      provider: "9router",
      apiKey: "k",
      model: "x/y",
      baseUrl: "https://api.9router.ai/v1",
    });
    expect(p).toBeInstanceOf(OpenAICompatProvider);
  });

  // Tanpa ini permintaan pergi ke "/chat/completions" tanpa host dan user
  // membaca kegagalan jaringan, bukan kolom yang belum diisi.
  it("throws for 9router without a base URL", () => {
    expect(() => getProvider({ provider: "9router", apiKey: "k", model: "m" })).toThrow(
      /URL API 9router belum diisi/,
    );
  });

  // Tanpa ini backend jadi pemindai jaringan internal: base URL diisi user,
  // tapi yang menembak keluar servernya.
  it.each([
    "http://localhost:4040",
    "http://127.0.0.1:5678/v1",
    "http://2130706433/v1", // bentuk desimal dari 127.0.0.1
    "http://0x7f.0.0.1/v1",
    "http://127.1/v1",
    "http://[::1]:3002/v1",
    "http://[::ffff:7f00:1]/v1",
    "http://0/v1",
    "http://192.168.1.1/v1",
    "http://10.0.0.5/v1",
    "http://172.16.0.1/v1",
    "http://169.254.169.254/latest/meta-data",
  ])("rejects 9router base URL pointing at %s", (baseUrl) => {
    expect(() => getProvider({ provider: "9router", apiKey: "k", model: "m", baseUrl })).toThrow(
      /jaringan internal/,
    );
  });

  it("rejects a non-http scheme for 9router", () => {
    expect(() =>
      getProvider({ provider: "9router", apiKey: "k", model: "m", baseUrl: "file:///etc/passwd" }),
    ).toThrow(/http:\/\/ atau https:\/\//);
  });

  it("still accepts a public 9router base URL", () => {
    expect(
      getProvider({ provider: "9router", apiKey: "k", model: "m", baseUrl: "http://203.0.113.9/v1" }),
    ).toBeInstanceOf(OpenAICompatProvider);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      getProvider({ provider: "bogus", apiKey: "k", model: "m" }),
    ).toThrow(/unknown provider/i);
  });
});
