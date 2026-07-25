import { useEffect, useRef, useState } from "react";
import {
  createSession,
  getTurns,
  postTurn,
  deleteSession,
  getSettings,
  saveSettings,
} from "../api.js";
import type { Turn, ExaminerMode } from "../types.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { VoiceVisualizer, type VizState } from "../components/VoiceVisualizer.js";
import { ConfirmModal } from "../components/ConfirmModal.js";

const KEY = "sibiru_session_id";

export function SessionPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [modes, setModes] = useState<ExaminerMode[]>([]);
  const [mode, setMode] = useState<string>("standar");
  const stt = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const mic = useAudioLevel(stt.listening);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [turns]);

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
      tts.speak(reply);
    } catch (e) {
      setErr((e as Error).message);
      setTurns((t) => t.slice(0, -1)); // roll back the optimistic user bubble
    } finally {
      stt.reset();
      setManual("");
      setBusy(false);
    }
  }

  async function reset() {
    setConfirming(false);
    if (sessionId) await deleteSession(sessionId).catch(() => {});
    localStorage.removeItem(KEY);
    const fresh = await createSession();
    localStorage.setItem(KEY, fresh);
    setSessionId(fresh);
    setTurns([]);
    tts.cancel();
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

      <VoiceVisualizer state={vizState} getLevel={mic.getLevel} />

      <div>
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            <strong>{t.role === "examiner" ? "Penguji" : "Anda"}:</strong> {t.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {stt.supported ? (
        <>
          <p><em>{stt.transcript || "(tekan Rekam, lalu bicara)"}</em></p>
          <button
            className={stt.listening ? "rec" : ""}
            onClick={() => (stt.listening ? stt.stop() : stt.start())}
          >
            {stt.listening ? "Berhenti Rekam" : "Rekam"}
          </button>
        </>
      ) : (
        <>
          <p className="error">Browser tidak mendukung Speech Recognition — ketik manual.</p>
          <textarea
            rows={3}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ketik jawaban Anda"
          />
        </>
      )}

      <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem" }}>
        <button className="primary" onClick={send} disabled={busy || !pending.trim()}>
          {busy ? "Mengirim…" : "Kirim"}
        </button>
        <button onClick={() => setConfirming(true)}>Reset Sesi</button>
      </div>

      {err && <p className="error">{err}</p>}

      <ConfirmModal
        open={confirming}
        title="Reset sesi?"
        message="Seluruh riwayat sesi ini akan dihapus permanen."
        onConfirm={reset}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
