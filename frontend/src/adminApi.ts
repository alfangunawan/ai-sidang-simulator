import { jsonOrThrow } from "./api.js";
import type { AdminOverview } from "./types.js";

export async function getOverview(): Promise<AdminOverview> {
  return jsonOrThrow(await fetch("/api/admin/overview"));
}
