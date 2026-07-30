import { useState } from "react";
import { login, register } from "../api.js";
import type { User } from "../types.js";

export function AuthPage({ onAuthed, onBack }: { onAuthed: (u: User) => void; onBack?: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthed(u);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="wordmark">SiBiru</h1>
        <p className="tagline">{mode === "login" ? "Masuk ke akunmu" : "Buat akun baru"}</p>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} autoComplete="username"
          onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {mode === "login" ? "Masuk" : "Buat akun"}
        </button>
        <p className="auth-switch">
          {mode === "login" ? (
            <button type="button" className="linklike" onClick={() => setMode("register")}>Belum punya akun? Daftar di sini</button>
          ) : (
            <button type="button" className="linklike" onClick={() => setMode("login")}>Sudah punya akun? Masuk</button>
          )}
        </p>
        {onBack && (
          <p className="auth-switch">
            <button type="button" className="linklike" onClick={onBack}>← Kembali ke beranda</button>
          </p>
        )}
      </form>
    </div>
  );
}
