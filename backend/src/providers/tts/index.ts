import type { TtsConfig, TtsResult } from "./types.js";
import { googleSynth } from "./google.js";
import { openaiSynth } from "./openai.js";

export type { TtsConfig, TtsResult, TtsVoice } from "./types.js";
export { googleSynth, googleVoices } from "./google.js";
export { openaiSynth, openaiCheckAuth, OPENAI_VOICES } from "./openai.js";

// Google rejects a synthesis request over 5000 bytes of input and OpenAI over
// 4096 characters — a long examiner reply used to fail the whole request with a
// bare 400. Stay well under both and stitch the MP3 parts back together.
const MAX_BYTES = 3800;

export async function synthesize(cfg: TtsConfig, text: string): Promise<TtsResult> {
  const parts = chunkText(text, MAX_BYTES);
  const results: TtsResult[] = [];
  // Sequential on purpose: parallel calls trip the provider's rate limit.
  for (const part of parts) results.push(await synthWithRetry(cfg, part));
  if (results.length === 1) return results[0];
  return {
    audio: Buffer.concat(
      results.map((r) => Buffer.from(r.audio, "base64")),
    ).toString("base64"),
    mime: results[0].mime,
  };
}

// A dropped connection or a rate-limit blip made the examiner fall silent for
// the whole reply. Those are worth one more try; a bad key or an unsupported
// provider is not.
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|\(429\)|\(5\d\d\)/i;

async function synthWithRetry(cfg: TtsConfig, text: string): Promise<TtsResult> {
  try {
    return await synthOne(cfg, text);
  } catch (e) {
    if (!TRANSIENT.test((e as Error).message ?? "")) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return synthOne(cfg, text);
  }
}

function synthOne(cfg: TtsConfig, text: string): Promise<TtsResult> {
  switch (cfg.provider) {
    case "google":
      return googleSynth(text, cfg.voice, cfg.apiKey);
    case "openai":
      return openaiSynth(text, cfg.voice, cfg.apiKey, cfg.model);
    default:
      throw new Error(`Provider TTS tidak didukung: ${cfg.provider}`);
  }
}

// Split on sentence boundaries first so each chunk still sounds natural; only
// fall back to word-splitting for a single sentence that is itself too long.
export function chunkText(text: string, maxBytes = MAX_BYTES): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [trimmed];
  if (bytes(trimmed) <= maxBytes) return [trimmed];

  const pieces = trimmed
    .split(/(?<=[.!?…])\s+/)
    .flatMap((s) => (bytes(s) > maxBytes ? splitWords(s, maxBytes) : [s]));

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? `${current} ${piece}` : piece;
    if (current && bytes(next) > maxBytes) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitWords(sentence: string, maxBytes: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of sentence.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && bytes(next) > maxBytes) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}
