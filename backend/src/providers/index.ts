import type { LLMProvider } from "./types.js";
import { ClaudeProvider } from "./claude.js";
import { OpenRouterProvider } from "./openrouter.js";

export function getProvider(cfg: {
  provider: string;
  apiKey: string;
  model: string;
}): LLMProvider {
  switch (cfg.provider) {
    case "claude":
      return new ClaudeProvider(cfg.apiKey, cfg.model);
    case "openrouter":
      return new OpenRouterProvider(cfg.apiKey, cfg.model);
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
