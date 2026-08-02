import { useEffect, useRef, useState } from "react";
import { Download, Mic, Send, Square } from "lucide-react";
import {
  createSession,
  getTurns,
  postTurn,
  getSettings,
  closeSession,
  continueSession,
  exitSession,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const SESSION_KEY = "sibiru_session_id";
// Detik yang SUDAH berjalan di sesi ini, bukan jam mulainya. Menyimpan jam
// mulai membuat jam terus menghitung selagi mahasiswa keluar atau me-refresh —
// waktu di luar halaman ikut masuk ke durasi sidang. Yang dicatat karena itu
// hitungannya sendiri, disimpan tiap detik, dan dilanjutkan saat halaman
// kembali dibuka. Tidak ada isinya = mahasiswa belum mulai, jam tetap 0:00.
const ELAPSED_KEY = "sibiru_session_elapsed";

/** Forget the current sitting so the next mount opens a brand-new session. */
export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ELAPSED_KEY);
}

export function hasStoredSession(): boolean {
  return localStorage.getItem(SESSION_KEY) !== null;
}

/** Detik yang sudah berjalan pada sesi `id`; null bila sidang belum dimulai. */
function loadElapsed(id: string): number | null {
  try {
    const raw = localStorage.getItem(ELAPSED_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { id?: string; secs?: number };
    return saved?.id === id && typeof saved.secs === "number" ? saved.secs : null;
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
  personas: Persona[];
  /** Bab yang dipilih di dialog persiapan; undefined (sesi lanjutan) = semua bab. */
  phases?: string[];
  onClosed: (a: Assessment) => void;
  /** Sidang ditutup tanpa nilai; mahasiswa kembali ke Beranda. */
  onExit: () => void;
}

export function SessionPage({ personas, phases, onClosed, onExit }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [ttsProvider, setTtsProvider] = useState<string>("browser");
  const [sttProvider, setSttProvider] = useState<string>("browser");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSource, setCloseSource] = useState<"ai" | "manual" | "exit">("manual");
  // The examiner asked to wrap up. Shown as a banner under the transcript, not
  // as a modal — a modal would cover the closing reply the student needs to read.
  const [proposeClose, setProposeClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [running, setRunning] = useState(false);
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
          id = await createSession(phases);
        } catch {
          return; // backend down on first load; leave as-is
        }
        localStorage.setItem(SESSION_KEY, id);
      }
      setSessionId(id);
      const secs = loadElapsed(id);
      setRunning(secs !== null);
      setElapsed(secs ?? 0);
      try {
        setTurns(await getTurns(id));
      } catch {
        // stale id (backend db reset): make a fresh one
        const fresh = await createSession();
        localStorage.setItem(SESSION_KEY, fresh);
        localStorage.removeItem(ELAPSED_KEY);
        setSessionId(fresh);
        setRunning(false);
        setElapsed(0);
        setTurns([]);
      }
    })();
  }, []);

  // The examiner is chosen once, in the setup dialog, and only read back here:
  // the persona is the saved mode/type pair wearing a name.
  useEffect(() => {
    getSettings()
      .then((s) => {
        setPersona(personaFor(personas, s.examiner_mode, s.examiner_type ?? "umum"));
        setTtsProvider(s.effective_tts_provider ?? s.tts_provider);
        setSttProvider(s.effective_stt_provider ?? s.stt_provider ?? "browser");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll the panel, not the page
  }, [turns, busy]);

  // Jam baru jalan setelah mahasiswa mulai (rekaman atau jawaban pertama), dan
  // hanya selama halaman sidang terbuka: hitungannya disimpan tiap detik,
  // sehingga refresh melanjutkan angka yang sama — bukan menambahi waktu yang
  // dihabiskan di luar halaman.
  useEffect(() => {
    if (!running || !sessionId) return;
    const t = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        localStorage.setItem(ELAPSED_KEY, JSON.stringify({ id: sessionId, secs: next }));
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, sessionId]);

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
    if (running || !sessionId) return;
    localStorage.setItem(ELAPSED_KEY, JSON.stringify({ id: sessionId, secs: 0 }));
    setRunning(true);
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

  function askExit() {
    setCloseSource("exit");
    setCloseOpen(true);
  }

  // Keluar tanpa nilai: sidang ditutup di server, jadi ia tidak muncul lagi
  // sebagai "Lanjutkan sidang" di Beranda. Transkripnya tetap di Riwayat, dan
  // masih bisa dinilai dari sana kalau mahasiswa berubah pikiran.
  async function confirmExit() {
    if (!sessionId || closing) return;
    setClosing(true);
    setErr(null);
    try {
      await exitSession(sessionId);
      stt.reset();
      tts.cancel();
      clearStoredSession();
      setCloseOpen(false);
      onExit();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClosing(false);
    }
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
        <div className="mb-4 flex flex-col gap-2" role="alert" aria-live="assertive">
          {alerts.map((a) => (
            <div
              key={a.key}
              className={cn(
                "alert flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                a.tone === "danger"
                  ? "danger border-destructive/30 bg-destructive/5 text-destructive"
                  : "warn border-warning/40 bg-warning/10 text-warning",
              )}
            >
              <span aria-hidden="true">{a.icon}</span>
              <p>{a.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Latihan Sidang</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Jawab pertanyaan penguji secara lisan atau tertulis. Transkrip dan catatan
            perbaikan disusun otomatis di akhir sesi.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Penguji terkunci selama sidang berjalan — ganti di sesi berikutnya.
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="overflow-hidden py-0">
          <CardHeader className="flex flex-row items-center gap-3 border-b bg-muted/40 py-4">
            <div className="relative">
              {vizState === "speaking" && (
                <span className="absolute -inset-1 animate-ping rounded-full bg-primary/30" />
              )}
              <div
                className="relative flex size-10 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: persona.color }}
                aria-hidden="true"
              >
                {persona.initials}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{persona.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {personaLabel}
              </span>
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                vizState === "listening"
                  ? "bg-primary/10 text-primary"
                  : vizState === "speaking" || tts.preparing
                    ? "bg-warning/15 text-warning"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <i className="size-1.5 rounded-full bg-current" />
              {liveLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCurrent}
              disabled={turns.length === 0}
            >
              <Download />
              Export
            </Button>
          </CardHeader>

          <div
            className="flex h-[46vh] min-h-72 flex-col gap-4 overflow-y-auto px-5 py-5"
            ref={scrollRef}
          >
            {turns.length === 0 && !busy ? (
              <div className="m-auto text-center">
                <p className="text-sm font-medium">Belum ada percakapan.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tekan <strong>Rekam</strong>, lalu mulai menjawab pertanyaan penguji.
                </p>
              </div>
            ) : (
              <Transcript turns={turns} persona={persona} />
            )}
            {busy && (
              <div className="flex items-start gap-3">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: persona.color }}
                  aria-hidden="true"
                >
                  {persona.initials}
                </div>
                <div className="rounded-xl rounded-tl-sm border bg-card px-4 py-3 shadow-xs">
                  <span className="flex gap-1" aria-label="Penguji sedang mengetik">
                    {[0, 1, 2].map((n) => (
                      <i
                        key={n}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: `${n * 0.15}s` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t bg-muted/30 px-5 py-4">
            {proposeClose && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <span className="flex-1 text-sm">
                  Penguji merasa sidang sudah cukup. Baca dulu catatan penutupnya, lalu
                  pilih.
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={declineProposal}>
                    Lanjut bertanya
                  </Button>
                  <Button size="sm" onClick={acceptProposal}>
                    Lihat hasil penilaian
                  </Button>
                </div>
              </div>
            )}

            <div
              className={cn(
                "flex items-end gap-2 rounded-xl border bg-card p-2 transition-colors",
                stt.listening && "border-destructive/50 ring-2 ring-destructive/15",
              )}
            >
              {stt.supported && (
                <>
                  <Button
                    variant={stt.listening ? "destructive" : "outline"}
                    size="sm"
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
                    {stt.listening ? <Square /> : <Mic />}
                    {stt.transcribing ? "Menyalin…" : stt.listening ? "Berhenti" : "Rekam"}
                  </Button>
                  <div className="hidden h-8 items-center gap-[3px] sm:flex" aria-hidden="true">
                    {WAVE_BARS.map((b, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-[3px] rounded-full bg-border",
                          stt.listening && "animate-pulse bg-destructive",
                        )}
                        style={{
                          height: `${b.height}px`,
                          animationDelay: `${b.delay}s`,
                          animationDuration: `${b.duration}s`,
                        }}
                      />
                    ))}
                  </div>
                  {/* Setinggi tombol Rekam dan rata tengah di dalamnya: sebagai
                      teks inline di baris `items-end`, angkanya duduk di dasar
                      baris — sejajar textarea, melenceng dari tombol di sebelahnya. */}
                  <span
                    className={cn(
                      "hidden h-8 items-center font-mono text-xs tabular-nums sm:flex",
                      stt.listening ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {clock(recSecs)}
                  </span>
                </>
              )}
              <textarea
                ref={draftRef}
                rows={1}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="max-h-33 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
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
              <Button size="sm" onClick={send} disabled={busy || !pending.trim()}>
                <Send />
                {busy ? "Mengirim…" : "Kirim"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {stt.supported ? (
                  <>
                    Tekan <b>Rekam</b> lalu bicara — atau ketik jawaban Anda.
                    {sttProvider === "whisper" &&
                      " Transkrip disusun Whisper setelah rekaman berhenti."}
                  </>
                ) : sttProvider === "whisper" ? (
                  <>Browser tidak mendukung perekaman audio — ketik jawaban Anda.</>
                ) : (
                  <>Browser tidak mendukung Speech Recognition — ketik jawaban Anda.</>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={askExit}>
                  Keluar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={askClose}
                  disabled={turns.length === 0}
                >
                  Akhiri Sidang
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                  Sesi berjalan
                </span>
                <span className="font-mono text-sm tabular-nums">{clock(elapsed)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <div className="font-serif text-2xl font-semibold">{questionCount}</div>
                  <div className="text-[11px] text-muted-foreground">Pertanyaan penguji</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="font-serif text-2xl font-semibold">{answerCount}</div>
                  <div className="text-[11px] text-muted-foreground">Jawaban Anda</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                Suara
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VoiceVisualizer state={vizState} getLevel={mic.getLevel} size={150} />
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent>
              <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
                Saran cepat
              </span>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Jawab dengan pola klaim → bukti → halaman. Sebut angka, tabel, atau
                lampiran yang mendukung, lalu tutup dengan batasannya.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <ConfirmModal
        open={closeOpen}
        title={closeSource === "exit" ? "Keluar tanpa nilai?" : "Akhiri sidang?"}
        message={
          closeSource === "exit"
            ? "Sidang ditutup tanpa penilaian dan tidak bisa dilanjutkan. Transkripnya tetap tersimpan di Riwayat, dan Anda masih bisa memintanya dinilai dari sana."
            : closeSource === "ai"
              ? "Penguji merasa sidang sudah cukup. Akhiri sidang & lihat hasil penilaian?"
              : "Akhiri sidang sekarang & lihat hasil penilaian?"
        }
        confirmLabel={
          closeSource === "exit"
            ? closing
              ? "Menutup…"
              : "Keluar tanpa nilai"
            : closing
              ? "Menilai…"
              : "Akhiri & lihat hasil"
        }
        cancelLabel="Batal"
        onConfirm={closeSource === "exit" ? confirmExit : confirmClose}
        onCancel={cancelClose}
      />
    </div>
  );
}
