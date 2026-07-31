import { useEffect, useState } from "react";
import { listAllSessions, getAdminSession } from "../../adminApi.js";
import type { AdminSessionRow, Turn } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export function Sessions() {
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: AdminSessionRow; turns: Turn[] } | null>(null);

  useEffect(() => {
    listAllSessions().then(setRows).catch((e) => setErr((e as Error).message));
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

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground" aria-live="polite">Memuat…</p>;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pemilik</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Giliran</TableHead>
              <TableHead className="text-right">Skor</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.username}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.created_at.slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "closed" ? "secondary" : "default"}>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.turn_count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.final_score ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="xs"
                    aria-label={`Lihat transkrip ${s.username} — ${s.created_at.slice(0, 16).replace("T", " ")}`}
                    onClick={() => openTranscript(s)}
                  >
                    Lihat transkrip
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
