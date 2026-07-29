import { TURN_MAX_TOKENS } from "./types.js";
import type {
  GenerateResult,
  LLMProvider,
  LLMResult,
  TokenUsage,
  TurnContext,
} from "./types.js";
import { mapHistory } from "../prompt.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

// OpenRouter counts cached tokens inside prompt_tokens, so plain input is the
// remainder. It reports cost directly but has no cache-write counter.
function toUsage(u: OpenRouterUsage | undefined): TokenUsage {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, (u?.prompt_tokens ?? 0) - cached),
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_tokens: cached,
    cache_write_tokens: 0,
    cost_usd: u?.cost ?? 0,
  };
}

export class OpenRouterProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async checkAuth(): Promise<void> {
    // Validates the key without generating tokens.
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter auth failed (${res.status})`);
  }

  async sendTurn(ctx: TurnContext): Promise<LLMResult> {
    // Stabil di depan, berubah di belakang: persona+dossier, lalu blok fase,
    // lalu history dan giliran mahasiswa. Z.AI dan DeepSeek meng-cache secara
    // otomatis berdasar prefix identik, jadi urutan inilah yang menentukan
    // apakah cache kena sama sekali.
    const system = [ctx.persona, ctx.dossier, ctx.phaseBlock].filter(Boolean).join("\n\n");
    const messages = [
      { role: "system" as const, content: system },
      ...mapHistory(ctx.history),
      { role: "user" as const, content: ctx.userInput },
    ];

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: TURN_MAX_TOKENS }),
    });

    if (!res.ok) {
      // Never include the API key in the error.
      throw new Error(`OpenRouter request failed (${res.status})`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: OpenRouterUsage;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply, usage: toUsage(data.usage) };
  }

  async generate(system: string, user: string, maxTokens: number): Promise<GenerateResult> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter request failed (${res.status})`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: OpenRouterUsage;
    };
    return {
      text: data.choices?.[0]?.message?.content?.trim() ?? "",
      usage: toUsage(data.usage),
      // OpenRouter counts a reasoning model's thinking inside the completion
      // budget, so "length" here usually means reasoning ate the answer.
      truncated: data.choices?.[0]?.finish_reason === "length",
    };
  }
}
