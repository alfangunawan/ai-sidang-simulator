import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { listSessions, getSkripsi, getSettings } from "../api.js";
import type { SessionSummary, SkripsiInfo, SettingsView } from "../types.js";
import { formatDate, scoreTone, gradeOf } from "../lib/sessions.js";
import type { MicState } from "../components/SetupModal.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

const SCORE_TONE: Record<string, string> = {
  good: "bg-success/15 text-success",
  mid: "bg-primary/10 text-primary",
  low: "bg-destructive/10 text-destructive",
};

/** Score pill colouring, shared with Riwayat so a score reads the same in both. */
export function scoreChipClass(score: number | null): string {
  return SCORE_TONE[scoreTone(score)] ?? "bg-muted text-muted-foreground";
}

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

  // The single mobile column is spelled minmax(0,1fr) rather than left implicit:
  // an implicit `auto` track is floored at its items' min-content, and a
  // `truncate` row reports its untruncated width there, which pushed the whole
  // page wider than the viewport.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden">
          <CardContent className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl"
            />
            <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
              Simulasi sidang skripsi
            </span>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Siap latihan sidang?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Penguji bertanya langsung dari naskah skripsi Anda. Pilih karakter
              penguji, jawab secara lisan, lalu terima penilaian dan catatan revisi
              begitu sidang ditutup.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {resumable && (
                <Button size="lg" onClick={onResume}>
                  Lanjutkan Sidang
                </Button>
              )}
              <Button
                size="lg"
                variant={resumable ? "outline" : "default"}
                onClick={onStart}
              >
                {resumable ? "Mulai Sesi Baru" : "Mulai Latihan Sidang"}
              </Button>
              <Button size="lg" variant="ghost" onClick={onOpenHistory}>
                Lihat riwayat sesi
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bagaimana sidang berjalan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            {STEPS.map(([n, title, desc]) => (
              <div key={n}>
                <span className="font-mono text-xs font-bold text-primary">{n}</span>
                <div className="mt-1 text-sm font-semibold">{title}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Sesi terakhir
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onOpenHistory}>
              Lihat semua
              <ArrowRight />
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada sesi. Mulai latihan pertama Anda dari tombol di atas.
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                        scoreChipClass(s.final_score),
                      )}
                    >
                      {s.final_score ?? "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {s.label ?? "Sesi latihan"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(s.created_at)} · {s.turn_count} percakapan
                        {s.final_score != null && ` · Skor ${s.final_score}`}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onOpenSession(s.id)}>
                      Buka
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Kesiapan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {readiness.map((r, i) => (
              <div key={r.key}>
                {i > 0 && <Separator />}
                <div className="ready-row flex items-center gap-3 py-3 first:pt-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "ready-dot size-2 shrink-0 rounded-full",
                      r.ok ? "ok bg-success" : "warn bg-warning",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{r.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.value}</div>
                  </div>
                  <Button variant="outline" size="xs" onClick={r.onClick}>
                    {r.action}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="score-card border-transparent bg-primary text-primary-foreground">
          <CardContent>
            <span className="text-[11px] font-bold tracking-widest text-primary-foreground/70 uppercase">
              Skor terakhir
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="font-serif text-4xl leading-none font-semibold">
                {lastScored?.final_score ?? "—"}
              </strong>
              <span className="text-sm text-primary-foreground/80">
                /100 · {lastScored ? gradeOf(lastScored.final_score as number) : "—"}
              </span>
            </div>
            <p className="mt-3 text-xs text-primary-foreground/80">
              {lastScored
                ? `${lastScored.label ?? "Sesi latihan"} · ${formatDate(lastScored.created_at)}`
                : "Belum ada sesi yang dinilai."}
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
