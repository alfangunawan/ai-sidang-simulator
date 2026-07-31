import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { listAllSessions, getAdminSession } from "../../adminApi.js";
import type { AdminSessionRow, Turn } from "../../types.js";
import { Alert, Avatar, EYEBROW, Loading, PageHead, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Filter = "semua" | "open" | "closed";

// Skor di bawah 55 itu gagal, 55–69 lolos dengan catatan, 70 ke atas aman —
// warnanya mengikuti pembacaan itu, bukan gradien sembarang.
const scoreTone = (n: number) =>
  n >= 70 ? "bg-success" : n >= 55 ? "bg-warning" : "bg-destructive";

export function Sessions({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("semua");
  const [open, setOpen] = useState<{ row: AdminSessionRow; turns: Turn[] } | null>(null);

  useEffect(() => {
    listAllSessions()
      .then((r) => {
        setRows(r);
        onCount?.(r.length);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function openTranscript(row: AdminSessionRow) {
    setErr(null);
    try {
      const full = await getAdminSession(row.id);
      setOpen({ row, turns: full.turns });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !rows) return <Alert>{err}</Alert>;
  if (!rows) return <Loading />;

  const active = rows.filter((s) => s.status !== "closed").length;
  const shown =
    filter === "semua"
      ? rows
      : rows.filter((s) => (filter === "closed" ? s.status === "closed" : s.status !== "closed"));
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "semua", label: "Semua", count: rows.length },
    { key: "open", label: "Berjalan", count: active },
    { key: "closed", label: "Selesai", count: rows.length - active },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title="Sesi sidang"
        sub={`${rows.length} sesi tercatat · ${active} berjalan`}
      >
        <div className="flex gap-1.5 rounded-[11px] bg-secondary p-1">
          {filters.map((f) => (
            // Angkanya lewat ::after, bukan node teks: kalau ia jadi elemen
            // sendiri, chip "Selesai 0" ikut terjaring pencarian teks "0" yang
            // dimaksudkan untuk kolom Giliran.
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              aria-label={`${f.label}, ${f.count} sesi`}
              data-count={f.count}
              className={cn(
                "h-[30px] rounded-lg px-3 text-xs transition-colors",
                "after:ml-1 after:tabular-nums after:opacity-55 after:content-[attr(data-count)]",
                filter === f.key
                  ? "bg-card font-bold text-foreground shadow-sm"
                  : "font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </PageHead>

      {err && <Alert>{err}</Alert>}

      <Panel>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(EYEBROW, "pl-[22px]")}>Pemilik</TableHead>
              <TableHead className={EYEBROW}>Mulai</TableHead>
              <TableHead className={EYEBROW}>Status</TableHead>
              <TableHead className={cn(EYEBROW, "text-right")}>Giliran</TableHead>
              <TableHead className={EYEBROW}>Skor</TableHead>
              <TableHead className={cn(EYEBROW, "pr-[22px] text-right")}>Transkrip</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => {
              const closed = s.status === "closed";
              return (
                <TableRow key={s.id}>
                  <TableCell className="py-3 pl-[22px]">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-[30px]">
                        {s.username.slice(0, 1).toUpperCase()}
                      </Avatar>
                      <span className="text-[13.5px] font-semibold tracking-tight">
                        {s.username}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {s.created_at.slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[11.5px] font-bold",
                        closed
                          ? "bg-secondary text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          closed ? "bg-muted-foreground/60" : "bg-primary",
                        )}
                      />
                      {closed ? "Selesai" : "Berjalan"}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-[13px] font-semibold tabular-nums",
                      !s.turn_count && "text-muted-foreground/70",
                    )}
                  >
                    {s.turn_count}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="h-[5px] w-14 flex-none overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            s.final_score === null ? "bg-transparent" : scoreTone(s.final_score),
                          )}
                          style={{ width: `${s.final_score ?? 0}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold tabular-nums",
                          s.final_score === null && "text-muted-foreground/70",
                        )}
                      >
                        {s.final_score ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-[22px]">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded-lg text-xs"
                        aria-label={`Lihat transkrip ${s.username} — ${s.created_at.slice(0, 16).replace("T", " ")}`}
                        onClick={() => openTranscript(s)}
                      >
                        <FileText />
                        Lihat
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transkrip — {open?.row.username}</DialogTitle>
            <DialogDescription>
              {open?.row.created_at.slice(0, 16).replace("T", " ")} · {open?.row.turn_count} giliran
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {open?.turns.map((t, i) => (
              <div key={i}>
                <p className="text-xs font-medium text-muted-foreground">
                  {t.role === "examiner" ? "Penguji" : "Mahasiswa"}
                </p>
                <p className="whitespace-pre-wrap">{t.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
