import Anthropic from "@anthropic-ai/sdk";
import { TURN_MAX_TOKENS } from "./types.js";
import type {
  GenerateResult,
  LLMProvider,
  LLMResult,
  TokenUsage,
  TurnContext,
} from "./types.js";

// Anthropic bills cache reads/writes separately from plain input; cost is not
// reported by the API, so it stays 0 here.
function toUsage(u: any): TokenUsage {
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_read_tokens: u?.cache_read_input_tokens ?? 0,
    cache_write_tokens: u?.cache_creation_input_tokens ?? 0,
    cost_usd: 0,
  };
}
import { mapHistory } from "../prompt.js";

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async checkAuth(): Promise<void> {
    // Validates the key without generating tokens.
    await this.client.models.list();
  }

  async sendTurn(ctx: TurnContext): Promise<LLMResult> {
    // Blok 1 = persona + dossier, statis sepanjang sesi; breakpoint cache di
    // ujungnya. Blok 2 = fase aktif, berubah beberapa kali per sesi dan sengaja
    // tidak di-cache supaya tidak membatalkan blok 1.
    const system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [
      {
        type: "text",
        text: `${ctx.persona}\n\n${ctx.dossier}`,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (ctx.phaseBlock) system.push({ type: "text", text: ctx.phaseBlock });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: TURN_MAX_TOKENS,
      system,
      messages: [
        ...mapHistory(ctx.history),
        { role: "user", content: ctx.userInput },
      ],
    });

    const reply = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    return { reply, usage: toUsage(response.usage) };
  }

  async generate(system: string, user: string, maxTokens: number): Promise<GenerateResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system }],
      messages: [{ role: "user", content: user }],
    });
    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    return {
      text,
      usage: toUsage(response.usage),
      truncated: response.stop_reason === "max_tokens",
    };
  }
}
