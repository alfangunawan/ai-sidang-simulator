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
  countExaminerTurns,
  getSessionMeta,
  setCloseDeclined,
  closeWithAssessment,
} from "../repos/sessions.js";
import {
  buildAssessmentSystem,
  buildAssessmentUser,
  formatTranscript,
  parseAssessment,
  type Assessment,
} from "../assessment.js";
import { stripCloseMarker, shouldProposeClose, withNonAnswerNudge } from "../sidang.js";
import { recordUsage } from "../repos/usage.js";
import { ASSESSMENT_MAX_TOKENS } from "../providers/types.js";

// Internal marker: the model hit its output ceiling before finishing the JSON.
const TRUNCATED = "assessment truncated";

export function sessionsRouter(
  db: Database.Database,
  key: Buffer,
  now: () => string = () => new Date().toISOString(),
  uuid: () => string = () => randomUUID(),
): Router {
  const r = Router();

  r.post("/", (req, res) => {
    const userId = req.userId!;
    const id = uuid();
    createSession(db, userId, id, now(), (req.body?.label as string) ?? null);
    res.json({ session_id: id });
  });

  r.get("/", (req, res) => {
    const userId = req.userId!;
    res.json({ sessions: listSessions(db, userId) });
  });

  r.get("/:id/turns", (req, res) => {
    const userId = req.userId!;
    if (!sessionExists(db, req.params.id, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    res.json({ turns: getTurns(db, req.params.id) });
  });

  r.post("/:id/turn", async (req, res) => {
    const userId = req.userId!;
    const sessionId = req.params.id;
    const transcript = (req.body?.transcript ?? "").toString().trim();

    if (!sessionExists(db, sessionId, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    const meta = getSessionMeta(db, sessionId, userId);
    if (meta?.status === "closed") {
      return res.status(409).json({ error: "Sidang sudah ditutup" });
    }
    if (!transcript) {
      return res.status(400).json({ error: "Transkrip kosong" });
    }
    if (getSetting(db, userId, "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu" });
    }
    const doc = getActiveDocument(db, userId);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }

    let userTurnNumber: number | undefined;
    try {
      const history = getTurns(db, sessionId);
      userTurnNumber = nextTurnNumber(db, sessionId);
      addTurn(db, sessionId, userTurnNumber, "user", transcript, now());

      const cfg = getActiveConfig(db, userId, key);
      const provider = getProvider(cfg);
      const personaAttack = buildPersona(
        cfg.examinerMode,
        cfg.attackPoints,
        cfg.examinerType,
      );
      // The nudge steers the model only; the transcript keeps what was actually said.
      const result = await provider.sendTurn(
        personaAttack,
        doc.full_text,
        history,
        withNonAnswerNudge(transcript),
      );

      // Recorded before the empty-reply guard: the call was billed either way.
      recordUsage(db, userId, now(), cfg.provider, cfg.model, "turn", result.usage);

      const { reply, hasMarker } = stripCloseMarker(result.reply);

      // A blank reply (reasoning model spending its whole budget before writing
      // any text) must not land in the transcript as an empty bubble.
      if (!reply) {
        throw new Error("empty reply from provider");
      }

      addTurn(db, sessionId, nextTurnNumber(db, sessionId), "examiner", reply, now());

      const examinerCount = countExaminerTurns(db, sessionId);
      const propose_close = shouldProposeClose({
        hasMarker,
        examinerCount,
        declinedTurn: meta?.close_declined_turn ?? null,
      });
      res.json({ reply, propose_close });
    } catch (err) {
      // Never leak provider internals / keys.
      console.error("[turn error]", (err as Error).message);
      if (userTurnNumber !== undefined) {
        deleteTurn(db, sessionId, userTurnNumber);
      }
      res.status(500).json({
        error:
          (err as Error).message === "empty reply from provider"
            ? "Penguji tidak memberi jawaban — coba kirim ulang"
            : "Gagal memanggil penguji AI",
      });
    }
  });

  r.delete("/:id", (req, res) => {
    const userId = req.userId!;
    deleteSession(db, req.params.id, userId);
    res.json({ ok: true });
  });

  r.post("/:id/continue", (req, res) => {
    const userId = req.userId!;
    const sessionId = req.params.id;
    if (!sessionExists(db, sessionId, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    setCloseDeclined(db, sessionId, countExaminerTurns(db, sessionId));
    res.json({ ok: true });
  });

  r.post("/:id/close", async (req, res) => {
    const userId = req.userId!;
    const sessionId = req.params.id;
    if (!sessionExists(db, sessionId, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    const meta = getSessionMeta(db, sessionId, userId);
    if (meta?.status === "closed" && meta.assessment) {
      return res.json({ assessment: JSON.parse(meta.assessment) as Assessment });
    }
    if (getSetting(db, userId, "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu" });
    }
    const doc = getActiveDocument(db, userId);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }

    try {
      const cfg = getActiveConfig(db, userId, key);
      const provider = getProvider(cfg);
      const system = buildAssessmentSystem();
      const user = buildAssessmentUser(doc.full_text, formatTranscript(getTurns(db, sessionId)));

      // Every attempt is billed, so each one is recorded — including the one
      // whose output failed to parse.
      const attempt = async () => {
        const out = await provider.generate(system, user, ASSESSMENT_MAX_TOKENS);
        recordUsage(db, userId, now(), cfg.provider, cfg.model, "assessment", out.usage);
        if (out.truncated) throw new Error(TRUNCATED);
        return parseAssessment(out.text);
      };

      let assessment: Assessment;
      try {
        assessment = await attempt();
      } catch (e) {
        // A truncated answer is deterministic: the retry would cost the same
        // and fail the same way. Only a garbled-but-complete answer is worth
        // a second try.
        if ((e as Error).message === TRUNCATED) throw e;
        assessment = await attempt();
      }

      closeWithAssessment(db, sessionId, now(), JSON.stringify(assessment));
      res.json({ assessment });
    } catch (err) {
      console.error("[close error]", (err as Error).message);
      res.status(500).json({
        error:
          (err as Error).message === TRUNCATED
            ? "Penilaian terpotong — model kehabisan token output sebelum selesai. Coba model lain di Pengaturan."
            : "Gagal menilai sidang, coba lagi",
      });
    }
  });

  r.get("/:id/result", (req, res) => {
    const userId = req.userId!;
    const sessionId = req.params.id;
    if (!sessionExists(db, sessionId, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    const meta = getSessionMeta(db, sessionId, userId);
    res.json({
      status: meta?.status ?? "active",
      assessment: meta?.assessment ? (JSON.parse(meta.assessment) as Assessment) : null,
    });
  });

  return r;
}
