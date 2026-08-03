import { Router } from "express";
import type Database from "better-sqlite3";
import {
  freshInviteCode, validateInviteCode, getHostCollab, createCollab, setShares, setInviteCode,
  deleteCollab, getMembership, joinByCode, leave, listMembers, kickMember,
} from "../repos/collab.js";
import { getKeyUsageView } from "../repos/usage.js";
import { getUserById } from "../repos/users.js";

const toBit = (v: unknown): 0 | 1 => (v ? 1 : 0);

const MAX_FAILS = 10;
const LOCKOUT_MS = 10 * 60 * 1000;

export function collabRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  // Kode buatan tangan gampang diingat, jadi gampang ditebak juga — dan kode
  // inilah yang membuka pinjaman API key host. Rem sederhana: salah kode
  // MAX_FAILS kali beruntun, akun itu diistirahatkan LOCKOUT_MS.
  // ponytail: hitungan in-memory, cukup untuk satu proses pm2. Kalau backend
  // di-scale multi-instance, pindahkan ke tabel atau Redis.
  const fails = new Map<number, { n: number; until: number }>();

  function hostingState(hostUserId: number) {
    const c = getHostCollab(db, hostUserId);
    if (!c) return null;
    return {
      invite_code: c.invite_code,
      shares: { share_ai: c.share_ai, share_tts: c.share_tts, share_stt: c.share_stt },
      members: listMembers(db, hostUserId),
      usage: getKeyUsageView(db, hostUserId),
    };
  }
  function joinedState(memberUserId: number) {
    const m = getMembership(db, memberUserId);
    if (!m) return null;
    const host = getUserById(db, m.host_user_id);
    return {
      host_username: host?.username ?? "",
      shares: { share_ai: m.share_ai, share_tts: m.share_tts, share_stt: m.share_stt },
    };
  }

  r.get("/", (req, res) => {
    res.json({ hosting: hostingState(req.userId!), joined: joinedState(req.userId!) });
  });

  r.post("/", (req, res) => {
    if (!getHostCollab(db, req.userId!)) {
      createCollab(db, req.userId!, freshInviteCode(db), now());
    }
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.delete("/", (req, res) => {
    deleteCollab(db, req.userId!);
    res.json({ ok: true });
  });

  r.patch("/shares", (req, res) => {
    if (!getHostCollab(db, req.userId!)) return res.status(400).json({ error: "Kamu belum jadi host" });
    setShares(db, req.userId!, {
      share_ai: toBit(req.body?.share_ai), share_tts: toBit(req.body?.share_tts), share_stt: toBit(req.body?.share_stt),
    });
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.post("/regenerate-code", (req, res) => {
    if (!getHostCollab(db, req.userId!)) return res.status(400).json({ error: "Kamu belum jadi host" });
    setInviteCode(db, req.userId!, freshInviteCode(db));
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.put("/code", (req, res) => {
    if (!getHostCollab(db, req.userId!)) return res.status(400).json({ error: "Kamu belum jadi host" });
    const v = validateInviteCode(db, req.body?.code, req.userId!);
    if ("error" in v) return res.status(v.status).json({ error: v.error });
    setInviteCode(db, req.userId!, v.code);
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.post("/join", (req, res) => {
    const rec = fails.get(req.userId!);
    if (rec?.until) {
      if (Date.now() < rec.until) {
        return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi nanti" });
      }
      fails.delete(req.userId!); // masa tunggu habis — hitungan mulai dari nol
    }
    const code = String(req.body?.code ?? "").trim();
    const result = joinByCode(db, req.userId!, code, now());
    if (result.ok) {
      fails.delete(req.userId!);
      return res.json({ joined: joinedState(req.userId!) });
    }
    // Hanya kode yang salah yang dihitung: "sudah tergabung" dan "kolaborasi
    // sendiri" bocor dari state pemakai, bukan dari menebak-nebak kode.
    if (result.reason === "not_found") {
      const n = (fails.get(req.userId!)?.n ?? 0) + 1;
      fails.set(req.userId!, { n, until: n >= MAX_FAILS ? Date.now() + LOCKOUT_MS : 0 });
      return res.status(404).json({ error: "Kode tidak ditemukan" });
    }
    if (result.reason === "own") return res.status(400).json({ error: "Tidak bisa gabung ke kolaborasi sendiri" });
    return res.status(400).json({ error: "Kamu sudah tergabung di sebuah kolaborasi" });
  });

  r.post("/leave", (req, res) => {
    leave(db, req.userId!);
    res.json({ ok: true });
  });

  r.delete("/members/:memberUserId", (req, res) => {
    const memberUserId = Number(req.params.memberUserId);
    if (!Number.isInteger(memberUserId)) return res.status(400).json({ error: "Member tidak valid" });
    kickMember(db, req.userId!, memberUserId);
    res.json({ hosting: hostingState(req.userId!) });
  });

  return r;
}
