const TRANSCRIPTIONS = "https://api.openai.com/v1/audio/transcriptions";
const MODELS = "https://api.openai.com/v1/models";

// whisper-1 is the transcription model available on every OpenAI account and
// takes an explicit language hint, which keeps Indonesian answers from being
// auto-detected as Malay.
const MODEL = "whisper-1";
const LANG = "id";

// Auth/connection check for the OpenAI STT key — lists models, no transcription.
export async function whisperCheckAuth(apiKey: string): Promise<void> {
  const res = await fetch(MODELS, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`OpenAI auth failed (${res.status})`);
}

export async function whisperTranscribe(
  audio: Buffer,
  filename: string,
  mime: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  // OpenAI picks the decoder from the file extension, so the browser's
  // container name has to survive the hop.
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  form.append("model", MODEL);
  form.append("language", LANG);

  const res = await fetch(TRANSCRIPTIONS, {
    method: "POST",
    // No Content-Type header: fetch adds the multipart boundary itself.
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    // Never include the API key in the error.
    throw new Error(`Whisper request failed (${res.status})`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
