import { Router } from "express";
import type Database from "better-sqlite3";
import { getOverview, listUsers, getUserDetail, deleteUserCompletely, listAllSessions, getSessionForAdmin, listAllCodes } from "../repos/admin.js";
import { getUserById, setAdmin, setSuspended, countAdmins } from "../repos/users.js";
import { kickMember } from "../repos/collab.js";
import { listQuestions, replacePhase } from "../repos/questions.js";
import { SIDANG_PHASES } from "../phases.js";
import { listPersonas, upsertPersona, deletePersona } from "../repos/personas.js";
import type { PersonaRow } from "../personas.js";

export function adminRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.get("/overview", (_req, res) => {
    res.json(getOverview(db, now()));
  });

  r.get("/users", (_req, res) => {
    res.json({ users: listUsers(db) });
  });

  r.get("/users/:id", (req, res) => {
    const detail = getUserDetail(db, Number(req.params.id));
    if (!detail) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    res.json(detail);
  });

  /**
   * Pagarnya di sini, bukan di UI: menyembunyikan tombol bukan batas keamanan.
   * Dua aturan menutup dua jalur ke kunci-keluar yang sama — mencabut diri
   * sendiri, dan mencabut admin terakhir yang tersisa.
   */
  r.patch("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    const target = getUserById(db, id);
    if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan" });

    const self = id === req.userId;
    const { suspended, is_admin } = req.body ?? {};

    if (suspended !== undefined && typeof suspended !== "boolean") {
      return res.status(400).json({ error: "Nilai suspended harus boolean" });
    }
    if (is_admin !== undefined && typeof is_admin !== "boolean") {
      return res.status(400).json({ error: "Nilai is_admin harus boolean" });
    }

    if (self && (suspended === true || is_admin === false)) {
      return res.status(400).json({ error: "Tidak bisa menangguhkan atau mencabut diri sendiri" });
    }
    if (is_admin === false && target.is_admin && countAdmins(db) <= 1) {
      return res.status(400).json({ error: "Admin terakhir tidak bisa dicabut" });
    }

    if (suspended !== undefined) setSuspended(db, id, suspended ? 1 : 0);
    if (is_admin !== undefined) setAdmin(db, id, is_admin ? 1 : 0);
    res.json({ ok: true });
  });

  r.delete("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!getUserById(db, id)) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    if (id === req.userId) {
      return res.status(400).json({ error: "Tidak bisa menghapus diri sendiri" });
    }
    deleteUserCompletely(db, id);
    res.json({ ok: true });
  });

  r.get("/sessions", (req, res) => {
    const raw = req.query.user_id;
    if (raw !== undefined && (typeof raw !== "string" || !/^\d+$/.test(raw))) {
      return res.status(400).json({ error: "user_id harus berupa angka positif" });
    }
    const userId = raw === undefined ? undefined : Number(raw);
    res.json({ sessions: listAllSessions(db, { userId }) });
  });

  r.get("/sessions/:id", (req, res) => {
    const found = getSessionForAdmin(db, req.params.id);
    if (!found) return res.status(404).json({ error: "Sesi tidak ditemukan" });
    res.json(found);
  });

  r.get("/codes", (_req, res) => {
    res.json({ codes: listAllCodes(db) });
  });

  r.delete("/codes/:hostId/members/:memberId", (req, res) => {
    const hostId = req.params.hostId;
    const memberId = req.params.memberId;
    if (!/^\d+$/.test(hostId)) {
      return res.status(400).json({ error: "hostId harus berupa angka positif" });
    }
    if (!/^\d+$/.test(memberId)) {
      return res.status(400).json({ error: "memberId harus berupa angka positif" });
    }
    kickMember(db, Number(hostId), Number(memberId));
    res.json({ ok: true });
  });

  r.get("/questions", (_req, res) => {
    res.json({ phases: SIDANG_PHASES, bank: listQuestions(db) });
  });

  r.put("/questions", (req, res) => {
    const phase = String(req.body?.phase ?? "");
    const texts = req.body?.texts;
    // Fase divalidasi terhadap agenda: baris bebas boleh, nama fase tidak —
    // fase asing tidak akan pernah terbaca dan hanya jadi sampah diam-diam.
    if (!SIDANG_PHASES.includes(phase)) {
      return res.status(400).json({ error: "Fase tidak dikenal" });
    }
    if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) {
      return res.status(400).json({ error: "Daftar pertanyaan harus berupa teks" });
    }
    replacePhase(db, phase, texts);
    res.json({ ok: true });
  });

  r.get("/personas", (_req, res) => {
    res.json({ personas: listPersonas(db, { includeInactive: true }) });
  });

  r.put("/personas/:key", (req, res) => {
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const row: PersonaRow = {
      key: req.params.key,
      name: text(b.name),
      initials: text(b.initials),
      role: text(b.role),
      mode: text(b.mode),
      type: text(b.type),
      color: text(b.color) || "#475569",
      trait: text(b.trait),
      position: Number.isFinite(b.position) ? Number(b.position) : 0,
      active: b.active !== false,
    };
    if (!row.name || !row.initials || !row.mode || !row.type) {
      return res.status(400).json({ error: "Nama, inisial, mode, dan tipe wajib diisi" });
    }
    upsertPersona(db, row);
    res.json({ ok: true });
  });

  r.delete("/personas/:key", (req, res) => {
    // Picker mahasiswa tidak boleh berakhir kosong.
    const active = listPersonas(db);
    if (active.length <= 1 && active.some((p) => p.key === req.params.key)) {
      return res.status(400).json({ error: "Persona terakhir tidak bisa dihapus" });
    }
    deletePersona(db, req.params.key);
    res.json({ ok: true });
  });

  return r;
}
