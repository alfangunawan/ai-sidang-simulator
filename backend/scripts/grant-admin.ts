/**
 * Menjadikan seorang pengguna admin. Admin berikutnya dibuat lewat panel,
 * tapi yang pertama harus dari sini — panelnya sendiri butuh admin untuk dibuka.
 *
 *   npx tsx scripts/grant-admin.ts <username> [path/ke/sibiru.sqlite]
 */
import Database from "better-sqlite3";
import { openDb } from "../src/db.js";
import { getUserByUsername, setAdmin } from "../src/repos/users.js";

export function grantAdmin(
  db: Database.Database,
  username: string,
): { ok: true; id: number } | { ok: false; reason: "not_found" } {
  const user = getUserByUsername(db, username);
  if (!user) return { ok: false, reason: "not_found" };
  setAdmin(db, user.id, 1);
  return { ok: true, id: user.id };
}

function main(): void {
  const [username, path = "data/sibiru.sqlite"] = process.argv.slice(2);
  if (!username) {
    console.error("Pakai: npx tsx scripts/grant-admin.ts <username> [db]");
    process.exit(1);
  }
  const result = grantAdmin(openDb(path), username);
  if (!result.ok) {
    console.error(`Pengguna "${username}" tidak ditemukan di ${path}`);
    process.exit(1);
  }
  console.log(`OK — ${username} (id ${result.id}) sekarang admin`);
}

// Hanya jalan sebagai CLI; saat di-import tes, hanya fungsinya yang dipakai.
if (process.argv[1]?.endsWith("grant-admin.ts")) main();
