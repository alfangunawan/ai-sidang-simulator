import { useEffect, useState } from "react";
import { listSessions, getSkripsi, getSettings } from "../api.js";
import type { SessionSummary, SkripsiInfo, SettingsView } from "../types.js";
import { formatDate, scoreTone, gradeOf } from "../lib/sessions.js";
import type { MicState } from "../components/SetupModal.js";

const STEPS = [
  [
    "01",
    "Atur penguji",
    "Pilih dosen penguji sekali di awal — ia terkunci selama sidang agar simulasinya jujur.",
  ],
  [
    "02",
    "Jalani tanya jawab",
    "Penguji menggali naskah Anda; jawab lisan atau tertulis sampai seluruh fase terbahas.",
  ],
  [
    "03",
    "Terima penilaian",
    "Skor empat aspek, huruf mutu, dan saran revisi per bab langsung setelah sidang ditutup.",
  ],
];

const nf = new Intl.NumberFormat("id-ID");

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  openrouter: "OpenRouter",
};

interface Props {
  mic: MicState;
  resumable: boolean;
  onStart: () => void;
  onResume: () => void;
  onOpenHistory: () => void;
  onOpenSession: (id: string) => void;
  onOpenSettings: () => void;
  onTestMic: () => void;
}

export function HomePage({
  mic,
  resumable,
  onStart,
  onResume,
  onOpenHistory,
  onOpenSession,
  onOpenSettings,
  onTestMic,
}: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [settings, setSettings] = useState<SettingsView | null>(null);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
    getSkripsi().then(setSkripsi).catch(() => {});
    getSettings().then(setSettings).catch(() => {});
  }, []);

  const recent = sessions.slice(0, 3);
  const lastScored = sessions.find((s) => s.final_score != null);

  const readiness = [
    {
      key: "skripsi",
      label: "Naskah skripsi",
      value: skripsi
        ? `${skripsi.filename} · ${nf.format(skripsi.char_count)} karakter`
        : "Belum diunggah",
      ok: !!skripsi,
      action: skripsi ? "Ganti" : "Unggah",
      onClick: onOpenSettings,
    },
    {
      key: "model",
      label: "Model AI",
      value: settings
        ? `${PROVIDER_LABELS[settings.provider] ?? settings.provider} · ${settings.model}`
        : "Memuat…",
      ok: !!settings && (settings.has_api_key || !!settings.effective_ai_shared),
      action: "Atur",
      onClick: onOpenSettings,
    },
    {
      key: "mic",
      label: "Mikrofon",
      value:
        mic === "ok"
          ? "Terdengar jelas"
          : mic === "fail"
            ? "Tidak terdengar"
            : "Belum diuji",
      ok: mic === "ok",
      action: "Tes",
      onClick: onTestMic,
    },
  ];

  return (
    <div className="split split-wide">
      <div className="stack-lg">
        <section className="card card-lg home-hero">
          <span className="eyebrow">Simulasi sidang skripsi</span>
          <h1>Siap latihan sidang?</h1>
          <p>
            Penguji bertanya langsung dari naskah skripsi Anda. Pilih karakter
            penguji, jawab secara lisan, lalu terima penilaian dan catatan revisi
            begitu sidang ditutup.
          </p>
          <div className="home-cta">
            {resumable && (
              <button className="primary lg" onClick={onResume}>
                Lanjutkan Sidang
              </button>
            )}
            <button className={resumable ? "lg" : "primary lg"} onClick={onStart}>
              {resumable ? "Mulai Sesi Baru" : "Mulai Latihan Sidang"}
            </button>
            <button className="lg" onClick={onOpenHistory}>
              Lihat riwayat sesi
            </button>
          </div>
        </section>

        <section className="card">
          <h3>Bagaimana sidang berjalan</h3>
          <div className="steps">
            {STEPS.map(([n, title, desc]) => (
              <div className="step" key={n}>
                <span className="step-n">{n}</span>
                <span className="step-title">{title}</span>
                <span className="step-desc">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card card-flush">
          <div className="panel-head">
            <span className="eyebrow">Sesi terakhir</span>
            <button className="ghost sm" onClick={onOpenHistory}>
              Lihat semua
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="empty-sub panel-empty">
              Belum ada sesi. Mulai latihan pertama Anda dari tombol di atas.
            </p>
          ) : (
            <ul className="history-list flush">
              {recent.map((s) => (
                <li key={s.id} className="history-row">
                  <div className={`score-badge ${scoreTone(s.final_score)}`}>
                    {s.final_score ?? "—"}
                  </div>
                  <div className="history-meta">
                    <span className="history-title">{s.label ?? "Sesi latihan"}</span>
                    <span className="history-count">
                      {formatDate(s.created_at)} · {s.turn_count} percakapan
                      {s.final_score != null && ` · Skor ${s.final_score}`}
                    </span>
                  </div>
                  <div className="history-actions">
                    <button className="sm" onClick={() => onOpenSession(s.id)}>
                      Buka
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="stack">
        <div className="card">
          <span className="eyebrow">Kesiapan</span>
          <div className="readiness">
            {readiness.map((r) => (
              <div className="ready-row" key={r.key}>
                <span className={`ready-dot ${r.ok ? "ok" : "warn"}`} aria-hidden="true" />
                <div className="ready-meta">
                  <span className="ready-label">{r.label}</span>
                  <span className="ready-value">{r.value}</span>
                </div>
                <button className="sm" onClick={r.onClick}>
                  {r.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="tip-card score-card">
          <span className="eyebrow">Skor terakhir</span>
          <div className="score-card-val">
            <strong>{lastScored?.final_score ?? "—"}</strong>
            <span>
              /100 · {lastScored ? gradeOf(lastScored.final_score as number) : "—"}
            </span>
          </div>
          <p>
            {lastScored
              ? `${lastScored.label ?? "Sesi latihan"} · ${formatDate(lastScored.created_at)}`
              : "Belum ada sesi yang dinilai."}
          </p>
        </div>
      </aside>
    </div>
  );
}
