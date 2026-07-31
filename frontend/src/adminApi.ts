import { jsonOrThrow } from "./api.js";
import type {
  AdminOverview,
  AdminUserRow,
  AdminSessionRow,
  AdminCodeRow,
  Turn,
  Assessment,
} from "./types.js";
import type { Persona } from "./personas.js";

export async function getOverview(): Promise<AdminOverview> {
  return jsonOrThrow(await fetch("/api/admin/overview"));
}

export async function listUsers(): Promise<AdminUserRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/users"))).users;
}

export async function patchUser(
  id: number,
  body: { suspended?: boolean; is_admin?: boolean },
): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteUser(id: number): Promise<void> {
  await jsonOrThrow(await fetch(`/api/admin/users/${id}`, { method: "DELETE" }));
}

export async function listAllSessions(userId?: number): Promise<AdminSessionRow[]> {
  const q = userId === undefined ? "" : `?user_id=${userId}`;
  return (await jsonOrThrow(await fetch(`/api/admin/sessions${q}`))).sessions;
}

export async function getAdminSession(
  id: string,
): Promise<{ session: AdminSessionRow; turns: Turn[]; assessment: Assessment | null }> {
  return jsonOrThrow(await fetch(`/api/admin/sessions/${id}`));
}

export async function listCodes(): Promise<AdminCodeRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/codes"))).codes;
}

export async function kickMember(hostId: number, memberId: number): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/codes/${hostId}/members/${memberId}`, { method: "DELETE" }),
  );
}

export async function getQuestions(): Promise<{
  phases: string[];
  bank: Record<string, string[]>;
}> {
  return jsonOrThrow(await fetch("/api/admin/questions"));
}

export async function putQuestions(phase: string, texts: string[]): Promise<void> {
  await jsonOrThrow(
    await fetch("/api/admin/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, texts }),
    }),
  );
}

export type AdminPersonaRow = Persona & { position: number; active: boolean };

export async function listAdminPersonas(): Promise<AdminPersonaRow[]> {
  return (await jsonOrThrow(await fetch("/api/admin/personas"))).personas;
}

export async function putPersona(row: AdminPersonaRow): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/admin/personas/${row.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    }),
  );
}

export async function deletePersona(key: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/admin/personas/${key}`, { method: "DELETE" }));
}
