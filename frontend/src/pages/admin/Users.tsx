import { useEffect, useState } from "react";
import { listUsers, patchUser, deleteUser, getUserDetail } from "../../adminApi.js";
import type { AdminUserRow, AdminUserDetail } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Key presence hanya boolean ("Terisi"/"Kosong") — endpoint dan halaman ini
// tidak pernah membawa nilai key aslinya, lihat backend/src/repos/admin.ts.
const KEY_FIELDS: { field: keyof AdminUserDetail["settings"]; label: string }[] = [
  { field: "has_api_key", label: "API key LLM" },
  { field: "has_google_tts_key", label: "API key TTS Google" },
  { field: "has_openai_tts_key", label: "API key TTS OpenAI" },
  { field: "has_openai_stt_key", label: "API key STT OpenAI" },
];

export function Users({ selfId }: { selfId: number }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<AdminUserRow | null>(null);
  const [typed, setTyped] = useState("");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  function reload() {
    listUsers().then(setRows).catch((e) => setErr((e as Error).message));
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

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground" aria-live="polite">Memuat…</p>;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pengguna</TableHead>
              <TableHead className="text-right">Sesi</TableHead>
              <TableHead className="text-right">Token</TableHead>
              <TableHead className="text-right">Biaya*</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const self = u.id === selfId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.username}</span>
                      {u.is_admin && <Badge>admin</Badge>}
                      {u.suspended && <Badge variant="destructive">ditangguhkan</Badge>}
                      {u.key_owner && (
                        <span className="text-xs text-muted-foreground">
                          {u.key_owner} (key)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {u.created_at.slice(0, 10)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.sessions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {u.tokens.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${u.cost_usd.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="xs" onClick={() => openDetail(u)}>
                        Detail {u.username}
                      </Button>
                      {/* Aksi merusak terhadap diri sendiri tidak ditawarkan sama
                          sekali; backend juga menolaknya, ini hanya agar tombolnya
                          tidak menggoda. */}
                      {!self && (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              act(() => patchUser(u.id, { suspended: !u.suspended }))
                            }
                          >
                            {u.suspended ? `Pulihkan ${u.username}` : `Tangguhkan ${u.username}`}
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => act(() => patchUser(u.id, { is_admin: !u.is_admin }))}
                          >
                            {u.is_admin ? `Cabut admin ${u.username}` : `Jadikan admin ${u.username}`}
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => {
                              setTyped("");
                              setDoomed(u);
                            }}
                          >
                            Hapus {u.username}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        *Biaya hanya terisi untuk pemakaian lewat router OpenAI-compatible.
        Pengguna Claude langsung selalu $0.00 — baca kolom token.
      </p>

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
                        <span className="text-muted-foreground">
                          {d.dossier_status ?? "—"}
                        </span>
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
