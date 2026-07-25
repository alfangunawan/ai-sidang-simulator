import { describe, it, expect, vi, afterEach } from "vitest";
import { ClaudeProvider } from "../src/providers/claude.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

afterEach(() => vi.restoreAllMocks());

describe("provider.generate", () => {
  it("Claude sends one system + one user block and returns text", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = {
      messages: {
        create: vi.fn(async (req: any) => {
          capture.req = req;
          return { content: [{ type: "text", text: "{\"final_score\":80}" }], usage: {} };
        }),
      },
    };
    const out = await provider.generate("SYS", "USER", 1024);
    expect(out.text).toBe('{"final_score":80}');
    expect(capture.req.max_tokens).toBe(1024);
    expect(capture.req.system[0].text).toBe("SYS");
    expect(capture.req.messages).toEqual([{ role: "user", content: "USER" }]);
  });

  it("OpenRouter posts system+user messages and returns content", async () => {
    const capture: { body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        capture.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "OK-TEXT" } }] }),
        };
      }) as any,
    );
    const provider = new OpenRouterProvider("or-key", "x/y");
    const out = await provider.generate("SYS", "USER", 512);
    expect(out.text).toBe("OK-TEXT");
    expect(capture.body.max_tokens).toBe(512);
    expect(capture.body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
  });

  it("OpenRouter throws without leaking the key on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })) as any,
    );
    const provider = new OpenRouterProvider("or-key", "x/y");
    await expect(provider.generate("s", "u", 100)).rejects.toThrow(/OpenRouter request failed/);
  });
});
