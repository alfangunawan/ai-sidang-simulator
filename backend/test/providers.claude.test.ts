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
  it("caches persona+dossier as one system block and keeps history in messages", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = fakeClient(capture);

    const history: Turn[] = [
      { role: "examiner", content: "Q1" },
      { role: "user", content: "A1" },
    ];
    const result = await provider.sendTurn({
      persona: "PERSONA",
      dossier: "DOSSIER",
      history,
      userInput: "A2",
    });

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
    // Persona dan dossier sama-sama statis sepanjang sesi, jadi satu blok dengan
    // satu breakpoint cache — bukan dua breakpoint untuk isi yang tak pernah
    // berubah terpisah.
    expect(req.system).toHaveLength(1);
    expect(req.system[0].text).toBe("PERSONA\n\nDOSSIER");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    // history mapped into messages, latest user turn last; nothing in system carries history
    expect(req.messages).toEqual([
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
      { role: "user", content: "A2" },
    ]);
  });

  // Blok fase berubah beberapa kali per sesi. Kalau ikut di-cache atau ditaruh
  // sebelum dossier, tiap pergantian fase membatalkan prefix yang jauh lebih besar.
  it("appends the phase block after the cached block, uncached", async () => {
    const capture: { req?: any } = {};
    const provider = new ClaudeProvider("key", "claude-sonnet-5");
    (provider as any).client = fakeClient(capture);

    await provider.sendTurn({
      persona: "PERSONA",
      dossier: "DOSSIER",
      phaseBlock: "FASE",
      history: [],
      userInput: "A",
    });

    expect(capture.req.system).toHaveLength(2);
    expect(capture.req.system[0].text).toBe("PERSONA\n\nDOSSIER");
    expect(capture.req.system[1].text).toBe("FASE");
    expect(capture.req.system[1].cache_control).toBeUndefined();
  });
});
