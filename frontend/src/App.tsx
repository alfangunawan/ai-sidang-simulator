import { useEffect, useState } from "react";
import { SessionPage, SESSION_KEY } from "./pages/SessionPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ResultPage } from "./pages/ResultPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { getResult, me, logout, setUnauthorizedHandler } from "./api.js";
import type { Assessment, User } from "./types.js";

const TABS: { key: "session" | "history" | "settings"; label: string }[] = [
  { key: "session", label: "Latihan" },
  { key: "history", label: "Riwayat" },
  { key: "settings", label: "Pengaturan" },
];

export default function App() {
  const [view, setView] = useState<"session" | "history" | "settings" | "result">("session");
  const [result, setResult] = useState<Assessment | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  function showResult(a: Assessment) {
    setResult(a);
    setView("result");
  }

  async function openResult(id: string) {
    try {
      const r = await getResult(id);
      if (r.assessment) {
        setResult(r.assessment);
        setView("result");
      }
    } catch {
      // ignore; stay on history
    }
  }

  // The result view lives under the Riwayat tab, so the pill stays lit there.
  const activeTab = view === "result" ? "history" : view;

  if (!ready) return <div className="app" />;
  if (!user) return <AuthPage onAuthed={setUser} />;

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">S</div>
            <div className="brand-text">
              <h1 className="wordmark">SiBiru</h1>
              <p className="tagline">Simulator Sidang Skripsi</p>
            </div>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={activeTab === t.key ? "primary" : ""}
                onClick={() => setView(t.key)}
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
        {view === "session" && <SessionPage onClosed={showResult} />}
        {view === "history" && <HistoryPage onOpenResult={openResult} />}
        {view === "settings" && <SettingsPage />}
        {view === "result" && result && (
          <ResultPage
            assessment={result}
            onNewSession={() => {
              localStorage.removeItem(SESSION_KEY);
              setResult(null);
              setView("session");
            }}
            onBack={() => setView("history")}
          />
        )}
      </main>
    </div>
  );
}
