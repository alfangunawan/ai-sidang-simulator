import { useEffect, useState } from "react";
import { FileText, Play } from "lucide-react";
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
  getDossier,
  saveDossier,
  rebuildDossier,
} from "../api.js";
import type {
  SettingsView,
  SkripsiInfo,
  TtsVoice,
  TestResult,
  UsageView,
  DossierView,
  DossierStatus,
} from "../types.js";
import { CollabSettings } from "./CollabSettings.js";
import { DossierProgress } from "../components/DossierProgress.js";
import { Dropzone } from "../components/Dropzone.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PREVIEW_SAMPLE = "Halo, ini contoh suara penguji sidang.";

const KIND_LABELS: Record<string, string> = {
  turn: "Tanya jawab",
  assessment: "Penilaian akhir",
  dossier: "Baca skripsi",
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

const PROVIDERS = [
  { value: "claude", label: "Claude" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "9router", label: "9router (URL sendiri)" },
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

const labelOf = (list: { value: string; label: string }[], v: string): string =>
  list.find((x) => x.value === v)?.label ?? v;

const NAV = [
  { href: "#model", label: "Model AI" },
  { href: "#dokumen", label: "Dokumen skripsi" },
  { href: "#penguji", label: "Perilaku penguji" },
  { href: "#suara", label: "Suara penguji" },
  { href: "#diktasi", label: "Suara ke teks" },
  { href: "#pemakaian", label: "Pemakaian token" },
  { href: "#kolaborasi", label: "Kolaborasi" },
];

const TONE = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-success/15 text-success",
  bad: "bg-destructive/10 text-destructive",
  busy: "bg-warning/15 text-warning",
};

// One chip per connection: neutral before a test, then the test's verdict.
function statusChip(
  testing: boolean,
  status: TestResult | null,
  okLabel: string,
): { tone: string; label: string } {
  if (testing) return { tone: TONE.busy, label: "● Menguji…" };
  if (!status) return { tone: TONE.neutral, label: "● Belum diuji" };
  return status.ok
    ? { tone: TONE.ok, label: `✓ ${okLabel}` }
    : { tone: TONE.bad, label: "✗ Gagal" };
}

const DOSSIER_CHIP: Record<DossierStatus, { tone: string; label: string }> = {
  pending: { tone: TONE.neutral, label: "⏳ Menganalisis" },
  ready: { tone: TONE.ok, label: "✓ Siap" },
  failed: { tone: TONE.bad, label: "✗ Gagal" },
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function KeyChip({ stored }: { stored?: boolean }) {
  return (
    <Chip tone={stored ? TONE.ok : TONE.neutral}>
      Key tersimpan: {stored ? "ya" : "tidak"}
    </Chip>
  );
}

function Section({
  id,
  title,
  sub,
  aside,
  children,
}: {
  id: string;
  title: string;
  sub?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
        </div>
        {aside}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  );
}

/** Password-style key field with its own "test the connection" button. */
function KeyField({
  label,
  stored,
  value,
  placeholderWhenEmpty,
  onChange,
  testLabel,
  testing,
  onTest,
}: {
  label: string;
  stored?: boolean;
  value: string;
  placeholderWhenEmpty: string;
  onChange: (v: string) => void;
  testLabel: string;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <KeyChip stored={stored} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          className="min-w-52 flex-1"
          value={value}
          placeholder={
            stored ? "(biarkan kosong untuk mempertahankan)" : placeholderWhenEmpty
          }
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="outline" onClick={onTest} disabled={testing}>
          {testing ? "Menguji…" : testLabel}
        </Button>
      </div>
    </div>
  );
}

function UsageCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums">{nf.format(value)}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[13rem_1fr] sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("claude-sonnet-5");
  const [baseUrl, setBaseUrl] = useState("");
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
  const [dossier, setDossier] = useState<DossierView | null>(null);
  const [poinDraft, setPoinDraft] = useState("");
  const [savingDossier, setSavingDossier] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      setBaseUrl(s.base_url ?? "");
      setAttackPoints(s.attack_points);
      setTtsProvider(s.tts_provider);
      setTtsVoice(s.tts_voice);
      setSttProvider(s.stt_provider ?? "browser");
    });
    getSkripsi().then(setSkripsi);
    loadDossier();
    getUsage().then(setUsage).catch(() => {});
  }, []);

  async function loadDossier() {
    const d = await getDossier().catch(() => null);
    setDossier(d);
    if (d?.dossier) setPoinDraft(d.dossier.poin_serangan.join("\n"));
    return d;
  }

  // Pembangunan dossier berjalan di luar request upload, jadi status barunya
  // hanya bisa diketahui dengan menanya ulang.
  useEffect(() => {
    if (dossier?.status !== "pending") return;
    const t = setInterval(loadDossier, 3000);
    return () => clearInterval(t);
  }, [dossier?.status]);

  async function onSavePoin() {
    if (!dossier?.dossier) return;
    setErr(null);
    setMsg(null);
    setSavingDossier(true);
    try {
      const saved = await saveDossier({
        ...dossier.dossier,
        poin_serangan: poinDraft.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      setDossier({ ...dossier, dossier: saved });
      setMsg("Poin serangan disimpan.");
    } catch (e) {
      setErr((e as Error).message);
    }
    setSavingDossier(false);
  }

  async function onRebuildDossier() {
    setErr(null);
    setMsg(null);
    setRebuilding(true);
    try {
      await rebuildDossier();
      await loadDossier();
      setMsg("Membaca ulang skripsi…");
    } catch (e) {
      setErr((e as Error).message);
    }
    setRebuilding(false);
  }

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

  // Selama tergabung di kolaborasi, yang dipakai sidang adalah setelan host —
  // bukan setelan sendiri. Jadi yang ditampilkan pun milik host, dikunci: kolom
  // yang bisa disunting tapi diabaikan saat sidang hanya menyesatkan.
  const sharedAi = !!settings?.effective_ai_shared;
  const sharedTts = !!settings?.effective_tts_shared;
  const sharedStt = !!settings?.effective_stt_shared;
  const shownTtsProvider = sharedTts
    ? (settings?.effective_tts_provider ?? "browser")
    : ttsProvider;
  const shownTtsVoice = sharedTts ? (settings?.effective_tts_voice ?? "") : ttsVoice;
  const shownSttProvider = sharedStt
    ? (settings?.effective_stt_provider ?? "browser")
    : sttProvider;

  async function onSave() {
    setErr(null);
    setMsg(null);
    try {
      // Field milik host tidak ikut dikirim: setelan sendiri dibiarkan utuh
      // supaya kembali berlaku begitu user keluar dari kolaborasi.
      const body: Record<string, string> = { attack_points: attackPoints };
      if (!sharedAi) {
        body.provider = provider;
        body.model = model;
        body.base_url = baseUrl;
        if (apiKey) body.api_key = apiKey;
      }
      if (!sharedTts) {
        body.tts_provider = ttsProvider;
        body.tts_voice = ttsVoice;
        if (googleKey) body.google_tts_key = googleKey;
        if (openaiKey) body.openai_tts_key = openaiKey;
      }
      if (!sharedStt) {
        body.stt_provider = sttProvider;
        if (sttKey) body.openai_stt_key = sttKey;
      }
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
      setLlmStatus(
        await testLlm({ provider, model, base_url: baseUrl, api_key: apiKey || undefined }),
      );
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
      if (shownTtsProvider === "browser") {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(PREVIEW_SAMPLE);
          u.lang = "id-ID";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        }
      } else {
        // Tanpa key: server memakai key sumber efektif, jadi anggota kolaborasi
        // tetap bisa mendengar suara yang akan dipakai sidangnya.
        const key = shownTtsProvider === "google" ? googleKey : openaiKey;
        const { audio, mime } = await ttsPreview({
          provider: shownTtsProvider,
          voice: shownTtsVoice,
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

  async function onUpload(file: File) {
    setErr(null);
    setMsg(null);
    setUploading(true);
    try {
      setSkripsi(await uploadSkripsi(file));
      await loadDossier();
      setMsg("Skripsi diunggah. Sedang dibaca untuk menyusun poin serangan.");
    } catch (e) {
      setErr((e as Error).message);
    }
    setUploading(false);
  }

  async function onDeleteSkripsi() {
    setErr(null);
    setMsg(null);
    try {
      await deleteSkripsi();
      setSkripsi(null);
      setDossier(null);
      setPoinDraft("");
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Pengaturan</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Konfigurasi model AI, suara penguji, dan dokumen skripsi yang jadi bahan
            pertanyaan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm font-medium text-success">{msg}</span>}
          <Button onClick={onSave}>Simpan Pengaturan</Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav className="sticky top-20 hidden h-fit flex-col gap-0.5 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-6">
          {/* ---------------- Model AI ---------------- */}
          <Section
            id="model"
            title="Model AI"
            sub="Model yang memerankan penguji dan menyusun penilaian akhir."
            aside={!sharedAi && <Chip tone={llmChip.tone}>{llmChip.label}</Chip>}
          >
            {sharedAi ? (
              <>
                <Alert>
                  <AlertDescription>
                    Memakai AI dari host kolaborasi. Setelan ini dikunci selama Anda
                    tergabung — keluar dari kolaborasi untuk memakai key sendiri.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col gap-2">
                  <Fact
                    label="Provider (dari host)"
                    value={labelOf(PROVIDERS, settings?.effective_provider ?? "")}
                  />
                  <Fact label="Model (dari host)" value={settings?.effective_model ?? "—"} />
                  {settings?.effective_provider === "9router" && (
                    <Fact
                      label="URL API (dari host)"
                      value={settings?.effective_base_url || "—"}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="provider">Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger id="provider" aria-label="Provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                {/* `llm-model`, bukan `model`: `model` sudah dipakai anchor
                    Section di atasnya, dan label akan menempel ke kartunya. */}
                <Label htmlFor="llm-model">Model</Label>
                {provider === "claude" ? (
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger id="llm-model" aria-label="Model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLAUDE_MODELS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="llm-model"
                    value={model}
                    placeholder="mis. anthropic/claude-sonnet-4.6"
                    onChange={(e) => setModel(e.target.value)}
                  />
                )}
              </div>
            </div>

            {provider === "9router" && (
              <div className="grid gap-2">
                <Label htmlFor="base-url">URL API</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  placeholder="mis. https://api.9router.ai/v1"
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Endpoint bergaya OpenAI. Isi base URL-nya saja —{" "}
                  <code>/chat/completions</code> ditambahkan otomatis.
                </p>
              </div>
            )}

            <div>
              <KeyField
                label="API Key"
                stored={settings?.has_api_key}
                value={apiKey}
                placeholderWhenEmpty="tempel API key"
                onChange={setApiKey}
                testLabel="Tes Koneksi"
                testing={llmTesting}
                onTest={onTestLlm}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Key disimpan di server lokal Anda dan hanya dipakai untuk memanggil
                provider yang dipilih.
              </p>
              {llmStatus && !llmStatus.ok && (
                <p className="mt-2 text-sm text-destructive">{llmStatus.error}</p>
              )}
            </div>
              </>
            )}
          </Section>

          {/* ---------------- Dokumen skripsi ----------------
              Berdampingan dengan Perilaku penguji di bawahnya: poin serangan
              lahir dari naskah ini, jadi keduanya dibaca sebagai satu urusan. */}
          <Section
            id="dokumen"
            title="Skripsi (PDF)"
            sub="Sumber utama pertanyaan penguji. Unggah naskah terbaru agar pertanyaan tetap relevan."
          >
            {skripsi ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <FileText className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-40 flex-1">
                  <div className="truncate text-sm font-semibold">{skripsi.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {nf.format(skripsi.char_count)} karakter
                  </div>
                </div>
                <Chip tone={TONE.ok}>✓ Terindeks</Chip>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={onDeleteSkripsi}
                >
                  Hapus
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada skripsi.</p>
            )}

            <Dropzone busy={uploading} onFile={onUpload} />
          </Section>

          {/* ---------------- Perilaku penguji ---------------- */}
          <Section
            id="penguji"
            title="Perilaku penguji"
            sub="Poin serangan dibaca otomatis dari naskah saat skripsi diunggah. Sunting bila ada yang meleset atau ingin Anda tambahkan."
            aside={
              dossier?.status && (
                <Chip tone={DOSSIER_CHIP[dossier.status].tone}>
                  {DOSSIER_CHIP[dossier.status].label}
                </Chip>
              )
            }
          >
            {!skripsi && (
              <p className="text-sm text-muted-foreground">
                Unggah skripsi dulu di kartu Skripsi (PDF) di atas.
              </p>
            )}

            {skripsi && dossier?.status === "pending" && (
              <Alert>
                <AlertDescription>
                  Membaca naskah dan menyusun poin serangan — sidang belum bisa dimulai
                  sampai selesai.
                  <DossierProgress charCount={skripsi.char_count} />
                </AlertDescription>
              </Alert>
            )}

            {skripsi && dossier?.status === "failed" && (
              <Alert variant="destructive">
                <AlertDescription>
                  {dossier.error ?? "Gagal membaca skripsi."}
                </AlertDescription>
              </Alert>
            )}

            {skripsi && dossier?.dossier && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="poin">Poin Serangan Penguji</Label>
                  <Textarea
                    id="poin"
                    rows={8}
                    value={poinDraft}
                    placeholder="Satu poin per baris."
                    onChange={(e) => setPoinDraft(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pisahkan tiap poin dengan baris baru. Kosongkan agar pertanyaan murni
                    dari isi skripsi.
                  </p>
                </div>
                <div>
                  <Button disabled={savingDossier} onClick={onSavePoin}>
                    {savingDossier ? "Menyimpan…" : "Simpan poin serangan"}
                  </Button>
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <Fact label="Judul terbaca" value={dossier.dossier.judul} />
                  <Fact
                    label="Rumusan masalah / kesimpulan"
                    value={`${dossier.dossier.fakta_struktural.jumlah_rumusan_masalah} / ${dossier.dossier.fakta_struktural.jumlah_kesimpulan}${
                      dossier.dossier.fakta_struktural.rumusan_tanpa_kesimpulan.length > 0
                        ? ` — ${dossier.dossier.fakta_struktural.rumusan_tanpa_kesimpulan.length} rumusan belum terjawab`
                        : ""
                    }`}
                  />
                  {dossier.dossier.metode.nama && (
                    <Fact label="Metode" value={dossier.dossier.metode.nama} />
                  )}
                  {dossier.dossier.populasi_sampel.jumlah !== null && (
                    <Fact
                      label="Responden"
                      value={String(dossier.dossier.populasi_sampel.jumlah)}
                    />
                  )}
                  {dossier.dossier.modul_kritik_terpicu.length > 0 && (
                    <Fact
                      label="Modul kritik aktif"
                      value={dossier.dossier.modul_kritik_terpicu.join(", ")}
                    />
                  )}
                </div>
              </>
            )}

            {skripsi && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" disabled={rebuilding} onClick={onRebuildDossier}>
                  {rebuilding ? "Membaca ulang…" : "Baca ulang skripsi"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Menjalankan ulang pembacaan naskah. Menimpa suntingan Anda.
                </span>
              </div>
            )}
          </Section>

          {/* ---------------- Suara penguji ---------------- */}
          <Section
            id="suara"
            title="Suara (TTS)"
            sub="Suara yang membacakan pertanyaan penguji saat sesi berjalan."
            aside={
              !sharedTts &&
              ttsProvider !== "browser" && <Chip tone={ttsChip.tone}>{ttsChip.label}</Chip>
            }
          >
            {sharedTts ? (
              <>
                <Alert>
                  <AlertDescription>
                    Memakai suara dari host kolaborasi. Setelan ini dikunci selama Anda
                    tergabung — keluar dari kolaborasi untuk memakai suara sendiri.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col gap-2">
                  <Fact
                    label="Provider (dari host)"
                    value={labelOf(TTS_PROVIDERS, shownTtsProvider)}
                  />
                  {shownTtsVoice && (
                    <Fact label="Karakter suara (dari host)" value={shownTtsVoice} />
                  )}
                </div>
                <div>
                  <Button variant="outline" onClick={onPreview} disabled={previewing}>
                    <Play />
                    Preview Suara
                  </Button>
                </div>
              </>
            ) : (
              <>
            <div className="grid gap-2">
              <Label htmlFor="tts-provider">Provider Suara</Label>
              <Select value={ttsProvider} onValueChange={setTtsProvider}>
                <SelectTrigger
                  id="tts-provider"
                  aria-label="Provider Suara"
                  className="w-full sm:w-96"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ttsProvider === "browser" && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Memakai suara bawaan browser (gratis, offline, tanpa key). Kualitas
                  tergantung perangkat.
                </p>
                <Button variant="outline" size="sm" onClick={onPreview} disabled={previewing}>
                  <Play />
                  Preview Suara
                </Button>
              </div>
            )}

            {ttsProvider === "google" && (
              <KeyField
                label="Google Cloud API Key"
                stored={settings?.has_google_tts_key}
                value={googleKey}
                placeholderWhenEmpty="tempel Google Cloud API key"
                onChange={setGoogleKey}
                testLabel="Tes Koneksi TTS"
                testing={ttsTesting}
                onTest={onTestTts}
              />
            )}

            {ttsProvider === "openai" && (
              <KeyField
                label="OpenAI API Key"
                stored={settings?.has_openai_tts_key}
                value={openaiKey}
                placeholderWhenEmpty="tempel OpenAI API key"
                onChange={setOpenaiKey}
                testLabel="Tes Koneksi TTS"
                testing={ttsTesting}
                onTest={onTestTts}
              />
            )}

            {ttsStatus && !ttsStatus.ok && (
              <p className="text-sm text-destructive">{ttsStatus.error}</p>
            )}

            {ttsProvider !== "browser" && voices.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="voice">Karakter suara</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={ttsVoice} onValueChange={setTtsVoice}>
                    <SelectTrigger
                      id="voice"
                      aria-label="Karakter suara"
                      className="min-w-52 flex-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(grouped).map(([type, vs]) => (
                        <SelectGroup key={type}>
                          <SelectLabel>{type}</SelectLabel>
                          {vs.map((v) => (
                            <SelectItem key={v.name} value={v.name}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={onPreview}
                    disabled={previewing || !ttsVoice}
                  >
                    <Play />
                    Preview
                  </Button>
                </div>
              </div>
            )}
              </>
            )}

            {previewErr && <p className="text-sm text-destructive">🔇 {previewErr}</p>}
          </Section>

          {/* ---------------- Suara ke teks ---------------- */}
          <Section
            id="diktasi"
            title="Suara ke Teks (STT)"
            sub="Cara jawaban lisan Anda diubah jadi teks sebelum dikirim ke penguji."
            aside={
              !sharedStt &&
              sttProvider !== "browser" && <Chip tone={sttChip.tone}>{sttChip.label}</Chip>
            }
          >
            {sharedStt ? (
              <>
                <Alert>
                  <AlertDescription>
                    Memakai diktasi dari host kolaborasi. Setelan ini dikunci selama Anda
                    tergabung — keluar dari kolaborasi untuk memakai key sendiri.
                  </AlertDescription>
                </Alert>
                <Fact
                  label="Provider (dari host)"
                  value={labelOf(STT_PROVIDERS, shownSttProvider)}
                />
              </>
            ) : (
              <>
            <div className="grid gap-2">
              <Label htmlFor="stt-provider">Provider Diktasi</Label>
              <Select value={sttProvider} onValueChange={setSttProvider}>
                <SelectTrigger
                  id="stt-provider"
                  aria-label="Provider Diktasi"
                  className="w-full sm:w-96"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STT_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sttProvider === "browser" ? (
              <p className="text-xs text-muted-foreground">
                Memakai Speech Recognition bawaan browser (gratis, tanpa key). Teks muncul
                langsung saat Anda bicara, tapi akurasinya terbatas dan hanya jalan di
                Chrome/Edge.
              </p>
            ) : (
              <div>
                <KeyField
                  label="OpenAI API Key (STT)"
                  stored={settings?.has_openai_stt_key}
                  value={sttKey}
                  placeholderWhenEmpty="tempel OpenAI API key"
                  onChange={setSttKey}
                  testLabel="Tes Koneksi STT"
                  testing={sttTesting}
                  onTest={onTestStt}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Rekaman dikirim ke OpenAI (model whisper-1) setelah Anda menekan
                  Berhenti, jadi teks tidak muncul real-time. Key ini terpisah dari key
                  TTS.
                </p>
              </div>
            )}
              </>
            )}

            {sttStatus && !sttStatus.ok && (
              <p className="text-sm text-destructive">{sttStatus.error}</p>
            )}
          </Section>

          {/* ---------------- Pemakaian token ---------------- */}
          <Section
            id="pemakaian"
            title="Pemakaian Token"
            sub={`${
              usage?.since
                ? `Dihitung sejak ${new Date(usage.since).toLocaleString("id-ID")}. `
                : ""
            }Biaya hanya tersedia untuk OpenRouter; Claude tidak melaporkannya.`}
            aside={
              usage &&
              usage.total.calls > 0 && (
                <Button variant="outline" size="sm" onClick={onResetUsage}>
                  Reset Penghitung
                </Button>
              )
            }
          >
            {usage === null ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : usage.total.calls === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pemakaian tercatat.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <UsageCard label="Token input" value={usage.total.input_tokens} />
                  <UsageCard label="Token output" value={usage.total.output_tokens} />
                  <UsageCard label="Dari cache" value={usage.total.cache_read_tokens} />
                  <UsageCard label="Panggilan API" value={usage.total.calls} />
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sumber</TableHead>
                        <TableHead>Input</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Panggilan</TableHead>
                        <TableHead>Biaya</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.by_kind.map(({ kind, totals }) => (
                        <TableRow key={kind}>
                          <TableCell>{KIND_LABELS[kind] ?? kind}</TableCell>
                          <TableCell>{nf.format(totals.input_tokens)}</TableCell>
                          <TableCell>{nf.format(totals.output_tokens)}</TableCell>
                          <TableCell>{nf.format(totals.calls)}</TableCell>
                          <TableCell>{formatCost(totals.cost_usd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell>{nf.format(usage.total.input_tokens)}</TableCell>
                        <TableCell>{nf.format(usage.total.output_tokens)}</TableCell>
                        <TableCell>{nf.format(usage.total.calls)}</TableCell>
                        <TableCell>{formatCost(usage.total.cost_usd)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </>
            )}
          </Section>

          <CollabSettings />

          {err && (
            <Alert variant="destructive">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
