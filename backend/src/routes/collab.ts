import { Router } from "express";
import type Database from "better-sqlite3";
import {
  freshInviteCode, getHostCollab, createCollab, setShares, regenerateCode,
  deleteCollab, getMembership, joinByCode, leave, listMembers, kickMember,
} from "../repos/collab.js";
import { getKeyUsageView } from "../repos/usage.js";
import { getUserById } from "../repos/users.js";

const toBit = (v: unknown): 0 | 1 => (v ? 1 : 0);

export function collabRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

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
    regenerateCode(db, req.userId!, freshInviteCode(db));
    res.json({ hosting: hostingState(req.userId!) });
  });

  r.post("/join", (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    const result = joinByCode(db, req.userId!, code, now());
    if (result.ok) return res.json({ joined: joinedState(req.userId!) });
    if (result.reason === "not_found") return res.status(404).json({ error: "Kode tidak ditemukan" });
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
