import { useEffect, useState } from "react";
import {
  SessionPage,
  clearStoredSession,
  hasStoredSession,
} from "./pages/SessionPage.js";
import { HomePage } from "./pages/HomePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ResultPage } from "./pages/ResultPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { SetupModal, type MicState } from "./components/SetupModal.js";
import { DEFAULT_PERSONA, personaFor } from "./personas.js";
import type { Persona } from "./personas.js";
import {
  getResult,
  getSettings,
  saveSettings,
  me,
  logout,
  setUnauthorizedHandler,
} from "./api.js";
import type { Assessment, User } from "./types.js";

type Tab = "beranda" | "riwayat" | "pengaturan";

const TABS: { key: Tab; label: string }[] = [
  { key: "beranda", label: "Beranda" },
  { key: "riwayat", label: "Riwayat" },
  { key: "pengaturan", label: "Pengaturan" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("beranda");
  // Under Beranda the session replaces the dashboard, the way the sidang
  // replaces the waiting room — the tab stays lit either way.
  const [inSession, setInSession] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [setup, setSetup] = useState<0 | 1 | 2>(0);
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [mic, setMic] = useState<MicState>("idle");
  const [starting, setStarting] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  // Remounts SessionPage so it picks up the session it is meant to run.
  const [sitting, setSitting] = useState(0);
  const [resumable, setResumable] = useState(() => hasStoredSession());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  // The picker opens on whoever ran last, so "Sesi Baru" with the same examiner
  // is two clicks rather than a hunt through six cards.
  useEffect(() => {
    if (!user) return;
    getSettings()
      .then((s) => setPersona(personaFor(s.examiner_mode, s.examiner_type ?? "umum")))
      .catch(() => {});
  }, [user]);

  function openSetup(step: 1 | 2 = 1) {
    setResumable(hasStoredSession());
    setSetup(step);
  }

  function goHome() {
    setInSession(false);
    setResumable(hasStoredSession());
    setTab("beranda");
  }

  async function startSession(p: Persona) {
    setStarting(true);
    try {
      await saveSettings({ examiner_mode: p.mode, examiner_type: p.type });
    } catch {
      // The examiner falls back to whatever was already saved; the sidang can
      // still run, so this is not worth blocking on.
    }
    setPersona(p);
    setStarting(false);
    clearStoredSession();
    setSitting((n) => n + 1);
    setResult(null);
    setSetup(0);
    setTab("beranda");
    setInSession(true);
  }

  function showResult(a: Assessment) {
    setResult(a);
    setInSession(false);
    setTab("riwayat");
  }

  async function openResult(id: string) {
    try {
      const r = await getResult(id);
      if (r.assessment) {
        setResult(r.assessment);
        setTab("riwayat");
      }
    } catch {
      // ignore; stay on history
    }
  }

  function goTab(next: Tab) {
    setResult(null);
    setTab(next);
    if (next === "beranda") setResumable(hasStoredSession());
  }

  if (!ready) return <div className="app" />;
  if (!user) {
    return showAuth ? (
      <AuthPage onAuthed={setUser} onBack={() => setShowAuth(false)} />
    ) : (
      <LandingPage onStart={() => setShowAuth(true)} />
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <img className="brand-mark" src="/sibiru-icon.svg" alt="" width={38} height={38} />
            <div className="brand-text">
              <h1 className="wordmark">SiBiru</h1>
              <p className="tagline">Simulator Sidang Skripsi</p>
            </div>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? "primary" : ""}
                onClick={() => goTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span className="whoami">{user.username}</span>
          <button
            className="ghost"
            onClick={async () => {
              try {
                await logout();
              } finally {
                setUser(null);
              }
            }}
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="shell">
        {tab === "beranda" &&
          (inSession ? (
            <SessionPage key={sitting} onClosed={showResult} onNewSession={() => {
              goHome();
              openSetup(1);
            }} />
          ) : (
            <HomePage
              mic={mic}
              resumable={resumable}
              onStart={() => openSetup(1)}
              onResume={() => setInSession(true)}
              onOpenHistory={() => goTab("riwayat")}
              onOpenSession={(id) => {
                setHistoryOpenId(id);
                goTab("riwayat");
              }}
              onOpenSettings={() => goTab("pengaturan")}
              onTestMic={() => openSetup(2)}
            />
          ))}

        {tab === "riwayat" &&
          (result ? (
            <ResultPage
              assessment={result}
              onNewSession={() => {
                setResult(null);
                goHome();
                openSetup(1);
              }}
              onBack={() => setResult(null)}
            />
          ) : (
            <HistoryPage
              onOpenResult={openResult}
              openId={historyOpenId}
              onOpened={() => setHistoryOpenId(null)}
            />
          ))}

        {tab === "pengaturan" && <SettingsPage />}
      </main>

      {setup !== 0 && (
        <SetupModal
          step={setup}
          initial={persona}
          mic={mic}
          starting={starting}
          onStep={setSetup}
          onMic={setMic}
          onStart={startSession}
        />
      )}
    </div>
  );
}
