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

  it("throws for an unknown provider", () => {
    expect(() =>
      getProvider({ provider: "bogus", apiKey: "k", model: "m" }),
    ).toThrow(/unknown provider/i);
  });
});
