import type {
  Turn,
  SettingsView,
  SkripsiInfo,
  SessionSummary,
  TtsVoice,
  TtsAudio,
  TestResult,
  Assessment,
  UsageView,
} from "./types.js";

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

export async function postTurn(
  id: string,
  transcript: string,
): Promise<{ reply: string; propose_close: boolean }> {
  const res = await fetch(`/api/sessions/${id}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  const data = await jsonOrThrow(res);
  return { reply: data.reply, propose_close: !!data.propose_close };
}

export async function continueSession(id: string): Promise<void> {
  await jsonOrThrow(await postJson(`/api/sessions/${id}/continue`, {}));
}

export async function closeSession(id: string): Promise<Assessment> {
  return (await jsonOrThrow(await postJson(`/api/sessions/${id}/close`, {}))).assessment;
}

export async function getResult(
  id: string,
): Promise<{ status: string; assessment: Assessment | null }> {
  return jsonOrThrow(await fetch(`/api/sessions/${id}/result`));
}

export async function deleteSession(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/sessions/${id}`, { method: "DELETE" }));
}

export async function getSettings(): Promise<SettingsView> {
  return jsonOrThrow(await fetch("/api/settings"));
}

export async function getUsage(): Promise<UsageView> {
  return jsonOrThrow(await fetch("/api/settings/usage"));
}

export async function resetUsage(): Promise<UsageView> {
  return jsonOrThrow(await fetch("/api/settings/usage", { method: "DELETE" }));
}

export async function saveSettings(body: {
  provider?: string;
  api_key?: string;
  model?: string;
  attack_points?: string;
  examiner_mode?: string;
  examiner_type?: string;
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

export async function testLlm(body: {
  provider?: string;
  model?: string;
  api_key?: string;
}): Promise<TestResult> {
  return jsonOrThrow(await postJson("/api/settings/test-llm", body));
}

export async function testTts(body: {
  provider?: string;
  key?: string;
}): Promise<TestResult> {
  return jsonOrThrow(await postJson("/api/tts/test", body));
}

export async function testStt(body: {
  provider?: string;
  key?: string;
}): Promise<TestResult> {
  return jsonOrThrow(await postJson("/api/stt/test", body));
}

// Uploads one recorded answer and returns what the server-side model heard.
export async function sttTranscribe(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, filename);
  const res = await fetch("/api/stt/transcribe", { method: "POST", body: form });
  return (await jsonOrThrow(res)).text ?? "";
}

export async function ttsPreview(body: {
  provider?: string;
  voice: string;
  key?: string;
}): Promise<TtsAudio> {
  return jsonOrThrow(await postJson("/api/tts/preview", body));
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
