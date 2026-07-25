import type { TtsConfig, TtsResult } from "./types.js";
import { googleSynth } from "./google.js";
import { openaiSynth } from "./openai.js";

export type { TtsConfig, TtsResult, TtsVoice } from "./types.js";
export { googleSynth, googleVoices } from "./google.js";
export { openaiSynth, OPENAI_VOICES } from "./openai.js";

export async function synthesize(cfg: TtsConfig, text: string): Promise<TtsResult> {
  switch (cfg.provider) {
    case "google":
      return googleSynth(text, cfg.voice, cfg.apiKey);
    case "openai":
      return openaiSynth(text, cfg.voice, cfg.apiKey, cfg.model);
    default:
      throw new Error(`Provider TTS tidak didukung: ${cfg.provider}`);
  }
}
