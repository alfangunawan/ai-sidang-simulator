import type { Turn, SettingsView, SkripsiInfo } from "./types.js";

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? `HTTP ${res.status}`);
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
}): Promise<SettingsView> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
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
