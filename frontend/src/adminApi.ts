import { jsonOrThrow } from "./api.js";
import type { AdminOverview, AdminUserRow } from "./types.js";

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
