import type { TtsResult, TtsVoice } from "./types.js";

const SPEECH = "https://api.openai.com/v1/audio/speech";

// Voices supported by tts-1 / tts-1-hd.
export const OPENAI_VOICES: TtsVoice[] = [
  { name: "alloy", type: "OpenAI" },
  { name: "echo", type: "OpenAI" },
  { name: "fable", type: "OpenAI" },
  { name: "onyx", type: "OpenAI" },
  { name: "nova", type: "OpenAI" },
  { name: "shimmer", type: "OpenAI" },
];

// Auth/connection check for the OpenAI TTS key — lists models, no synthesis.
export async function openaiCheckAuth(apiKey: string): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI auth failed (${res.status})`);
}

export async function openaiSynth(
  text: string,
  voice: string,
  apiKey: string,
  model = "tts-1",
): Promise<TtsResult> {
  const res = await fetch(SPEECH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
  });

  if (!res.ok) {
    // Never include the API key in the error.
    throw new Error(`OpenAI TTS request failed (${res.status})`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { audio: buf.toString("base64"), mime: "audio/mpeg" };
}
