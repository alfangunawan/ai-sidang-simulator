import { useState } from "react";
import { SessionPage, SESSION_KEY } from "./pages/SessionPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ResultPage } from "./pages/ResultPage.js";
import { getResult } from "./api.js";
import type { Assessment } from "./types.js";

export default function App() {
  const [view, setView] = useState<"session" | "history" | "settings" | "result">("session");
  const [result, setResult] = useState<Assessment | null>(null);

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

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">SiBiru</h1>
        <p className="tagline">Simulator Sidang Skripsi</p>
      </header>
      <nav>
        <button className={view === "session" ? "primary" : ""} onClick={() => setView("session")}>
          Latihan
        </button>
        <button className={view === "history" ? "primary" : ""} onClick={() => setView("history")}>
          Riwayat
        </button>
        <button className={view === "settings" ? "primary" : ""} onClick={() => setView("settings")}>
          Pengaturan
        </button>
      </nav>
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
    </div>
  );
}
