import Anthropic from "@anthropic-ai/sdk";
import { TURN_MAX_TOKENS } from "./types.js";
import type {
  GenerateResult,
  LLMProvider,
  LLMResult,
  TokenUsage,
  Turn,
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

  async sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: TURN_MAX_TOKENS,
      system: [
        { type: "text", text: personaAttack, cache_control: { type: "ephemeral" } },
        { type: "text", text: skripsi, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        ...mapHistory(history),
        { role: "user", content: userInput },
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
