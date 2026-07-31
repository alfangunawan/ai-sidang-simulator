import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAICompatProvider, normalizeBaseUrl } from "../src/providers/openaiCompat.js";
import type { Turn } from "../src/providers/types.js";

afterEach(() => vi.restoreAllMocks());

describe("OpenAICompatProvider", () => {
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

    const provider = new OpenAICompatProvider("or-key", "anthropic/claude-sonnet-4.6", "https://openrouter.ai/api/v1", "OpenRouter");
    const history: Turn[] = [{ role: "examiner", content: "Q1" }];
    const result = await provider.sendTurn({
      persona: "PERSONA",
      dossier: "DOSSIER",
      history,
      userInput: "A1",
    });

    expect(result.reply).toBe("Tanggapan penguji.");
    expect(captured.url).toContain("openrouter.ai/api/v1/chat/completions");
    expect(captured.body.model).toBe("anthropic/claude-sonnet-4.6");
    // Tanpa ini 9router membalas SSE dan `res.json()` pecah di `data: [DONE]`.
    expect(captured.body.stream).toBe(false);
    expect(captured.body.messages[0]).toEqual({
      role: "system",
      content: "PERSONA\n\nDOSSIER",
    });
    expect(captured.body.messages).toEqual([
      { role: "system", content: "PERSONA\n\nDOSSIER" },
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

    const result = await new OpenAICompatProvider("k", "x/y", "https://openrouter.ai/api/v1", "OpenRouter").sendTurn({ persona: "P", dossier: "D", history: [], userInput: "A" });
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
    const result = await new OpenAICompatProvider("k", "x/y", "https://openrouter.ai/api/v1", "OpenRouter").sendTurn({ persona: "P", dossier: "D", history: [], userInput: "A" });
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
    const provider = new OpenAICompatProvider("or-SECRET-key", "x/y", "https://openrouter.ai/api/v1", "OpenRouter");
    await expect(
      provider.sendTurn({ persona: "P", dossier: "D", history: [], userInput: "hi" }),
      // Sebabnya ikut disebut, bukan cuma angkanya: pesan ini yang dibaca user
      // di UI ketika pembacaan naskah gagal.
    ).rejects.toThrow(/OpenRouter request failed: API key .*\(HTTP 401\)/);
    await expect(
      provider.sendTurn({ persona: "P", dossier: "D", history: [], userInput: "hi" }),
    ).rejects.not.toThrow(/or-SECRET-key/);
  });

  it("calls the configured base URL and names it in failures", async () => {
    const captured: { url?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        captured.url = url;
        return { ok: false, status: 402, text: async () => "no credit" } as any;
      }),
    );
    const provider = new OpenAICompatProvider("k", "gpt-x", "https://api.9router.ai/v1", "9router");
    await expect(
      provider.sendTurn({ persona: "P", dossier: "D", history: [], userInput: "hi" }),
    ).rejects.toThrow(/9router request failed: kredit 9router habis .*\(HTTP 402\)/);
    expect(captured.url).toBe("https://api.9router.ai/v1/chat/completions");
  });

  // User menempel URL apa adanya dari dokumentasi: sebagian base saja,
  // sebagian endpoint penuh, sebagian dengan garis miring di ujung.
  it("normalizes pasted base URLs", () => {
    expect(normalizeBaseUrl("https://api.9router.ai/v1/")).toBe("https://api.9router.ai/v1");
    expect(normalizeBaseUrl(" https://api.9router.ai/v1/chat/completions ")).toBe(
      "https://api.9router.ai/v1",
    );
    // `/models` ikut tersalin karena itu URL yang dipakai mengecek koneksi.
    expect(normalizeBaseUrl("https://api.9router.ai/v1/models")).toBe(
      "https://api.9router.ai/v1",
    );
    expect(normalizeBaseUrl("https://api.9router.ai/v1")).toBe("https://api.9router.ai/v1");
  });
});
