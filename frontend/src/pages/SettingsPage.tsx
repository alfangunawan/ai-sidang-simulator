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
  testStt,
  ttsPreview,
  getUsage,
  resetUsage,
} from "../api.js";
import type {
  SettingsView,
  SkripsiInfo,
  TtsVoice,
  TestResult,
  UsageView,
} from "../types.js";
import { CollabSettings } from "./CollabSettings.js";

const PREVIEW_SAMPLE = "Halo, ini contoh suara penguji sidang.";

const KIND_LABELS: Record<string, string> = {
  turn: "Tanya jawab",
  assessment: "Penilaian akhir",
};

const nf = new Intl.NumberFormat("id-ID");

function formatCost(usd: number): string {
  if (usd <= 0) return "—";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

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

const STT_PROVIDERS = [
  { value: "browser", label: "Browser (bawaan)" },
  { value: "whisper", label: "Whisper API (OpenAI)" },
];

const NAV = [
  { href: "#model", label: "Model AI" },
  { href: "#penguji", label: "Perilaku penguji" },
  { href: "#suara", label: "Suara penguji" },
  { href: "#diktasi", label: "Suara ke teks" },
  { href: "#dokumen", label: "Dokumen skripsi" },
  { href: "#pemakaian", label: "Pemakaian token" },
  { href: "#kolaborasi", label: "Kolaborasi" },
];

// One chip per connection: neutral before a test, then the test's verdict.
function statusChip(
  testing: boolean,
  status: TestResult | null,
  okLabel: string,
): { cls: string; label: string } {
  if (testing) return { cls: "chip warn", label: "● Menguji…" };
  if (!status) return { cls: "chip", label: "● Belum diuji" };
  return status.ok
    ? { cls: "chip ok", label: `✓ ${okLabel}` }
    : { cls: "chip bad", label: "✗ Gagal" };
}

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
  const [sttProvider, setSttProvider] = useState("browser");
  const [sttKey, setSttKey] = useState("");
  const [sttStatus, setSttStatus] = useState<TestResult | null>(null);
  const [sttTesting, setSttTesting] = useState(false);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<TestResult | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<TestResult | null>(null);
  const [ttsTesting, setTtsTesting] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [usage, setUsage] = useState<UsageView | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      setAttackPoints(s.attack_points);
      setTtsProvider(s.tts_provider);
      setTtsVoice(s.tts_voice);
      setSttProvider(s.stt_provider ?? "browser");
    });
    getSkripsi().then(setSkripsi);
    getUsage().then(setUsage).catch(() => {});
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
        stt_provider: sttProvider,
      };
      if (apiKey) body.api_key = apiKey;
      if (googleKey) body.google_tts_key = googleKey;
      if (openaiKey) body.openai_tts_key = openaiKey;
      if (sttKey) body.openai_stt_key = sttKey;
      const updated = await saveSettings(body);
      setSettings(updated);
      setApiKey("");
      setGoogleKey("");
      setOpenaiKey("");
      setSttKey("");
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

  async function onTestStt() {
    setSttTesting(true);
    setSttStatus(null);
    try {
      setSttStatus(await testStt({ provider: sttProvider, key: sttKey || undefined }));
    } catch (e) {
      setSttStatus({ ok: false, error: (e as Error).message });
    } finally {
      setSttTesting(false);
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

  async function onResetUsage() {
    setErr(null);
    setMsg(null);
    try {
      setUsage(await resetUsage());
      setMsg("Penghitung token direset.");
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

  const grouped = voices.reduce<Record<string, TtsVoice[]>>((acc, v) => {
    (acc[v.type] ||= []).push(v);
    return acc;
  }, {});

  const llmChip = statusChip(llmTesting, llmStatus, "Terhubung");
  const ttsChip = statusChip(ttsTesting, ttsStatus, "Suara siap");
  const sttChip = statusChip(sttTesting, sttStatus, "Diktasi siap");

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Pengaturan</h2>
          <p className="page-sub">
            Konfigurasi model AI, suara penguji, dan dokumen skripsi yang jadi
            bahan pertanyaan.
          </p>
        </div>
        <div className="save-bar">
          {msg && <span className="save-note">{msg}</span>}
          <button className="primary" onClick={onSave}>
            Simpan Pengaturan
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <nav className="settings-nav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>

        <div className="stack-lg">
          {/* ---------------- Model AI ---------------- */}
          <section id="model" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Model AI</h3>
                <p>Model yang memerankan penguji dan menyusun penilaian akhir.</p>
              </div>
              <span className={llmChip.cls}>{llmChip.label}</span>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="claude">Claude</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              <div className="field">
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
              </div>
            </div>

            <div className="field">
              <div className="label-row">
                <label>API Key</label>
                <span className={settings?.has_api_key ? "chip ok" : "chip"}>
                  Key tersimpan: {settings?.has_api_key ? "ya" : "tidak"}
                </span>
              </div>
              <div className="inline-row">
                <input
                  type="password"
                  value={apiKey}
                  placeholder={
                    settings?.has_api_key
                      ? "(biarkan kosong untuk mempertahankan)"
                      : "tempel API key"
                  }
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button onClick={onTestLlm} disabled={llmTesting}>
                  {llmTesting ? "Menguji…" : "Tes Koneksi"}
                </button>
              </div>
              <p className="hint">
                Key disimpan di server lokal Anda dan hanya dipakai untuk memanggil
                provider yang dipilih.
              </p>
              {settings?.effective_ai_shared && (
                <p className="hint">
                  Memakai AI dari host — key sendiri tidak dipakai selama tergabung.
                </p>
              )}
              {llmStatus && !llmStatus.ok && <p className="error">{llmStatus.error}</p>}
            </div>
          </section>

          {/* ---------------- Perilaku penguji ---------------- */}
          <section id="penguji" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Perilaku penguji</h3>
                <p>
                  Arahkan fokus serangan penguji, atau biarkan kosong agar
                  pertanyaan murni dari isi skripsi.
                </p>
              </div>
            </div>
            <div className="field">
              <label>
                Poin Serangan Penguji <span style={{ fontWeight: 500, color: "var(--faint)" }}>— opsional</span>
              </label>
              <textarea
                rows={8}
                value={attackPoints}
                placeholder="(opsional) Tempel poin serangan spesifik yang ingin dikejar penguji — mis. kelemahan Bab 3, klaim yang perlu bukti. Kosongkan untuk pertanyaan murni berbasis isi skripsi."
                onChange={(e) => setAttackPoints(e.target.value)}
              />
              <p className="hint">Pisahkan tiap poin dengan baris baru.</p>
            </div>
          </section>

          {/* ---------------- Suara penguji ---------------- */}
          <section id="suara" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Suara (TTS)</h3>
                <p>Suara yang membacakan pertanyaan penguji saat sesi berjalan.</p>
              </div>
              {ttsProvider !== "browser" && <span className={ttsChip.cls}>{ttsChip.label}</span>}
            </div>

            {settings?.effective_tts_shared && (
              <p className="hint" style={{ marginTop: 0 }}>
                Memakai suara dari host — key sendiri tidak dipakai selama tergabung.
              </p>
            )}

            <div className="field">
              <label>Provider Suara</label>
              <select value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
                {TTS_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {ttsProvider === "browser" && (
              <div className="field">
                <p className="hint" style={{ marginTop: 0 }}>
                  Memakai suara bawaan browser (gratis, offline, tanpa key). Kualitas
                  tergantung perangkat.
                </p>
                <button className="sm" onClick={onPreview} disabled={previewing}>
                  ▶ Preview Suara
                </button>
              </div>
            )}

            {ttsProvider === "google" && (
              <div className="field">
                <div className="label-row">
                  <label>Google Cloud API Key</label>
                  <span className={settings?.has_google_tts_key ? "chip ok" : "chip"}>
                    Key tersimpan: {settings?.has_google_tts_key ? "ya" : "tidak"}
                  </span>
                </div>
                <div className="inline-row">
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
                  <button onClick={onTestTts} disabled={ttsTesting}>
                    {ttsTesting ? "Menguji…" : "Tes Koneksi TTS"}
                  </button>
                </div>
              </div>
            )}

            {ttsProvider === "openai" && (
              <div className="field">
                <div className="label-row">
                  <label>OpenAI API Key</label>
                  <span className={settings?.has_openai_tts_key ? "chip ok" : "chip"}>
                    Key tersimpan: {settings?.has_openai_tts_key ? "ya" : "tidak"}
                  </span>
                </div>
                <div className="inline-row">
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
                  <button onClick={onTestTts} disabled={ttsTesting}>
                    {ttsTesting ? "Menguji…" : "Tes Koneksi TTS"}
                  </button>
                </div>
              </div>
            )}

            {ttsStatus && !ttsStatus.ok && <p className="error">{ttsStatus.error}</p>}

            {ttsProvider !== "browser" && voices.length > 0 && (
              <div className="field">
                <label>Karakter suara</label>
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
                  <button onClick={onPreview} disabled={previewing || !ttsVoice}>
                    ▶ Preview
                  </button>
                </div>
              </div>
            )}

            {previewErr && <p className="error">🔇 {previewErr}</p>}
          </section>

          {/* ---------------- Suara ke teks ---------------- */}
          <section id="diktasi" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Suara ke Teks (STT)</h3>
                <p>Cara jawaban lisan Anda diubah jadi teks sebelum dikirim ke penguji.</p>
              </div>
              {sttProvider !== "browser" && <span className={sttChip.cls}>{sttChip.label}</span>}
            </div>

            {settings?.effective_stt_shared && (
              <p className="hint" style={{ marginTop: 0 }}>
                Memakai diktasi dari host — key sendiri tidak dipakai selama tergabung.
              </p>
            )}

            <div className="field">
              <label>Provider Diktasi</label>
              <select value={sttProvider} onChange={(e) => setSttProvider(e.target.value)}>
                {STT_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {sttProvider === "browser" ? (
              <p className="hint" style={{ marginTop: 0 }}>
                Memakai Speech Recognition bawaan browser (gratis, tanpa key). Teks
                muncul langsung saat Anda bicara, tapi akurasinya terbatas dan hanya
                jalan di Chrome/Edge.
              </p>
            ) : (
              <div className="field">
                <div className="label-row">
                  <label>OpenAI API Key (STT)</label>
                  <span className={settings?.has_openai_stt_key ? "chip ok" : "chip"}>
                    Key tersimpan: {settings?.has_openai_stt_key ? "ya" : "tidak"}
                  </span>
                </div>
                <div className="inline-row">
                  <input
                    type="password"
                    value={sttKey}
                    placeholder={
                      settings?.has_openai_stt_key
                        ? "(biarkan kosong untuk mempertahankan)"
                        : "tempel OpenAI API key"
                    }
                    onChange={(e) => setSttKey(e.target.value)}
                  />
                  <button onClick={onTestStt} disabled={sttTesting}>
                    {sttTesting ? "Menguji…" : "Tes Koneksi STT"}
                  </button>
                </div>
                <p className="hint">
                  Rekaman dikirim ke OpenAI (model whisper-1) setelah Anda menekan
                  Berhenti, jadi teks tidak muncul real-time. Key ini terpisah dari
                  key TTS.
                </p>
              </div>
            )}

            {sttStatus && !sttStatus.ok && <p className="error">{sttStatus.error}</p>}
          </section>

          {/* ---------------- Dokumen skripsi ---------------- */}
          <section id="dokumen" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Skripsi (PDF)</h3>
                <p>
                  Sumber utama pertanyaan penguji. Unggah naskah terbaru agar
                  pertanyaan tetap relevan.
                </p>
              </div>
            </div>

            {skripsi ? (
              <div className="file-card">
                <div className="file-icon" aria-hidden="true">PDF</div>
                <div className="file-meta">
                  <div className="file-name">{skripsi.filename}</div>
                  <div className="file-sub">
                    {nf.format(skripsi.char_count)} karakter
                  </div>
                </div>
                <span className="chip ok">✓ Terindeks</span>
                <button className="sm danger" onClick={onDeleteSkripsi}>
                  Hapus
                </button>
              </div>
            ) : (
              <p className="empty-sub" style={{ marginTop: 0 }}>Belum ada skripsi.</p>
            )}

            <div className="dropzone">
              <strong>Pilih file PDF naskah skripsi</strong>
              <input type="file" accept="application/pdf" onChange={onUpload} />
            </div>
          </section>

          {/* ---------------- Pemakaian token ---------------- */}
          <section id="pemakaian" className="card card-lg">
            <div className="section-head">
              <div>
                <h3>Pemakaian Token</h3>
                <p>
                  {usage?.since
                    ? `Dihitung sejak ${new Date(usage.since).toLocaleString("id-ID")}. `
                    : ""}
                  Biaya hanya tersedia untuk OpenRouter; Claude tidak melaporkannya.
                </p>
              </div>
              {usage && usage.total.calls > 0 && (
                <button className="sm" onClick={onResetUsage}>
                  Reset Penghitung
                </button>
              )}
            </div>

            {usage === null ? (
              <p className="hint">Memuat…</p>
            ) : usage.total.calls === 0 ? (
              <p className="hint">Belum ada pemakaian tercatat.</p>
            ) : (
              <>
                <div className="usage-grid">
                  <div className="usage-card">
                    <span className="usage-label">Token input</span>
                    <span className="usage-val">{nf.format(usage.total.input_tokens)}</span>
                  </div>
                  <div className="usage-card">
                    <span className="usage-label">Token output</span>
                    <span className="usage-val">{nf.format(usage.total.output_tokens)}</span>
                  </div>
                  <div className="usage-card">
                    <span className="usage-label">Dari cache</span>
                    <span className="usage-val">{nf.format(usage.total.cache_read_tokens)}</span>
                  </div>
                  <div className="usage-card">
                    <span className="usage-label">Panggilan API</span>
                    <span className="usage-val">{nf.format(usage.total.calls)}</span>
                  </div>
                </div>

                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Sumber</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Panggilan</th>
                      <th>Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.by_kind.map(({ kind, totals }) => (
                      <tr key={kind}>
                        <td>{KIND_LABELS[kind] ?? kind}</td>
                        <td>{nf.format(totals.input_tokens)}</td>
                        <td>{nf.format(totals.output_tokens)}</td>
                        <td>{nf.format(totals.calls)}</td>
                        <td>{formatCost(totals.cost_usd)}</td>
                      </tr>
                    ))}
                    <tr className="usage-total">
                      <td>Total</td>
                      <td>{nf.format(usage.total.input_tokens)}</td>
                      <td>{nf.format(usage.total.output_tokens)}</td>
                      <td>{nf.format(usage.total.calls)}</td>
                      <td>{formatCost(usage.total.cost_usd)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </section>

          <CollabSettings />

          {err && <p className="error">{err}</p>}
        </div>
      </div>
    </div>
  );
}
