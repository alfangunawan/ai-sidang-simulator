/**
 * Output ceiling for one examiner turn. On reasoning models this budget covers
 * reasoning tokens too, so a tight cap starves the visible answer and the reply
 * comes back empty. The persona keeps replies to ~35 words; the headroom exists
 * purely for reasoning, and unused tokens are not billed.
 */
export const TURN_MAX_TOKENS = 1500;

/**
 * Output ceiling for the closing assessment. It must cover reasoning tokens
 * *plus* a full assessment JSON — on glm-5.2 a 1536 ceiling was consumed by
 * reasoning alone, so every close came back empty and the session could never
 * be scored. Unused tokens are not billed; a cap that is too low is.
 */
export const ASSESSMENT_MAX_TOKENS = 8000;

export interface Turn {
  role: "examiner" | "user";
  content: string;
}

/**
 * Provider-agnostic token accounting. Providers that do not report a field
 * (OpenRouter has no cache-write counter, Anthropic reports no cost) send 0.
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
}

export interface LLMResult {
  reply: string;
  usage?: TokenUsage;
}

/**
 * `truncated` means the model hit the output ceiling mid-answer. Retrying the
 * same call cannot help — it is billed and fails identically — so callers must
 * report it rather than retry.
 */
export interface GenerateResult {
  text: string;
  usage?: TokenUsage;
  truncated?: boolean;
}

/**
 * Susunan konteks satu giliran. Urutan fieldnya bukan estetika: prefix yang
 * stabil harus di depan supaya cache penyedia bisa kena.
 *
 * `persona` + `dossier` tidak berubah sepanjang sesi. `phaseBlock` berubah
 * ~6x per sesi, jadi ia duduk SESUDAH keduanya — kalau di depan, tiap
 * pergantian fase membatalkan cache seluruh prefix. `userInput` sudah memuat
 * nudge dan kutipan retrieval, dan sengaja berada di messages, bukan system:
 * kutipan berganti tiap giliran dan akan mematikan cache bila ikut ke system.
 */
export interface TurnContext {
  persona: string;
  dossier: string;
  phaseBlock?: string;
  history: Turn[];
  userInput: string;
}

export interface LLMProvider {
  sendTurn(ctx: TurnContext): Promise<LLMResult>;
  generate(system: string, user: string, maxTokens: number): Promise<GenerateResult>;
  // Lightweight auth/connection check. Resolves on success, throws on failure.
  checkAuth(): Promise<void>;
}
