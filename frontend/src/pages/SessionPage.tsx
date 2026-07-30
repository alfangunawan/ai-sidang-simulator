import { useEffect, useRef, useState } from "react";
import {
  createSession,
  getTurns,
  postTurn,
  getSettings,
  closeSession,
  continueSession,
} from "../api.js";
import type { Turn, Assessment } from "../types.js";
import { personaFor, DEFAULT_PERSONA, MODE_LABELS } from "../personas.js";
import type { Persona } from "../personas.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { VoiceVisualizer, type VizState } from "../components/VoiceVisualizer.js";
import { Transcript } from "../components/Transcript.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { stripMarkdown } from "../lib/markdown.js";
import { turnsToCsv, downloadCsv } from "../lib/csv.js";

export const SESSION_KEY = "sibiru_session_id";
// When the practice clock started, kept per session so a refresh resumes the
// same count instead of restarting it — and so it stays at 0:00 until the
// student actually begins.
const START_KEY = "sibiru_session_started_at";

/** Forget the current sitting so the next mount opens a brand-new session. */
export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(START_KEY);
}

export function hasStoredSession(): boolean {
  return localStorage.getItem(SESSION_KEY) !== null;
}

function loadStart(id: string): number | null {
  try {
    const raw = localStorage.getItem(START_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { id?: string; at?: number };
    return saved?.id === id && typeof saved.at === "number" ? saved.at : null;
  } catch {
    return null;
  }
}

const WAVE_BARS = Array.from({ length: 20 }, (_, i) => ({
  height: 10 + ((i * 7) % 18),
  delay: (i * 0.06).toFixed(2),
  duration: (0.7 + (i % 5) * 0.13).toFixed(2),
}));

function clock(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  onClosed: (a: Assessment) => void;
  /** "Sesi Baru" hands the student back to the persona picker, not a silent reset. */
  onNewSession: () => void;
}

export function SessionPage({ onClosed, onNewSession }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [ttsProvider, setTtsProvider] = useState<string>("browser");
  const [sttProvider, setSttProvider] = useState<string>("browser");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSource, setCloseSource] = useState<"ai" | "manual">("manual");
  // The examiner asked to wrap up. Shown as a banner under the transcript, not
  // as a modal — a modal would cover the closing reply the student needs to read.
  const [proposeClose, setProposeClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recSecs, setRecSecs] = useState(0);
  const stt = useSpeechRecognition(sttProvider);
  const tts = useSpeechSynthesis(ttsProvider);
  const mic = useAudioLevel(stt.listening);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        try {
          id = await createSession();
        } catch {
          return; // backend down on first load; leave as-is
        }
        localStorage.setItem(SESSION_KEY, id);
      }
      setSessionId(id);
      setStartedAt(loadStart(id));
      try {
        setTurns(await getTurns(id));
      } catch {
        // stale id (backend db reset): make a fresh one
        const fresh = await createSession();
        localStorage.setItem(SESSION_KEY, fresh);
        localStorage.removeItem(START_KEY);
        setSessionId(fresh);
        setStartedAt(null);
        setTurns([]);
      }
    })();
  }, []);

  // The examiner is chosen once, in the setup dialog, and only read back here:
  // the persona is the saved mode/type pair wearing a name.
  useEffect(() => {
    getSettings()
      .then((s) => {
        setPersona(personaFor(s.examiner_mode, s.examiner_type ?? "umum"));
        setTtsProvider(s.effective_tts_provider ?? s.tts_provider);
        setSttProvider(s.effective_stt_provider ?? s.stt_provider ?? "browser");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll the panel, not the page
  }, [turns, busy]);

  // The clock only runs once the student starts (first recording or first
  // answer sent) and is measured against a stored timestamp, so a page refresh
  // resumes the same count.
  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  // The composer counts the current recording only — the whole-sitting clock
  // lives in the side panel, so the two never show the same number.
  useEffect(() => {
    if (!stt.listening) return;
    const from = Date.now();
    setRecSecs(0);
    const t = setInterval(() => setRecSecs(Math.floor((Date.now() - from) / 1000)), 250);
    return () => clearInterval(t);
  }, [stt.listening]);

  // Speech results fill the same draft box the user can type into, so a
  // dictated answer stays editable before it is sent.
  useEffect(() => {
    if (stt.transcript) setManual(stt.transcript);
  }, [stt.transcript]);

  // Grow the draft box with the answer (up to a cap) and keep the newest words
  // in view, so a long dictation never scrolls out of sight.
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    el.scrollTop = el.scrollHeight;
  }, [manual]);

  function markStarted() {
    if (startedAt !== null || !sessionId) return;
    const at = Date.now();
    localStorage.setItem(START_KEY, JSON.stringify({ id: sessionId, at }));
    setStartedAt(at);
  }

  const pending = manual;
  const vizState: VizState = stt.listening
    ? "listening"
    : tts.speaking
      ? "speaking"
      : "idle";
  const questionCount = turns.filter((t) => t.role === "examiner").length;
  const answerCount = turns.length - questionCount;

  async function send() {
    if (!sessionId || !pending.trim() || busy) return;
    if (stt.listening) stt.stop();
    markStarted();
    setBusy(true);
    setErr(null);
    const transcript = pending.trim();
    setTurns((t) => [...t, { role: "user", content: transcript }]);
    try {
      const { reply, propose_close } = await postTurn(sessionId, transcript);
      setTurns((t) => [...t, { role: "examiner", content: reply }]);
      tts.speak(stripMarkdown(reply));
      setProposeClose(propose_close);
    } catch (e) {
      setErr((e as Error).message);
      setTurns((t) => t.slice(0, -1)); // roll back the optimistic user bubble
    } finally {
      stt.reset();
      setManual("");
      setRecSecs(0);
      setBusy(false);
    }
  }

  // Back to the persona picker. The old session is kept (it lives in Riwayat)
  // — a fresh one is only created once a new examiner is confirmed.
  function newSession() {
    stt.reset();
    tts.cancel();
    onNewSession();
  }

  function askClose() {
    setCloseSource("manual");
    setCloseOpen(true);
  }

  // From the banner: the student read the examiner's closing remark and agreed.
  function acceptProposal() {
    setCloseSource("ai");
    setCloseOpen(true);
  }

  // From the banner: keep going. The backend records the decline so the
  // examiner does not ask again on the very next turn.
  async function declineProposal() {
    setProposeClose(false);
    if (!sessionId) return;
    try {
      await continueSession(sessionId);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function confirmClose() {
    if (!sessionId || closing) return;
    setClosing(true);
    setErr(null);
    try {
      const assessment = await closeSession(sessionId);
      clearStoredSession();
      tts.cancel();
      setCloseOpen(false);
      setProposeClose(false);
      onClosed(assessment);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClosing(false);
    }
  }

  // Backing out of the modal leaves the banner up: the decision is deferred,
  // not declined — declining is the banner's own "Lanjut bertanya".
  function cancelClose() {
    setCloseOpen(false);
  }

  function exportCurrent() {
    if (turns.length === 0) return;
    const slug = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    downloadCsv(`sibiru-sesi-${slug}.csv`, turnsToCsv(turns));
  }

  const liveLabel = tts.preparing
    ? "Menyiapkan suara…"
    : stt.transcribing
      ? "Menyalin rekaman…"
      : vizState === "speaking"
        ? "Penguji bicara"
        : vizState === "listening"
          ? "Merekam"
          : "Siap";
  const personaLabel = `${persona.role} · mode ${MODE_LABELS[persona.mode] ?? persona.mode}`;

  // Blockers (no PDF uploaded, API key missing, mic failure) are announced up
  // top — at the bottom of the page they went unread while the student waited
  // for a reply that was never coming.
  const alerts: { key: string; tone: "danger" | "warn"; icon: string; text: string }[] = [];
  if (err) alerts.push({ key: "err", tone: "danger", icon: "!", text: err });
  if (stt.error) alerts.push({ key: "stt", tone: "danger", icon: "🎙️", text: stt.error });
  if (tts.error) alerts.push({ key: "tts", tone: "warn", icon: "🔇", text: tts.error });

  return (
    <div>
      {alerts.length > 0 && (
        <div className="alerts" role="alert" aria-live="assertive">
          {alerts.map((a) => (
            <div key={a.key} className={`alert ${a.tone}`}>
              <span className="alert-icon" aria-hidden="true">{a.icon}</span>
              <p>{a.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="page-head">
        <div>
          <h2>Latihan Sidang</h2>
          <p className="page-sub">
            Jawab pertanyaan penguji secara lisan atau tertulis. Transkrip dan
            catatan perbaikan disusun otomatis di akhir sesi.
          </p>
        </div>
        <span className="head-note">
          Penguji terkunci selama sidang berjalan — ganti lewat Sesi Baru.
        </span>
      </div>

      <div className="split">
        <section className="card card-flush">
          <header className="convo-head">
            <div className="avatar-wrap">
              {vizState === "speaking" && <span className="avatar-ring" />}
              <div className="avatar" style={{ background: persona.color }} aria-hidden="true">
                {persona.initials}
              </div>
            </div>
            <div className="convo-who">
              <span className="convo-name">{persona.name}</span>
              <span className="convo-role">{personaLabel}</span>
            </div>
            <div className="head-actions">
              <span className={`live ${tts.preparing ? "speaking" : vizState}`}>
                <i className="dot" />
                {liveLabel}
              </span>
              <button className="sm" onClick={exportCurrent} disabled={turns.length === 0}>
                Export
              </button>
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
              <Transcript turns={turns} persona={persona} />
            )}
            {busy && (
              <div className="turn examiner">
                <div
                  className="turn-avatar"
                  style={{ background: persona.color, color: "#fff" }}
                  aria-hidden="true"
                >
                  {persona.initials}
                </div>
                <div className="bubble examiner">
                  <span className="who">Penguji</span>
                  <span className="msg">
                    <span className="dots" aria-label="Penguji sedang mengetik">
                      <i /><i /><i />
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="composer-wrap">
            {proposeClose && (
              <div className="close-hint">
                <span className="close-hint-text">
                  Penguji merasa sidang sudah cukup. Baca dulu catatan penutupnya,
                  lalu pilih.
                </span>
                <div className="close-hint-btns">
                  <button className="sm" onClick={declineProposal}>
                    Lanjut bertanya
                  </button>
                  <button className="sm primary" onClick={acceptProposal}>
                    Lihat hasil penilaian
                  </button>
                </div>
              </div>
            )}
            <div className={`composer ${stt.listening ? "recording" : ""}`}>
              {stt.supported && (
                <>
                  <button
                    className={`rec ${stt.listening ? "on" : ""}`}
                    disabled={stt.transcribing}
                    onClick={() => {
                      if (stt.listening) {
                        stt.stop();
                      } else {
                        markStarted();
                        stt.start();
                      }
                    }}
                  >
                    <i />
                    {stt.transcribing ? "Menyalin…" : stt.listening ? "Berhenti" : "Rekam"}
                  </button>
                  <div className={`wave ${stt.listening ? "on" : ""}`} aria-hidden="true">
                    {WAVE_BARS.map((b, i) => (
                      <span
                        key={i}
                        style={{
                          height: `${b.height}px`,
                          animationDelay: `${b.delay}s`,
                          animationDuration: `${b.duration}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className={`clock ${stt.listening ? "on" : ""}`}>
                    {clock(recSecs)}
                  </span>
                </>
              )}
              <textarea
                ref={draftRef}
                rows={1}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={
                  stt.transcribing
                    ? "Menyalin rekaman jadi teks…"
                    : stt.listening
                      ? sttProvider === "whisper"
                        ? "Merekam — teks muncul setelah Anda menekan Berhenti…"
                        : "Merekam — transkrip muncul di sini…"
                      : "Ketik jawaban, atau tekan Rekam untuk bicara"
                }
              />
              <button className="primary" onClick={send} disabled={busy || !pending.trim()}>
                {busy ? "Mengirim…" : "Kirim"}
              </button>
            </div>

            <div className="composer-foot">
              <span>
                {stt.supported ? (
                  <>
                    Tekan <b>Rekam</b> lalu bicara — atau ketik jawaban Anda.
                    {sttProvider === "whisper" && " Transkrip disusun Whisper setelah rekaman berhenti."}
                  </>
                ) : sttProvider === "whisper" ? (
                  <>Browser tidak mendukung perekaman audio — ketik jawaban Anda.</>
                ) : (
                  <>Browser tidak mendukung Speech Recognition — ketik jawaban Anda.</>
                )}
              </span>
              <div className="composer-btns">
                <button className="sm" onClick={newSession}>
                  Sesi Baru
                </button>
                <button className="sm danger" onClick={askClose} disabled={turns.length === 0}>
                  Akhiri Sidang
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="stack">
          <div className="card">
            <div className="stat-head">
              <span className="eyebrow">Sesi berjalan</span>
              <span className="stat-clock">{clock(elapsed)}</span>
            </div>
            <div className="mini-grid">
              <div className="mini">
                <div className="mini-val">{questionCount}</div>
                <div className="mini-label">Pertanyaan penguji</div>
              </div>
              <div className="mini">
                <div className="mini-val">{answerCount}</div>
                <div className="mini-label">Jawaban Anda</div>
              </div>
            </div>
          </div>

          <div className="card orb-card">
            <span className="eyebrow">Suara</span>
            <VoiceVisualizer state={vizState} getLevel={mic.getLevel} size={150} />
          </div>

          <div className="tip-card">
            <span className="eyebrow">Saran cepat</span>
            <p>
              Jawab dengan pola klaim → bukti → halaman. Sebut angka, tabel, atau
              lampiran yang mendukung, lalu tutup dengan batasannya.
            </p>
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={closeOpen}
        title="Akhiri sidang?"
        message={
          closeSource === "ai"
            ? "Penguji merasa sidang sudah cukup. Akhiri sidang & lihat hasil penilaian?"
            : "Akhiri sidang sekarang & lihat hasil penilaian?"
        }
        confirmLabel={closing ? "Menilai…" : "Akhiri & lihat hasil"}
        cancelLabel="Batal"
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />
    </div>
  );
}
