import { useState } from "react";
import { login, register } from "../api.js";
import type { User } from "../types.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-2">
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col items-center gap-1 text-center">
              <img src="/sibiru-icon.svg" alt="" width={52} height={52} />
              <h1 className="font-serif text-3xl font-semibold tracking-tight">SiBiru</h1>
              <p className="text-sm text-muted-foreground">
                {mode === "login" ? "Masuk ke akunmu" : "Buat akun baru"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {mode === "login" ? "Masuk" : "Buat akun"}
            </Button>

            <div className="flex flex-col items-center gap-1 text-sm">
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login"
                  ? "Belum punya akun? Daftar di sini"
                  : "Sudah punya akun? Masuk"}
              </button>
              {onBack && (
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={onBack}
                >
                  ← Kembali ke beranda
                </button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
