import { useState } from "react";
import { SessionPage } from "./pages/SessionPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

export default function App() {
  const [view, setView] = useState<"session" | "settings">("session");
  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">SiBiru</h1>
        <p className="tagline">Simulator Sidang Skripsi</p>
      </header>
      <nav>
        <button
          className={view === "session" ? "primary" : ""}
          onClick={() => setView("session")}
        >
          Latihan
        </button>
        <button
          className={view === "settings" ? "primary" : ""}
          onClick={() => setView("settings")}
        >
          Pengaturan
        </button>
      </nav>
      {view === "session" ? <SessionPage /> : <SettingsPage />}
    </div>
  );
}
