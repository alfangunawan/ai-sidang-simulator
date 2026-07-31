import { useEffect, useState } from "react";
import {
  Calendar, ChartColumn, CircleAlert, FileText, MessageSquare, Users as UsersIcon,
} from "lucide-react";
import { getOverview, listAllSessions } from "../../adminApi.js";
import type { AdminOverview, AdminSessionRow } from "../../types.js";
import { Alert, Avatar, EYEBROW, Loading, PageHead, Panel } from "./ui.js";
import { cn } from "@/lib/utils";

const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", opts);

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Panel className="min-w-0 p-[18px]">
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex size-[26px] flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[15px]" />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      <div className="text-[27px] leading-none font-bold tracking-tighter tabular-nums">
        {value}
      </div>
      {hint && (
        <div className="mt-2.5 text-[11.5px] font-semibold text-muted-foreground">{hint}</div>
      )}
    </Panel>
  );
}

export function Overview({
  onCounts,
}: {
  onCounts?: (counts: { pengguna: number; sesi: number }) => void;
}) {
  const [data, setData] = useState<AdminOverview | null>(null);
  // "Sesi terakhir" butuh barisnya, bukan hitungannya — ringkasan hanya membawa
  // angka. Gagal memuatnya tidak boleh menjatuhkan seluruh halaman.
  const [recent, setRecent] = useState<AdminSessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then((d) => {
        setData(d);
        onCounts?.({ pengguna: d.users, sesi: d.sessions });
      })
      .catch((e) => setErr((e as Error).message));
    listAllSessions()
      .then((rows) => setRecent(rows.slice(0, 4)))
      .catch(() => setRecent([]));
  }, []);

  if (err && !data) return <Alert>{err}</Alert>;
  if (!data) return <Loading />;

  const peak = Math.max(1, ...data.signups.map((s) => s.count));
  const first = data.signups[0].day;
  const last = data.signups.at(-1)!.day;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const range = `${day(first, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${day(last, { day: "numeric", month: "short", year: "numeric" })}`;
  const lastWeek = data.signups.slice(-7).reduce((a, s) => a + s.count, 0);
  const running = recent.filter((s) => s.status !== "closed").length;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Ringkasan" sub="Pemakaian SiBiru dua minggu terakhir.">
        <span className="flex h-[34px] items-center gap-2 rounded-[9px] border bg-card px-3 text-xs font-semibold text-foreground/70 tabular-nums">
          <Calendar className="size-3.5 text-muted-foreground" />
          {range}
        </span>
      </PageHead>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(186px,1fr))]">
        <Kpi
          icon={UsersIcon}
          label="Pengguna"
          value={data.users.toLocaleString("id-ID")}
          hint={`+${lastWeek} dalam 7 hari`}
        />
        <Kpi
          icon={MessageSquare}
          label="Sesi sidang"
          value={data.sessions.toLocaleString("id-ID")}
          hint={recent.length ? `${running} dari ${recent.length} terakhir berjalan` : undefined}
        />
        <Kpi
          icon={FileText}
          label="Naskah diunggah"
          value={data.documents.toLocaleString("id-ID")}
        />
        <Kpi
          icon={ChartColumn}
          label="Token terpakai"
          value={data.tokens.toLocaleString("id-ID")}
          hint={`${data.turns.toLocaleString("id-ID")} giliran`}
        />
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel className="px-[22px] pt-5 pb-[18px]">
          <div className="mb-5 flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-sm font-bold tracking-tight">Pendaftar baru</h2>
            <span className="text-xs text-muted-foreground">
              {data.signups.length} hari · {data.signups.reduce((a, s) => a + s.count, 0)} akun
            </span>
            <span className={cn(EYEBROW, "ml-auto")}>Puncak {peak}/hari</span>
          </div>
          <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-2.5">
            <div className="flex h-[168px] flex-col justify-between text-right text-[10.5px] font-bold text-muted-foreground/70 tabular-nums">
              <span>{peak}</span>
              <span>{Math.round(peak / 2)}</span>
              <span>0</span>
            </div>
            <div>
              <div className="relative h-[168px] border-b">
                <div className="absolute inset-x-0 top-0 border-t border-dashed border-border/70" />
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" />
                {/* top-4 menyisakan jalur untuk angka di atas batang, jadi batang
                    tertinggi (100%) tetap muat di dalam 168px. */}
                <div className="absolute inset-x-0 top-4 bottom-0 flex items-end gap-1.5">
                  {data.signups.map((s) => (
                    <div
                      key={s.day}
                      title={`${s.count} pendaftar pada ${day(s.day, { day: "numeric", month: "short" })}`}
                      className="flex h-full flex-1 cursor-default flex-col items-center justify-end"
                    >
                      <span
                        className="mb-1 text-[10.5px] leading-none font-bold text-primary tabular-nums"
                        style={{ opacity: s.count ? 1 : 0 }}
                      >
                        {s.count}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-[5px] rounded-b-[2px]",
                          s.count ? "bg-primary" : "bg-border",
                        )}
                        // minHeight, bukan height: hari kosong tetap punya sisa
                        // batang supaya deretnya terbaca sebagai 14 hari.
                        style={{ height: `${(s.count / peak) * 100}%`, minHeight: "3px" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                {data.signups.map((s) => (
                  <span
                    key={s.day}
                    className={cn(
                      "flex-1 text-center text-[10px] font-semibold tabular-nums",
                      s.count ? "text-foreground/70" : "text-muted-foreground/70",
                    )}
                  >
                    {Number(s.day.slice(8, 10))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-3.5">
          <Panel className="px-[22px] py-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Biaya router</h2>
              <span className={cn(EYEBROW, "rounded-md bg-secondary px-1.5 py-0.5")}>
                Router saja
              </span>
            </div>
            <div className="mt-3.5 flex items-end gap-2.5">
              <span className="text-[34px] leading-none font-bold tracking-tighter tabular-nums">
                ${data.cost_usd.toFixed(2)}
              </span>
              <span className="pb-1 text-xs font-semibold text-muted-foreground">
                {data.tokens.toLocaleString("id-ID")} token
              </span>
            </div>
            {/* Provider Claude langsung menulis cost_usd 0, jadi angka ini hanya
                mencakup pemakaian lewat router OpenAI-compatible. */}
            <div className="mt-4 flex gap-2.5 border-t pt-3.5">
              <CircleAlert className="mt-0.5 size-[15px] flex-none text-muted-foreground/70" />
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
                Hanya pemakaian lewat router OpenAI-compatible yang melaporkan
                biaya. Pengguna Claude langsung selalu $0.00 — baca kolom token
                sebagai ukuran yang jujur.
              </p>
            </div>
          </Panel>

          {recent.length > 0 && (
            <Panel className="px-[22px] pt-[18px] pb-2">
              <h2 className="mb-1.5 text-sm font-bold tracking-tight">Sesi terakhir</h2>
              {recent.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-t py-2.5"
                >
                  <Avatar className="size-7">{s.username.slice(0, 1).toUpperCase()}</Avatar>
                  <span className="flex min-w-0 flex-col leading-snug">
                    <span className="truncate text-[13px] font-semibold tracking-tight">
                      {s.username}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {s.created_at.slice(0, 16).replace("T", " ")} · {s.turn_count} giliran
                    </span>
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
                      s.status === "closed"
                        ? "bg-secondary text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {s.status === "closed" ? `Skor ${s.final_score ?? "—"}` : "Berjalan"}
                  </span>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
