import type { LLMProvider } from "./types.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAICompatProvider, normalizeBaseUrl } from "./openaiCompat.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export function getProvider(cfg: {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}): LLMProvider {
  switch (cfg.provider) {
    case "claude":
      return new ClaudeProvider(cfg.apiKey, cfg.model);
    case "openrouter":
      return new OpenAICompatProvider(
        cfg.apiKey,
        cfg.model,
        OPENROUTER_BASE,
        "OpenRouter",
        `${OPENROUTER_BASE}/key`,
      );
    case "9router": {
      // Base URL-nya diisi user, jadi ia bisa kosong. Tanpa penjagaan ini
      // permintaan pergi ke "undefined/chat/completions" dan user membaca
      // kegagalan jaringan, bukan kolom yang belum diisi.
      const base = normalizeBaseUrl(cfg.baseUrl ?? "");
      if (!base) throw new Error("URL API 9router belum diisi");
      return new OpenAICompatProvider(cfg.apiKey, cfg.model, base, "9router");
    }
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
