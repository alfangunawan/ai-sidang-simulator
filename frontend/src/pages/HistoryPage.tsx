import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { listSessions, getTurns, deleteSession } from "../api.js";
import type { SessionSummary, Turn } from "../types.js";
import { Transcript } from "../components/Transcript.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { turnsToCsv, downloadCsv } from "../lib/csv.js";
import { formatDate } from "../lib/sessions.js";
import { scoreChipClass } from "./HomePage.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function exportSession(s: SessionSummary, turns: Turn[]): void {
  const slug = s.created_at.slice(0, 16).replace(/[:T]/g, "-");
  downloadCsv(`sibiru-sesi-${slug}.csv`, turnsToCsv(turns));
}

// "Hari ini" / "Minggu ini" / "Lebih lama", from the session's own timestamp.
function bucketOf(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Lebih lama";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hari ini";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return days < 7 ? "Minggu ini" : "Lebih lama";
}

const BUCKETS = ["Hari ini", "Minggu ini", "Lebih lama"];

const FILTERS = [
  { value: "all", label: "Semua sesi" },
  { value: "scored", label: "Sudah dinilai" },
  { value: "unscored", label: "Belum dinilai" },
];

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-serif text-2xl font-semibold">{value}</span>
          {sub && <small className="text-xs text-muted-foreground">{sub}</small>}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  onOpenResult: (id: string) => void;
  /** Session Beranda asked to open straight into, consumed once on load. */
  openId?: string | null;
  onOpened?: () => void;
}

export function HistoryPage({ onOpenResult, openId, onOpened }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [detailTurns, setDetailTurns] = useState<Turn[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "scored" | "unscored">("all");

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setErr((e as Error).message));
  }, []);

  // "Buka" on Beranda lands here; the row it points at only exists once the
  // list has loaded, so the request is held until then.
  useEffect(() => {
    if (!openId) return;
    const hit = sessions.find((s) => s.id === openId);
    if (!hit) return;
    onOpened?.();
    open(hit);
  }, [openId, sessions]);

  const stats = useMemo(() => {
    const scored = sessions.filter((s) => s.final_score != null);
    const avg = scored.length
      ? Math.round(scored.reduce((n, s) => n + (s.final_score ?? 0), 0) / scored.length)
      : null;
    const turns = sessions.reduce((n, s) => n + s.turn_count, 0);
    return { total: sessions.length, avg, scored: scored.length, turns };
  }, [sessions]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = sessions.filter((s) => {
      if (filter === "scored" && s.final_score == null) return false;
      if (filter === "unscored" && s.final_score != null) return false;
      if (!q) return true;
      return `${s.label ?? ""} ${formatDate(s.created_at)}`.toLowerCase().includes(q);
    });
    return BUCKETS.map((label) => ({
      label,
      items: visible.filter((s) => bucketOf(s.created_at) === label),
    })).filter((g) => g.items.length > 0);
  }, [sessions, query, filter]);

  async function open(s: SessionSummary) {
    setErr(null);
    setSelected(s);
    try {
      setDetailTurns(await getTurns(s.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function doDelete() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    try {
      await deleteSession(id);
      setSessions((list) => list.filter((s) => s.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        setDetailTurns([]);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const confirm = (
    <ConfirmModal
      open={confirmId !== null}
      title="Hapus sesi?"
      message="Seluruh percakapan sesi ini akan dihapus permanen."
      onConfirm={doDelete}
      onCancel={() => setConfirmId(null)}
    />
  );

  if (selected) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft />
          Semua sesi
        </Button>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight">
              {selected.label ?? "Sesi latihan"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(selected.created_at)} · {selected.turn_count} percakapan
              {selected.final_score != null && ` · Skor ${selected.final_score}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportSession(selected, detailTurns)}>
              Export CSV
            </Button>
            {selected.status === "closed" && (
              <Button onClick={() => onOpenResult(selected.id)}>Lihat hasil sidang</Button>
            )}
            <Button variant="outline" className="text-destructive hover:text-destructive"
              onClick={() => setConfirmId(selected.id)}>
              Hapus
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden py-0">
          <CardHeader className="flex flex-row items-center gap-3 border-b bg-muted/40 py-4">
            <div className="flex size-9 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              P
            </div>
            <div>
              <div className="text-sm font-semibold">Transkrip Sidang</div>
              <div className="text-xs text-muted-foreground">Hanya baca</div>
            </div>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-4 overflow-y-auto py-5">
            {detailTurns.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Tidak ada percakapan pada sesi ini.
              </p>
            ) : (
              <Transcript turns={detailTurns} />
            )}
          </CardContent>
        </Card>

        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
        {confirm}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Riwayat Sidang</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sessions.length} sesi tersimpan. Buka transkrip untuk membaca ulang, atau
            lihat hasil penilaian penguji.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              placeholder="Cari sesi…"
              aria-label="Cari sesi"
              className="w-48 pl-8"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger aria-label="Saring sesi" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada riwayat sesi.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total sesi" value={stats.total} />
            <Stat label="Rata-rata skor" value={stats.avg ?? "—"} sub={stats.avg != null ? "/100" : undefined} />
            <Stat label="Sesi dinilai" value={stats.scored} sub={`dari ${stats.total}`} />
            <Stat label="Total percakapan" value={stats.turns} />
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada sesi yang cocok dengan filter.
            </p>
          ) : (
            groups.map((g) => (
              <section className="mb-6" key={g.label}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    {g.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{g.items.length} sesi</span>
                  <i className="h-px flex-1 bg-border" />
                </div>
                <Card>
                  <CardContent>
                    <ul className="divide-y">
                      {g.items.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                              scoreChipClass(s.final_score),
                            )}
                          >
                            {s.final_score ?? "—"}
                          </div>
                          {/* A floor rather than min-w-0: with three action
                              buttons on the line, a shrink-to-nothing column
                              crushes the label to one letter instead of
                              wrapping the buttons onto their own row. */}
                          <div className="min-w-40 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {s.label ?? "Sesi latihan"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {formatDate(s.created_at)} · {s.turn_count} percakapan
                              {s.final_score != null && ` · Skor ${s.final_score}`}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => open(s)}>
                              Buka
                            </Button>
                            {s.status === "closed" && (
                              <Button size="sm" onClick={() => onOpenResult(s.id)}>
                                Lihat Hasil
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmId(s.id)}
                            >
                              Hapus
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            ))
          )}
        </>
      )}

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
      {confirm}
    </div>
  );
}
