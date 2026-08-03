import { Router } from "express";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getProvider } from "../providers/index.js";
import { getSetting } from "../repos/settings.js";
import { getEffectiveLlmConfig, resolveSourceUser } from "../effectiveConfig.js";
import { getActiveDocument, getDossierRow } from "../repos/documents.js";
import { getChunks } from "../repos/chunks.js";
import { buildPersona } from "../persona.js";
import { normalizePhases, sessionPhases, pagesForPhases, scheduledPhase } from "../phases.js";
import { buildPhaseBlock } from "../questionBank.js";
import { listQuestions } from "../repos/questions.js";
import { formatDossier, type Dossier } from "../dossier.js";
import { retrieve, formatExcerpts, formatChunks, scopeToPages } from "../retrieval.js";
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
  closeUnscored,
  closeWithAssessment,
} from "../repos/sessions.js";
import {
  buildAssessmentSystem,
  buildAssessmentUser,
  formatTranscript,
  parseAssessment,
  type Assessment,
} from "../assessment.js";
import {
  stripCloseMarker,
  shouldProposeClose,
  withNonAnswerNudge,
  closeStatus,
  phaseDirective,
  closeFloor,
  looksLikeClosing,
  minQuestions,
  EARLY_CLOSE_RETRY,
} from "../sidang.js";
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
    let phases: string[] | null;
    try {
      phases = normalizePhases(req.body?.phases);
    } catch {
      return res.status(400).json({ error: "Pilihan fase tidak valid" });
    }
    createSession(db, userId, id, now(), (req.body?.label as string) ?? null, phases?.join(",") ?? null);
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
    if (getSetting(db, resolveSourceUser(db, userId, "ai"), "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu (atau gabung kolaborasi yang membagikan AI)" });
    }
    const doc = getActiveDocument(db, userId);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }
    const dossierRow = getDossierRow(db, doc.id);
    // Tidak ada jatuh-balik diam-diam ke full_text: itu menyembunyikan kegagalan
    // dan mengembalikan biaya 147k token per giliran tanpa user tahu.
    if (dossierRow?.dossier_status !== "ready" || !dossierRow.dossier) {
      return res.status(400).json({
        error:
          dossierRow?.dossier_status === "pending"
            ? "Skripsi masih dianalisis — tunggu sebentar lalu coba lagi"
            : "Dossier skripsi belum siap. Buka Pengaturan untuk membangun ulang.",
      });
    }

    let userTurnNumber: number | undefined;
    try {
      const history = getTurns(db, sessionId);
      userTurnNumber = nextTurnNumber(db, sessionId);
      addTurn(db, sessionId, userTurnNumber, "user", transcript, now());

      const cfg = getEffectiveLlmConfig(db, userId, key);
      const provider = getProvider(cfg);
      // Agenda sesi ini: bab yang dipilih mahasiswa saat memulai sidang.
      const agenda = sessionPhases(meta?.phases);
      const personaAttack = buildPersona(
        cfg.examinerMode,
        cfg.attackPoints,
        cfg.examinerType,
        agenda,
      );
      const parsedDossier = JSON.parse(dossierRow.dossier) as Dossier;
      const askedSoFar = countExaminerTurns(db, sessionId);
      // Fase giliran ini ditetapkan server, bukan ditaksir model. Bahan
      // dipersempit ke fase itu saja — bank pertanyaan, poin serangan, dan
      // kutipan naskah — supaya penugasannya punya gigi, bukan sekadar imbauan.
      const turnPhase = scheduledPhase(askedSoFar, agenda, minQuestions(agenda));
      const ritual = turnPhase === "Pembukaan" || turnPhase === "Penutup";
      const material = ritual ? agenda : [turnPhase];
      const dossier = formatDossier(parsedDossier, material);
      const phaseBlock = buildPhaseBlock(
        askedSoFar,
        parsedDossier.modul_kritik_terpicu,
        listQuestions(db),
        agenda,
        ritual ? undefined : turnPhase,
      );

      // Kueri retrieval memakai pertanyaan penguji terakhir DAN jawaban
      // mahasiswa: pertanyaannya yang menetapkan topik, jawabannya yang
      // menentukan bagian naskah mana yang perlu dikonfrontasi.
      const lastExaminer = [...history].reverse().find((t) => t.role === "examiner");
      const excerpts = retrieve(
        // Sidang sebagian: kutipan dibatasi bab yang memang diuji, kalau tidak
        // potongan naskah dari bab lain menarik penguji keluar agenda.
        scopeToPages(getChunks(db, doc.id), pagesForPhases(material, parsedDossier.peta_bab)),
        `${lastExaminer?.content ?? ""} ${transcript}`,
      );

      // The nudge and the close status steer the model only; the transcript
      // keeps what was actually said.
      const min = minQuestions(agenda);
      const declinedTurn = meta?.close_declined_turn ?? null;
      const ask = async (correction = "") => {
        const out = await provider.sendTurn({
          persona: personaAttack,
          dossier,
          phaseBlock,
          history,
          userInput:
            withNonAnswerNudge(transcript) +
            phaseDirective(turnPhase) +
            closeStatus(askedSoFar, declinedTurn, min) +
            correction +
            formatExcerpts(excerpts),
        });
        // Recorded before the empty-reply guard: the call was billed either way.
        recordUsage(db, userId, resolveSourceUser(db, userId, "ai"), now(), cfg.provider, cfg.model, "turn", out.usage);
        return stripCloseMarker(out.reply);
      };

      let { reply, hasMarker } = await ask();

      // Penutup yang datang sebelum gerbang buka tidak boleh masuk transkrip:
      // sekali tersimpan, model membacanya di riwayat dan tidak bisa kembali
      // bertanya — dan jatah rangkumannya habis sebelum giliran penutup asli.
      if (askedSoFar + 1 < closeFloor(declinedTurn, min) && looksLikeClosing(reply, hasMarker)) {
        ({ reply, hasMarker } = await ask(EARLY_CLOSE_RETRY));
      }

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
        declinedTurn,
        min,
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

  // Keluar tanpa nilai. Bukan cabang di dalam /close: penjaga di sana (API key,
  // dossier siap, panggilan LLM, retry) semuanya tentang penilaian, dan tidak
  // satu pun berlaku untuk mahasiswa yang cuma ingin berhenti.
  r.post("/:id/exit", (req, res) => {
    const userId = req.userId!;
    const sessionId = req.params.id;
    if (!sessionExists(db, sessionId, userId)) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }
    closeUnscored(db, sessionId, now());
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
    if (getSetting(db, resolveSourceUser(db, userId, "ai"), "api_key") === null) {
      return res.status(400).json({ error: "Set API key di Settings dulu (atau gabung kolaborasi yang membagikan AI)" });
    }
    const doc = getActiveDocument(db, userId);
    if (!doc) {
      return res.status(400).json({ error: "Upload skripsi (PDF) dulu" });
    }
    const closeDossier = getDossierRow(db, doc.id);
    if (closeDossier?.dossier_status !== "ready" || !closeDossier.dossier) {
      return res.status(400).json({
        error: "Dossier skripsi belum siap. Buka Pengaturan untuk membangun ulang.",
      });
    }

    try {
      const cfg = getEffectiveLlmConfig(db, userId, key);
      const provider = getProvider(cfg);
      const system = buildAssessmentSystem();
      const transcript = formatTranscript(getTurns(db, sessionId));
      // Bagian naskah yang paling menyangkut apa yang benar-benar dibahas.
      // PRD §8 menyebut "chunk paling sering ter-retrieve selama sesi"; satu
      // pencarian dengan transkrip penuh sebagai kueri memberi hasil yang sama
      // tanpa harus mencatat riwayat retrieval tiap giliran.
      const closeAgenda = sessionPhases(meta?.phases);
      const closeParsed = JSON.parse(closeDossier.dossier) as Dossier;
      const excerpts = retrieve(
        scopeToPages(getChunks(db, doc.id), pagesForPhases(closeAgenda, closeParsed.peta_bab)),
        transcript,
        5,
      );
      const user = buildAssessmentUser(
        formatDossier(closeParsed, closeAgenda),
        transcript,
        formatChunks(excerpts),
        // Hanya untuk sidang sebagian bab: tanpa ini penilai menghukum
        // mahasiswa atas fase yang memang tidak pernah ditanyakan penguji.
        meta?.phases ? sessionPhases(meta.phases) : undefined,
      );

      // Every attempt is billed, so each one is recorded — including the one
      // whose output failed to parse.
      const attempt = async () => {
        const out = await provider.generate(system, user, ASSESSMENT_MAX_TOKENS);
        recordUsage(db, userId, resolveSourceUser(db, userId, "ai"), now(), cfg.provider, cfg.model, "assessment", out.usage);
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
