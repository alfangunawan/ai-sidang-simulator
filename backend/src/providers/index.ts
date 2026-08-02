import type { LLMProvider } from "./types.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAICompatProvider, normalizeBaseUrl } from "./openaiCompat.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Loopback, LAN, dan link-local. WHATWG URL sudah menormalkan bentuk numerik
 * (`2130706433`, `0x7f.0.0.1`, `127.1` → `127.0.0.1`), jadi yang tersisa hanya
 * bentuk tulisannya sendiri plus IPv4-mapped IPv6 (`[::ffff:7f00:1]`).
 */
const PRIVATE_HOST =
  /^(localhost$|\[?::1\]?$|\[::ffff:|0\.0\.0\.0$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Base URL-nya diisi user tapi yang memanggil adalah server, jadi tanpa
 * penjagaan ini backend bisa dipakai memindai jaringan internal — di mesin ini
 * saja ada n8n, ngrok, dan database yang hanya mendengar di loopback.
 *
 * Penjagaannya di sini, bukan di route: /settings/test-llm, /sessions/turn,
 * /sessions/close, dan pembangunan dossier semuanya lewat getProvider.
 *
 * ponytail: cek nama host, bukan IP hasil resolve — nama publik yang menunjuk
 * ke 127.0.0.1 masih lolos. Naikkan ke dns.lookup + cek IP kalau memang perlu.
 */
function assertPublicUrl(base: string): void {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("URL API tidak valid — harus diawali http:// atau https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL API harus diawali http:// atau https://");
  }
  if (PRIVATE_HOST.test(url.hostname)) {
    throw new Error("URL API tidak boleh menunjuk ke jaringan internal");
  }
}

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
      assertPublicUrl(base);
      return new OpenAICompatProvider(cfg.apiKey, cfg.model, base, "9router");
    }
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
