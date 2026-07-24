import { describe, it, expect } from "vitest";
import { getProvider } from "../src/providers/index.js";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

describe("getProvider", () => {
  it("returns ClaudeProvider for claude", () => {
    const p = getProvider({ provider: "claude", apiKey: "k", model: "claude-sonnet-5" });
    expect(p).toBeInstanceOf(ClaudeProvider);
  });

  it("returns OpenRouterProvider for openrouter", () => {
    const p = getProvider({ provider: "openrouter", apiKey: "k", model: "x/y" });
    expect(p).toBeInstanceOf(OpenRouterProvider);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      getProvider({ provider: "bogus", apiKey: "k", model: "m" }),
    ).toThrow(/unknown provider/i);
  });
});
