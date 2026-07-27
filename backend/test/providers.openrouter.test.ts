import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import type { Turn } from "../src/providers/types.js";

afterEach(() => vi.restoreAllMocks());

describe("OpenRouterProvider", () => {
  it("sends system + mapped history + user, returns reply", async () => {
    const captured: { url?: string; body?: any; headers?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.headers = init.headers;
        captured.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "Tanggapan penguji." } }],
          }),
        } as any;
      }),
    );

    const provider = new OpenRouterProvider("or-key", "anthropic/claude-sonnet-4.6");
    const history: Turn[] = [{ role: "examiner", content: "Q1" }];
    const result = await provider.sendTurn("PERSONA", "SKRIPSI", history, "A1");

    expect(result.reply).toBe("Tanggapan penguji.");
    expect(captured.url).toContain("openrouter.ai/api/v1/chat/completions");
    expect(captured.body.model).toBe("anthropic/claude-sonnet-4.6");
    expect(captured.body.messages[0]).toEqual({
      role: "system",
      content: "PERSONA\n\nSKRIPSI",
    });
    expect(captured.body.messages).toEqual([
      { role: "system", content: "PERSONA\n\nSKRIPSI" },
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
    ]);
  });

  it("normalizes usage, excluding cached tokens from plain input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Tanggapan." } }],
          usage: {
            prompt_tokens: 34991,
            completion_tokens: 242,
            cost: 0.00461659,
            prompt_tokens_details: { cached_tokens: 991 },
          },
        }),
      })) as any,
    );

    const result = await new OpenRouterProvider("k", "x/y").sendTurn("P", "S", [], "A");
    expect(result.usage).toEqual({
      input_tokens: 34000, // prompt_tokens - cached_tokens
      output_tokens: 242,
      cache_read_tokens: 991,
      cache_write_tokens: 0,
      cost_usd: 0.00461659,
    });
  });

  it("reports zeroed usage when the response omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Tanggapan." } }] }),
      })) as any,
    );
    const result = await new OpenRouterProvider("k", "x/y").sendTurn("P", "S", [], "A");
    expect(result.usage?.input_tokens).toBe(0);
    expect(result.usage?.cost_usd).toBe(0);
  });

  it("throws without leaking the api key on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      })) as any,
    );
    const provider = new OpenRouterProvider("or-SECRET-key", "x/y");
    await expect(
      provider.sendTurn("P", "S", [], "hi"),
    ).rejects.toThrow(/OpenRouter request failed \(401\)/);
    await expect(
      provider.sendTurn("P", "S", [], "hi"),
    ).rejects.not.toThrow(/or-SECRET-key/);
  });
});
