import { useEffect, useState } from "react";
import {
  getSettings,
  saveSettings,
  getSkripsi,
  uploadSkripsi,
  deleteSkripsi,
  getTtsVoices,
  testLlm,
  testTts,
  ttsPreview,
} from "../api.js";
import type { SettingsView, SkripsiInfo, TtsVoice, TestResult } from "../types.js";

const PREVIEW_SAMPLE = "Halo, ini contoh suara penguji sidang.";

const CLAUDE_MODELS = [
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
];

const TTS_PROVIDERS = [
  { value: "browser", label: "Browser (bawaan)" },
  { value: "google", label: "Google Cloud (Neural2 / Chirp3-HD)" },
  { value: "openai", label: "OpenAI (tts-1 / tts-1-hd)" },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("claude-sonnet-5");
  const [apiKey, setApiKey] = useState("");
  const [attackPoints, setAttackPoints] = useState("");
  const [ttsProvider, setTtsProvider] = useState("browser");
  const [ttsVoice, setTtsVoice] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<TestResult | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<TestResult | null>(null);
  const [ttsTesting, setTtsTesting] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      setAttackPoints(s.attack_points);
      setTtsProvider(s.tts_provider);
      setTtsVoice(s.tts_voice);
    });
    getSkripsi().then(setSkripsi);
  }, []);

  // Load the voice list whenever a server-side TTS provider is selected.
  useEffect(() => {
    if (ttsProvider === "browser") {
      setVoices([]);
      return;
    }
    let active = true;
    getTtsVoices(ttsProvider)
      .then((vs) => {
        if (!active) return;
        setVoices(vs);
        setTtsVoice((cur) =>
          vs.some((v) => v.name === cur) ? cur : (vs[0]?.name ?? ""),
        );
      })
      .catch(() => active && setVoices([]));
    return () => {
      active = false;
    };
  }, [ttsProvider]);

  async function onSave() {
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, string> = {
        provider,
        model,
        attack_points: attackPoints,
        tts_provider: ttsProvider,
        tts_voice: ttsVoice,
      };
      if (apiKey) body.api_key = apiKey;
      if (googleKey) body.google_tts_key = googleKey;
      if (openaiKey) body.openai_tts_key = openaiKey;
      const updated = await saveSettings(body);
      setSettings(updated);
      setApiKey("");
      setGoogleKey("");
      setOpenaiKey("");
      setMsg("Tersimpan.");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onTestLlm() {
    setLlmTesting(true);
    setLlmStatus(null);
    try {
      setLlmStatus(await testLlm({ provider, model, api_key: apiKey || undefined }));
    } catch (e) {
      setLlmStatus({ ok: false, error: (e as Error).message });
    } finally {
      setLlmTesting(false);
    }
  }

  async function onTestTts() {
    setTtsTesting(true);
    setTtsStatus(null);
    const key = ttsProvider === "google" ? googleKey : openaiKey;
    try {
      setTtsStatus(await testTts({ provider: ttsProvider, key: key || undefined }));
    } catch (e) {
      setTtsStatus({ ok: false, error: (e as Error).message });
    } finally {
      setTtsTesting(false);
    }
  }

  async function onPreview() {
    setPreviewErr(null);
    setPreviewing(true);
    try {
      if (ttsProvider === "browser") {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(PREVIEW_SAMPLE);
          u.lang = "id-ID";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        }
      } else {
        const key = ttsProvider === "google" ? googleKey : openaiKey;
        const { audio, mime } = await ttsPreview({
          provider: ttsProvider,
          voice: ttsVoice,
          key: key || undefined,
        });
        await new Audio(`data:${mime};base64,${audio}`).play();
      }
    } catch (e) {
      setPreviewErr((e as Error).message);
    } finally {
      setPreviewing(false);
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

  const grouped = voices.reduce<Record<string, TtsVoice[]>>((acc, v) => {
    (acc[v.type] ||= []).push(v);
    return acc;
  }, {});

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
      <div className="test-row">
        <button className="sm" onClick={onTestLlm} disabled={llmTesting}>
          {llmTesting ? "Menguji…" : "Tes Koneksi"}
        </button>
        {llmStatus &&
          (llmStatus.ok ? (
            <span className="ok">✓ Terhubung</span>
          ) : (
            <span className="error">✗ {llmStatus.error}</span>
          ))}
      </div>

      <label>Poin Serangan Penguji (opsional)</label>
      <textarea
        rows={8}
        value={attackPoints}
        placeholder="(opsional) Tempel poin serangan spesifik yang ingin dikejar penguji — mis. kelemahan Bab 3, klaim yang perlu bukti. Kosongkan untuk pertanyaan murni berbasis isi skripsi."
        onChange={(e) => setAttackPoints(e.target.value)}
      />

      <h3>Suara (TTS)</h3>
      <label>Provider Suara</label>
      <select value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
        {TTS_PROVIDERS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {ttsProvider === "browser" && (
        <>
          <p className="hint">
            Memakai suara bawaan browser (gratis, offline, tanpa key). Kualitas
            tergantung perangkat.
          </p>
          <button className="sm" onClick={onPreview} disabled={previewing}>
            ▶ Preview Suara
          </button>
        </>
      )}

      {ttsProvider === "google" && (
        <>
          <label>
            Google Cloud API Key — Key tersimpan:{" "}
            {settings?.has_google_tts_key ? "ya" : "tidak"}
          </label>
          <input
            type="password"
            value={googleKey}
            placeholder={
              settings?.has_google_tts_key
                ? "(biarkan kosong untuk mempertahankan)"
                : "tempel Google Cloud API key"
            }
            onChange={(e) => setGoogleKey(e.target.value)}
          />
        </>
      )}

      {ttsProvider === "openai" && (
        <>
          <label>
            OpenAI API Key — Key tersimpan:{" "}
            {settings?.has_openai_tts_key ? "ya" : "tidak"}
          </label>
          <input
            type="password"
            value={openaiKey}
            placeholder={
              settings?.has_openai_tts_key
                ? "(biarkan kosong untuk mempertahankan)"
                : "tempel OpenAI API key"
            }
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
        </>
      )}

      {ttsProvider !== "browser" && (
        <div className="test-row">
          <button className="sm" onClick={onTestTts} disabled={ttsTesting}>
            {ttsTesting ? "Menguji…" : "Tes Koneksi TTS"}
          </button>
          {ttsStatus &&
            (ttsStatus.ok ? (
              <span className="ok">✓ Terhubung</span>
            ) : (
              <span className="error">✗ {ttsStatus.error}</span>
            ))}
        </div>
      )}

      {ttsProvider !== "browser" && voices.length > 0 && (
        <>
          <label>Voice</label>
          <div className="voice-row">
            <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
              {Object.entries(grouped).map(([type, vs]) => (
                <optgroup key={type} label={type}>
                  {vs.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="sm"
              onClick={onPreview}
              disabled={previewing || !ttsVoice}
            >
              ▶ Preview
            </button>
          </div>
        </>
      )}

      {previewErr && <p className="error">🔇 {previewErr}</p>}

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
