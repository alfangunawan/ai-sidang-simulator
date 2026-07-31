import { useEffect, useState } from "react";
import { EllipsisVertical, Search } from "lucide-react";
import { listUsers, patchUser, deleteUser, getUserDetail } from "../../adminApi.js";
import type { AdminUserRow, AdminUserDetail } from "../../types.js";
import { Alert, Avatar, EYEBROW, Loading, PageHead, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Key presence hanya boolean ("Terisi"/"Kosong") — endpoint dan halaman ini
// tidak pernah membawa nilai key aslinya, lihat backend/src/repos/admin.ts.
const KEY_FIELDS: { field: keyof AdminUserDetail["settings"]; label: string }[] = [
  { field: "has_api_key", label: "API key LLM" },
  { field: "has_google_tts_key", label: "API key TTS Google" },
  { field: "has_openai_tts_key", label: "API key TTS OpenAI" },
  { field: "has_openai_stt_key", label: "API key STT OpenAI" },
];

export function Users({ selfId, onCount }: { selfId: number; onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [doomed, setDoomed] = useState<AdminUserRow | null>(null);
  const [typed, setTyped] = useState("");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  function reload() {
    listUsers()
      .then((r) => {
        setRows(r);
        onCount?.(r.length);
      })
      .catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  async function act(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function openDetail(u: AdminUserRow) {
    setErr(null);
    try {
      setDetail(await getUserDetail(u.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !rows) return <Alert>{err}</Alert>;
  if (!rows) return <Loading />;

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((u) => u.username.toLowerCase().includes(needle)) : rows;
  const tokens = rows.reduce((a, u) => a + u.tokens, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title="Pengguna"
        sub={`${shown.length} dari ${rows.length} akun · ${tokens.toLocaleString("id-ID")} token`}
      >
        <div className="relative min-w-[250px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari nama pengguna"
            placeholder="Cari nama pengguna"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-[38px] rounded-[10px] pl-9"
          />
        </div>
      </PageHead>

      {err && <Alert>{err}</Alert>}

      <Panel>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(EYEBROW, "pl-[22px]")}>Pengguna</TableHead>
              <TableHead className={EYEBROW}>Terdaftar</TableHead>
              <TableHead className={cn(EYEBROW, "text-right")}>Sesi</TableHead>
              <TableHead className={cn(EYEBROW, "text-right")}>Token</TableHead>
              <TableHead className={cn(EYEBROW, "text-right")}>Biaya*</TableHead>
              <TableHead className={cn(EYEBROW, "pr-[22px] text-right")}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((u) => {
              const self = u.id === selfId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="py-3 pl-[22px]">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        className={cn("size-8", u.is_admin && "bg-primary/10 text-primary")}
                      >
                        {u.username.slice(0, 1).toUpperCase()}
                      </Avatar>
                      <span className="flex min-w-0 flex-col leading-snug">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-semibold tracking-tight">
                            {u.username}
                          </span>
                          {u.is_admin && (
                            <Badge className={cn(EYEBROW, "rounded-[5px] bg-primary/10 px-1.5 text-primary")}>
                              Admin
                            </Badge>
                          )}
                          {u.suspended && (
                            <Badge variant="destructive" className={cn(EYEBROW, "rounded-[5px] px-1.5 text-white")}>
                              Ditangguhkan
                            </Badge>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {u.key_owner ? `${u.key_owner} (key)` : "Kunci sendiri"}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {u.created_at.slice(0, 10)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-[13px] font-semibold tabular-nums",
                      !u.sessions && "text-muted-foreground/70",
                    )}
                  >
                    {u.sessions}
                  </TableCell>
                  <TableCell className="text-right text-[13px] text-foreground/70 tabular-nums">
                    {u.tokens.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-[13px] tabular-nums",
                      !u.cost_usd && "text-muted-foreground/70",
                    )}
                  >
                    ${u.cost_usd.toFixed(2)}
                  </TableCell>
                  <TableCell className="pr-[22px]">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded-lg text-xs"
                        aria-label={`Detail ${u.username}`}
                        onClick={() => openDetail(u)}
                      >
                        Detail
                      </Button>
                      {/* Aksi merusak terhadap diri sendiri tidak ditawarkan sama
                          sekali; backend juga menolaknya, ini hanya agar tombolnya
                          tidak menggoda. */}
                      {!self && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="size-[30px] rounded-lg"
                              aria-label={`Aksi lain untuk ${u.username}`}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onSelect={() =>
                                act(() => patchUser(u.id, { suspended: !u.suspended }))
                              }
                            >
                              {u.suspended ? `Pulihkan ${u.username}` : `Tangguhkan ${u.username}`}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                act(() => patchUser(u.id, { is_admin: !u.is_admin }))
                              }
                            >
                              {u.is_admin
                                ? `Cabut admin ${u.username}`
                                : `Jadikan admin ${u.username}`}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                setTyped("");
                                setDoomed(u);
                              }}
                            >
                              Hapus {u.username}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="px-[22px] py-3.5 text-[11.5px] leading-relaxed text-muted-foreground/80">
          *Biaya hanya terisi untuk pemakaian lewat router OpenAI-compatible.
          Pengguna Claude langsung selalu $0.00 — baca kolom token.
        </p>
      </Panel>

      <Dialog open={doomed !== null} onOpenChange={(next) => !next && setDoomed(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus {doomed?.username}?</DialogTitle>
            <DialogDescription>
              Semua sesi, transkrip, naskah, dan catatan pemakaian miliknya ikut
              terhapus permanen. Tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="confirm-username">Ketik username untuk memastikan</Label>
            <Input
              id="confirm-username"
              value={typed}
              autoFocus
              className="mt-2"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoomed(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== doomed?.username}
              onClick={() => {
                const id = doomed!.id;
                setDoomed(null);
                act(() => deleteUser(id));
              }}
            >
              Hapus permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(next) => !next && setDetail(null)}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail — {detail?.user.username}</DialogTitle>
            <DialogDescription>
              Ini triase, bukan pemulihan kredensial: key hanya ditampilkan
              sebagai ada/tidak, tidak pernah nilainya.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-2 font-medium">Pengaturan</p>
                <div className="flex flex-wrap gap-2">
                  {KEY_FIELDS.map(({ field, label }) => {
                    const present = Boolean(detail.settings[field]);
                    return (
                      <Badge key={field} variant={present ? "secondary" : "outline"}>
                        {label}: {present ? "Terisi" : "Kosong"}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium">Sesi ({detail.sessions.length})</p>
                {detail.sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Belum ada sesi.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.sessions.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {s.created_at.slice(0, 16).replace("T", " ")}
                        </span>
                        <Badge variant={s.status === "closed" ? "secondary" : "default"}>
                          {s.status}
                        </Badge>
                        <span>{s.turn_count} giliran</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 font-medium">Naskah ({detail.documents.length})</p>
                {detail.documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Belum ada naskah.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.documents.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{d.filename}</span>
                        <span className="text-muted-foreground">
                          {d.char_count.toLocaleString("id-ID")} karakter
                        </span>
                        <span className="text-muted-foreground">{d.dossier_status ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
