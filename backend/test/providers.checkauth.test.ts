import { describe, it, expect, vi, afterEach } from "vitest";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenAICompatProvider } from "../src/providers/openaiCompat.js";
import { openaiCheckAuth } from "../src/providers/tts/openai.js";

const OR = "https://openrouter.ai/api/v1";

afterEach(() => vi.restoreAllMocks());

describe("ClaudeProvider.checkAuth", () => {
  it("resolves when the models list call succeeds", async () => {
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = { models: { list: vi.fn(async () => ({ data: [] })) } };
    await expect(provider.checkAuth()).resolves.toBeUndefined();
  });

  it("rejects when the key is invalid", async () => {
    const provider = new ClaudeProvider("bad", "m");
    (provider as any).client = {
      models: { list: vi.fn(async () => { throw new Error("401"); }) },
    };
    await expect(provider.checkAuth()).rejects.toThrow();
  });
});

describe("OpenAICompatProvider.checkAuth", () => {
  it("checks the key endpoint with the bearer token", async () => {
    const captured: { url?: string; auth?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.auth = init.headers.Authorization;
        return { ok: true, status: 200 } as any;
      }),
    );
    await new OpenAICompatProvider("or-key", "m", OR, "OpenRouter", `${OR}/key`).checkAuth();
    expect(captured.url).toContain("openrouter.ai/api/v1/key");
    expect(captured.auth).toBe("Bearer or-key");
  });

  it("rejects on non-2xx without leaking the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 })) as any,
    );
    const p = new OpenAICompatProvider("or-SECRET", "m", OR, "OpenRouter", `${OR}/key`);
    await expect(p.checkAuth()).rejects.toThrow(/401/);
    await expect(p.checkAuth()).rejects.not.toThrow(/or-SECRET/);
  });
});

describe("openaiCheckAuth", () => {
  it("checks the models endpoint with the bearer token", async () => {
    const captured: { url?: string; auth?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.auth = init.headers.Authorization;
        return { ok: true, status: 200 } as any;
      }),
    );
    await openaiCheckAuth("sk-key");
    expect(captured.url).toContain("api.openai.com/v1/models");
    expect(captured.auth).toBe("Bearer sk-key");
  });

  it("rejects on non-2xx without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })) as any);
    await expect(openaiCheckAuth("sk-SECRET")).rejects.toThrow(/401/);
    await expect(openaiCheckAuth("sk-SECRET")).rejects.not.toThrow(/sk-SECRET/);
  });
});
