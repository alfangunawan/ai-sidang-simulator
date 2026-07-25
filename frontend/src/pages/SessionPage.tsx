import { useEffect, useRef, useState } from "react";
import {
  createSession,
  getTurns,
  postTurn,
  getSettings,
  saveSettings,
} from "../api.js";
import type { Turn, ExaminerMode } from "../types.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { VoiceVisualizer, type VizState } from "../components/VoiceVisualizer.js";
import { Transcript } from "../components/Transcript.js";
import { stripMarkdown } from "../lib/markdown.js";
import { turnsToCsv, downloadCsv } from "../lib/csv.js";

const KEY = "sibiru_session_id";

export function SessionPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modes, setModes] = useState<ExaminerMode[]>([]);
  const [mode, setMode] = useState<string>("standar");
  const [ttsProvider, setTtsProvider] = useState<string>("browser");
  const stt = useSpeechRecognition();
  const tts = useSpeechSynthesis(ttsProvider);
  const mic = useAudioLevel(stt.listening);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      let id = localStorage.getItem(KEY);
      if (!id) {
        try {
          id = await createSession();
        } catch {
          return; // backend down on first load; leave as-is
        }
        localStorage.setItem(KEY, id);
      }
      setSessionId(id);
      try {
        setTurns(await getTurns(id));
      } catch {
        // stale id (backend db reset): make a fresh one
        const fresh = await createSession();
        localStorage.setItem(KEY, fresh);
        setSessionId(fresh);
        setTurns([]);
      }
    })();
  }, []);

  // load examiner modes + current mode from settings
  useEffect(() => {
    getSettings()
      .then((s) => {
        setModes(s.examiner_modes);
        setMode(s.examiner_mode);
        setTtsProvider(s.tts_provider);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll the panel, not the page
  }, [turns, busy]);

  const pending = stt.supported ? stt.transcript : manual;
  const vizState: VizState = stt.listening
    ? "listening"
    : tts.speaking
      ? "speaking"
      : "idle";

  async function onModeChange(next: string) {
    setMode(next);
    try {
      await saveSettings({ examiner_mode: next });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function send() {
    if (!sessionId || !pending.trim() || busy) return;
    if (stt.listening) stt.stop();
    setBusy(true);
    setErr(null);
    const transcript = pending.trim();
    setTurns((t) => [...t, { role: "user", content: transcript }]);
    try {
      const reply = await postTurn(sessionId, transcript);
      setTurns((t) => [...t, { role: "examiner", content: reply }]);
      tts.speak(stripMarkdown(reply));
    } catch (e) {
      setErr((e as Error).message);
      setTurns((t) => t.slice(0, -1)); // roll back the optimistic user bubble
    } finally {
      stt.reset();
      setManual("");
      setBusy(false);
    }
  }

  // Start a fresh session. The old one is kept (it lives in Riwayat) — this does
  // not delete anything.
  async function newSession() {
    try {
      const fresh = await createSession();
      localStorage.setItem(KEY, fresh);
      setSessionId(fresh);
      setTurns([]);
      tts.cancel();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function exportCurrent() {
    if (turns.length === 0) return;
    const slug = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    downloadCsv(`sibiru-sesi-${slug}.csv`, turnsToCsv(turns));
  }

  return (
    <div>
      <div className="session-head">
        <h2>Latihan Sidang</h2>
        <label className="mode-picker">
          Mode penguji:{" "}
          <select value={mode} onChange={(e) => onModeChange(e.target.value)}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="orb-stage">
        <VoiceVisualizer state={vizState} getLevel={mic.getLevel} size={150} />
      </div>

      <section className="transcript">
        <header className="transcript-head">
          <span className="transcript-title">Transkrip Sidang</span>
          <div className="head-actions">
            <button
              className="ghost sm"
              onClick={exportCurrent}
              disabled={turns.length === 0}
            >
              Export
            </button>
            <span className={`live ${tts.preparing ? "speaking" : vizState}`}>
              <i className="dot" />
              {tts.preparing
                ? "Menyiapkan suara…"
                : vizState === "speaking"
                  ? "Penguji bicara"
                  : vizState === "listening"
                    ? "Merekam"
                    : "Siap"}
            </span>
          </div>
        </header>

        <div className="transcript-body" ref={scrollRef}>
          {turns.length === 0 && !busy ? (
            <div className="empty">
              <p>Belum ada percakapan.</p>
              <p className="empty-sub">
                Tekan <strong>Rekam</strong>, lalu mulai menjawab pertanyaan penguji.
              </p>
            </div>
          ) : (
            <Transcript turns={turns} />
          )}
          {busy && (
            <div className="bubble examiner">
              <span className="who">Penguji</span>
              <span className="dots" aria-label="Penguji sedang mengetik">
                <i /><i /><i />
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="composer">
        {stt.supported ? (
          <>
            <div className="preview">
              {stt.transcript || "Tekan Rekam, lalu bicara…"}
            </div>
            <div className="composer-actions">
              <button
                className={`rec ${stt.listening ? "on" : ""}`}
                onClick={() => (stt.listening ? stt.stop() : stt.start())}
              >
                {stt.listening ? "Berhenti" : "Rekam"}
              </button>
              <button className="primary" onClick={send} disabled={busy || !pending.trim()}>
                {busy ? "Mengirim…" : "Kirim"}
              </button>
              <button className="ghost" onClick={newSession}>
                Sesi Baru
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="error">
              Browser tidak mendukung Speech Recognition — ketik manual.
            </p>
            <textarea
              rows={3}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ketik jawaban Anda"
            />
            <div className="composer-actions">
              <button className="primary" onClick={send} disabled={busy || !pending.trim()}>
                {busy ? "Mengirim…" : "Kirim"}
              </button>
              <button className="ghost" onClick={newSession}>
                Sesi Baru
              </button>
            </div>
          </>
        )}
      </div>

      {err && <p className="error">{err}</p>}
      {tts.error && <p className="hint">🔇 {tts.error}</p>}
    </div>
  );
}
