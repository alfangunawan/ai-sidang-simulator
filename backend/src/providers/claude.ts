import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMResult, Turn } from "./types.js";
import { mapHistory } from "../prompt.js";

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
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

    const u = response.usage as any;
    return {
      reply,
      usage: {
        input_tokens: u?.input_tokens ?? 0,
        output_tokens: u?.output_tokens ?? 0,
        cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
