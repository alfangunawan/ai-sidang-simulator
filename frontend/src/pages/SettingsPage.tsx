import { useEffect, useState } from "react";
import {
  getSettings,
  saveSettings,
  getSkripsi,
  uploadSkripsi,
  deleteSkripsi,
} from "../api.js";
import type { SettingsView, SkripsiInfo } from "../types.js";

const CLAUDE_MODELS = [
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
];

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("claude-sonnet-5");
  const [apiKey, setApiKey] = useState("");
  const [attackPoints, setAttackPoints] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      setAttackPoints(s.attack_points);
    });
    getSkripsi().then(setSkripsi);
  }, []);

  async function onSave() {
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, string> = { provider, model, attack_points: attackPoints };
      if (apiKey) body.api_key = apiKey;
      const updated = await saveSettings(body);
      setSettings(updated);
      setApiKey("");
      setMsg("Tersimpan.");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setMsg(null);
    try {
      setSkripsi(await uploadSkripsi(file));
      setMsg("Skripsi diunggah.");
    } catch (e) {
      setErr((e as Error).message);
    }
    e.target.value = "";
  }

  async function onDeleteSkripsi() {
    setErr(null);
    setMsg(null);
    try {
      await deleteSkripsi();
      setSkripsi(null);
      setMsg("Skripsi dihapus.");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div>
      <h2>Pengaturan</h2>

      <label>Provider</label>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="claude">Claude</option>
        <option value="openrouter">OpenRouter</option>
      </select>

      <label>Model</label>
      {provider === "claude" ? (
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {CLAUDE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={model}
          placeholder="mis. anthropic/claude-sonnet-4.6"
          onChange={(e) => setModel(e.target.value)}
        />
      )}

      <label>
        API Key — Key tersimpan: {settings?.has_api_key ? "ya" : "tidak"}
      </label>
      <input
        type="password"
        value={apiKey}
        placeholder={settings?.has_api_key ? "(biarkan kosong untuk mempertahankan)" : "tempel API key"}
        onChange={(e) => setApiKey(e.target.value)}
      />

      <label>Poin Serangan Penguji</label>
      <textarea rows={8} value={attackPoints} onChange={(e) => setAttackPoints(e.target.value)} />

      <button className="primary" onClick={onSave}>
        Simpan Pengaturan
      </button>

      <hr />
      <h3>Skripsi (PDF)</h3>
      {skripsi ? (
        <p>
          {skripsi.filename} — {skripsi.char_count} karakter{" "}
          <button onClick={onDeleteSkripsi}>Hapus</button>
        </p>
      ) : (
        <p>Belum ada skripsi.</p>
      )}
      <input type="file" accept="application/pdf" onChange={onUpload} />

      {msg && <p>{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
