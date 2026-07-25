import type { LLMProvider, LLMResult, Turn } from "./types.js";
import { mapHistory } from "../prompt.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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

  async sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult> {
    const messages = [
      { role: "system" as const, content: `${personaAttack}\n\n${skripsi}` },
      ...mapHistory(history),
      { role: "user" as const, content: userInput },
    ];

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 300 }),
    });

    if (!res.ok) {
      // Never include the API key in the error.
      throw new Error(`OpenRouter request failed (${res.status})`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply };
  }
}
