import { Router } from "express";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getProvider } from "../providers/index.js";
import { getActiveConfig, getSetting } from "../repos/settings.js";
import { getActiveDocument } from "../repos/documents.js";
import { buildPersona } from "../persona.js";
import {
  createSession,
  listSessions,
  sessionExists,
  getTurns,
  nextTurnNumber,
  addTurn,
  deleteSession,
  deleteTurn,
} from "../repos/sessions.js";

export function sessionsRouter(
  db: Database.Database,
  key: Buffer,
  now: () => string = () => new Date().toISOString(),
  uuid: () => string = () => randomUUID(),
): Router {
  const r = Router();

  r.post("/", (req, res) => {
    const id = uuid();
    createSession(db, id, now(), (req.body?.label as string) ?? null);
    res.json({ session_id: id });
  });

  r.get("/", (_req, res) => {
    res.json({ sessions: listSessions(db) });
  });

  r.get("/:id/turns", (req, res) => {
    res.json({ turns: getTurns(db, req.params.id) });
  });

  r.post("/:id/turn", async (req, res) => {
    const sessionId = req.params.id;
    const transcript = (req.body?.transcript ?? "").toString().trim();

    if (!sessionExists(db, sessionId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    if (!transcript) {
      return res.status(400).json({ error: "Transkrip kosong" });
    }
    if (getSetting(db, "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu" });
    }
    const doc = getActiveDocument(db);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }

    let userTurnNumber: number | undefined;
    try {
      const history = getTurns(db, sessionId);
      userTurnNumber = nextTurnNumber(db, sessionId);
      addTurn(db, sessionId, userTurnNumber, "user", transcript, now());

      const cfg = getActiveConfig(db, key);
      const provider = getProvider(cfg);
      const personaAttack = buildPersona(cfg.examinerMode, cfg.attackPoints);
      const result = await provider.sendTurn(
        personaAttack,
        doc.full_text,
        history,
        transcript,
      );

      if (result.usage) {
        console.log("[turn usage]", result.usage);
      }

      addTurn(
        db,
        sessionId,
        nextTurnNumber(db, sessionId),
        "examiner",
        result.reply,
        now(),
      );
      res.json({ reply: result.reply });
    } catch (err) {
      // Never leak provider internals / keys.
      console.error("[turn error]", (err as Error).message);
      if (userTurnNumber !== undefined) {
        deleteTurn(db, sessionId, userTurnNumber);
      }
      res.status(500).json({ error: "Gagal memanggil penguji AI" });
    }
  });

  r.delete("/:id", (req, res) => {
    deleteSession(db, req.params.id);
    res.json({ ok: true });
  });

  return r;
}
