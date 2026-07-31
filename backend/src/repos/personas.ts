import type Database from "better-sqlite3";
import { PERSONA_SEED, type PersonaRow } from "../personas.js";

type Row = Omit<PersonaRow, "active"> & { active: number };

export function listPersonas(
  db: Database.Database,
  opts: { includeInactive?: boolean } = {},
): PersonaRow[] {
  const where = opts.includeInactive ? "" : "WHERE active = 1";
  const rows = db
    .prepare(`SELECT * FROM personas ${where} ORDER BY position, key`)
    .all() as Row[];
  return rows.map((r) => ({ ...r, active: r.active === 1 }));
}

export function upsertPersona(db: Database.Database, p: PersonaRow): void {
  db.prepare(
    `INSERT INTO personas (key, name, initials, role, mode, type, color, trait, position, active)
     VALUES (@key, @name, @initials, @role, @mode, @type, @color, @trait, @position, @active)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name, initials = excluded.initials, role = excluded.role,
       mode = excluded.mode, type = excluded.type, color = excluded.color,
       trait = excluded.trait, position = excluded.position, active = excluded.active`,
  ).run({ ...p, active: p.active ? 1 : 0 });
}

export function deletePersona(db: Database.Database, key: string): void {
  db.prepare("DELETE FROM personas WHERE key = ?").run(key);
}

export function seedPersonas(db: Database.Database): void {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM personas").get() as { c: number };
  if (c > 0) return;
  for (const p of PERSONA_SEED) upsertPersona(db, p);
}
