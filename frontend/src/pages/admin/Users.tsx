import { useEffect, useState } from "react";
import { listUsers, patchUser, deleteUser } from "../../adminApi.js";
import type { AdminUserRow } from "../../types.js";
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

export function Users({ selfId }: { selfId: number }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<AdminUserRow | null>(null);
  const [typed, setTyped] = useState("");

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

  if (err && !rows) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Memuat…</p>;

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
                    {/* Aksi merusak terhadap diri sendiri tidak ditawarkan sama
                        sekali; backend juga menolaknya, ini hanya agar tombolnya
                        tidak menggoda. */}
                    {!self && (
                      <div className="flex flex-wrap gap-2">
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
                      </div>
                    )}
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
    </div>
  );
}
