import { TURN_MAX_TOKENS } from "./types.js";
import type {
  GenerateResult,
  LLMProvider,
  LLMResult,
  TokenUsage,
  TurnContext,
} from "./types.js";
import { mapHistory } from "../prompt.js";

/**
 * Diminta eksplisit, bukan dibiarkan default. 9router membalas
 * `text/event-stream` dengan `data: [DONE]` menempel di ekor JSON kalau tidak
 * diminta — dan `res.json()` pecah di karakter itu, bukan di HTTP status, jadi
 * kegagalannya sampai ke user sebagai galat parser yang tidak berarti apa-apa.
 */
const NON_STREAMING = { stream: false };

interface OpenAICompatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

// OpenRouter-style routers count cached tokens inside prompt_tokens, so plain
// input is the remainder. Cost is reported directly; there is no cache-write
// counter.
function toUsage(u: OpenAICompatUsage | undefined): TokenUsage {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, (u?.prompt_tokens ?? 0) - cached),
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_tokens: cached,
    cache_write_tokens: 0,
    cost_usd: u?.cost ?? 0,
  };
}

/**
 * Buang garis miring di ujung dan endpoint yang ikut tersalin. User menempel
 * URL apa adanya dari dokumentasi provider — sebagian menulis base-nya saja,
 * sebagian menulis `/chat/completions`, sebagian `/models` (yang dipakai untuk
 * mengecek koneksi). Ketiganya harus jalan; kalau tidak, base-nya jadi ganda
 * dan permintaan berakhir di `/v1/models/chat/completions` → 404.
 */
export function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|models)$/, "");
}

/**
 * Kode status yang bisa ditindaklanjuti user, diterjemahkan di satu tempat.
 * Tanpa ini kegagalan sampai ke UI sebagai angka telanjang — dan "402" dibaca
 * sebagai naskahnya yang salah, padahal kreditnya yang habis.
 * Nama key tidak pernah masuk pesan.
 */
function requestFailed(status: number, label: string): Error {
  const why =
    status === 401 || status === 403
      ? `API key ${label} tidak valid atau tidak punya akses`
      : status === 402
        ? `kredit ${label} habis — isi ulang saldo atau pilih model yang lebih murah`
        : status === 404
          ? "model tidak ditemukan — periksa nama model di Pengaturan"
          : status === 429
            ? `batas permintaan ${label} tercapai — tunggu sebentar lalu coba lagi`
            : status >= 500
              ? `${label} sedang bermasalah`
              : `permintaan ditolak ${label}`;
  return new Error(`${label} request failed: ${why} (HTTP ${status})`);
}

/**
 * Klien chat/completions bergaya OpenAI. Dipakai OpenRouter dan router lain
 * yang meniru API-nya (9router); yang membedakan hanya base URL-nya.
 */
export class OpenAICompatProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
    private label: string,
    /**
     * OpenRouter punya endpoint khusus pengecek key. Router generik hanya
     * punya `/models` — pengecekan yang lebih lemah (kadang tanpa auth), tapi
     * satu-satunya yang pasti ada.
     */
    private authUrl = `${baseUrl}/models`,
  ) {}

  private get endpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  async checkAuth(): Promise<void> {
    // Validates the key without generating tokens.
    const res = await fetch(this.authUrl, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    // 404 di sini bukan soal model — belum ada model yang diminta. Yang salah
    // base URL-nya, dan itu keluhan paling sering: user menempel host saja,
    // tanpa /v1, lalu membaca "koneksi gagal" dan menyalahkan key-nya.
    if (res.status === 404) {
      throw new Error(
        `${this.label} request failed: URL API tidak ditemukan — periksa base URL ` +
          `(umumnya berakhiran /v1) (HTTP 404)`,
      );
    }
    if (!res.ok) throw requestFailed(res.status, this.label);
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

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: TURN_MAX_TOKENS,
        ...NON_STREAMING,
      }),
    });

    if (!res.ok) throw requestFailed(res.status, this.label);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: OpenAICompatUsage;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply, usage: toUsage(data.usage) };
  }

  async generate(system: string, user: string, maxTokens: number): Promise<GenerateResult> {
    const res = await fetch(this.endpoint, {
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
        ...NON_STREAMING,
      }),
    });
    if (!res.ok) throw requestFailed(res.status, this.label);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: OpenAICompatUsage;
    };
    return {
      text: data.choices?.[0]?.message?.content?.trim() ?? "",
      usage: toUsage(data.usage),
      // Reasoning model menghitung "thinking"-nya di dalam budget completion,
      // jadi "length" di sini biasanya berarti reasoning memakan jawabannya.
      truncated: data.choices?.[0]?.finish_reason === "length",
    };
  }
}
