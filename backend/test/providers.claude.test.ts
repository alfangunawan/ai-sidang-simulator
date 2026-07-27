import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../src/providers/claude.js";
import type { Turn } from "../src/providers/types.js";

function fakeClient(capture: { req?: any }) {
  return {
    messages: {
      create: vi.fn(async (req: any) => {
        capture.req = req;
        return {
          content: [{ type: "text", text: "Pertanyaan penguji." }],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 0,
          },
        };
      }),
    },
  };
}

describe("ClaudeProvider", () => {
  it("puts persona+skripsi in cached system blocks and history in messages", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = fakeClient(capture);

    const history: Turn[] = [
      { role: "examiner", content: "Q1" },
      { role: "user", content: "A1" },
    ];
    const result = await provider.sendTurn("PERSONA", "SKRIPSI", history, "A2");

    // reply extracted from text blocks
    expect(result.reply).toBe("Pertanyaan penguji.");
    // Anthropic's cache_read_input_tokens is normalized to cache_read_tokens.
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 100,
      cache_write_tokens: 0,
      cost_usd: 0,
    });

    const req = capture.req;
    expect(req.model).toBe("claude-sonnet-5");
    // two system blocks, both cached
    expect(req.system).toHaveLength(2);
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toBe("PERSONA");
    expect(req.system[1].text).toBe("SKRIPSI");
    // history mapped into messages, latest user turn last; nothing in system carries history
    expect(req.messages).toEqual([
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
      { role: "user", content: "A2" },
    ]);
  });
});
