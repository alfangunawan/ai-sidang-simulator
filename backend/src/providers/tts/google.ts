import type { TtsResult, TtsVoice } from "./types.js";

const SYNTH = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICES = "https://texttospeech.googleapis.com/v1/voices";
const LANG = "id-ID";

export async function googleSynth(
  text: string,
  voice: string,
  apiKey: string,
): Promise<TtsResult> {
  const res = await fetch(`${SYNTH}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: LANG, name: voice },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });

  if (!res.ok) {
    // Never include the API key in the error — it only ever travels in the
    // query string, so the response body is safe to surface.
    throw new Error(`Google TTS request failed (${res.status})${await reason(res)}`);
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("Google TTS: respons audio kosong");
  return { audio: data.audioContent, mime: "audio/mpeg" };
}

export async function googleVoices(apiKey: string): Promise<TtsVoice[]> {
  const res = await fetch(
    `${VOICES}?languageCode=${LANG}&key=${encodeURIComponent(apiKey)}`,
  );
  if (!res.ok) throw new Error(`Google TTS voices failed (${res.status})`);

  const data = (await res.json()) as {
    voices?: { name: string; ssmlGender?: string }[];
  };
  return (data.voices ?? []).map((v) => ({
    name: v.name,
    gender: v.ssmlGender,
    type: voiceType(v.name),
  }));
}

// Google's own explanation for a failed call ("API key not valid", quota, …),
// so the UI can say why instead of guessing. Empty when the body is unusable.
async function reason(res: { text?: () => Promise<string> }): Promise<string> {
  try {
    const raw = (await res.text?.()) ?? "";
    if (!raw) return "";
    let message = raw;
    try {
      message = JSON.parse(raw)?.error?.message ?? raw;
    } catch {
      // not JSON — fall back to the raw body
    }
    return `: ${message.slice(0, 200)}`;
  } catch {
    return "";
  }
}

// id-ID-Chirp3-HD-Kore -> "Chirp3-HD"; id-ID-Neural2-A -> "Neural2"
function voiceType(name: string): string {
  const m = name.match(/^[a-z]{2}-[A-Z]{2}-(.+)-[^-]+$/);
  return m ? m[1] : "Other";
}
