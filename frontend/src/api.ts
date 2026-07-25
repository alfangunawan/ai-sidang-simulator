import type {
  Turn,
  SettingsView,
  SkripsiInfo,
  SessionSummary,
  TtsVoice,
  TtsAudio,
} from "./types.js";

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const serverError = (data as any)?.error;
    if (typeof serverError === "string") throw new Error(serverError);
    // No JSON `{error}` body → not the backend's own error (e.g. the Vite dev
    // proxy returning 500 because the backend isn't running).
    throw new Error(
      `Tidak bisa terhubung ke server (HTTP ${res.status}). Pastikan backend berjalan: jalankan "cd backend && npm run dev".`,
    );
  }
  return data;
}

export async function createSession(): Promise<string> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return (await jsonOrThrow(res)).session_id;
}

export async function getTurns(id: string): Promise<Turn[]> {
  const res = await fetch(`/api/sessions/${id}/turns`);
  return (await jsonOrThrow(res)).turns;
}

export async function listSessions(): Promise<SessionSummary[]> {
  return (await jsonOrThrow(await fetch("/api/sessions"))).sessions;
}

export async function postTurn(id: string, transcript: string): Promise<string> {
  const res = await fetch(`/api/sessions/${id}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  return (await jsonOrThrow(res)).reply;
}

export async function deleteSession(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/sessions/${id}`, { method: "DELETE" }));
}

export async function getSettings(): Promise<SettingsView> {
  return jsonOrThrow(await fetch("/api/settings"));
}

export async function saveSettings(body: {
  provider?: string;
  api_key?: string;
  model?: string;
  attack_points?: string;
  examiner_mode?: string;
  tts_provider?: string;
  tts_voice?: string;
  google_tts_key?: string;
  openai_tts_key?: string;
}): Promise<SettingsView> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function ttsSpeak(text: string): Promise<TtsAudio> {
  const res = await fetch("/api/tts/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return jsonOrThrow(res);
}

export async function getTtsVoices(provider: string): Promise<TtsVoice[]> {
  const res = await fetch(`/api/tts/voices?provider=${encodeURIComponent(provider)}`);
  return (await jsonOrThrow(res)).voices;
}

export async function getSkripsi(): Promise<SkripsiInfo | null> {
  return jsonOrThrow(await fetch("/api/skripsi"));
}

export async function uploadSkripsi(file: File): Promise<SkripsiInfo> {
  const form = new FormData();
  form.append("file", file);
  return jsonOrThrow(await fetch("/api/skripsi", { method: "POST", body: form }));
}

export async function deleteSkripsi(): Promise<void> {
  await jsonOrThrow(await fetch("/api/skripsi", { method: "DELETE" }));
}
