import { useEffect, useState } from "react";
import {
  listAdminPersonas, putPersona, deletePersona, type AdminPersonaRow,
} from "../../adminApi.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const BLANK: AdminPersonaRow = {
  key: "", name: "", initials: "", role: "", mode: "standar", type: "umum",
  color: "#475569", trait: "", position: 0, active: true,
};

export function Personas() {
  const [rows, setRows] = useState<AdminPersonaRow[] | null>(null);
  const [edit, setEdit] = useState<AdminPersonaRow | null>(null);
  // Kunci hanya boleh diisi saat membuat persona baru: PUT mengirim ke
  // /admin/personas/:key memakai key ini, jadi mengubahnya di tengah "Ubah"
  // membuat baris baru alih-alih mengganti nama baris lama.
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reload() {
    listAdminPersonas().then(setRows).catch((e) => setErr((e as Error).message));
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

  function openNew() {
    setEdit({ ...BLANK, position: rows!.length });
    setIsNew(true);
  }
  function openEdit(p: AdminPersonaRow) {
    setEdit(p);
    setIsNew(false);
  }

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button size="sm" onClick={openNew}>
        Persona baru
      </Button>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.key} className={!p.active ? "opacity-60" : undefined}>
                <TableCell>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.role}</span>
                </TableCell>
                <TableCell>{p.mode}</TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell>
                  <Badge variant={p.active ? "secondary" : "outline"}>
                    {p.active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => openEdit(p)}>
                      Ubah {p.key}
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => act(() => deletePersona(p.key))}
                    >
                      Hapus {p.key}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={edit !== null} onOpenChange={(next) => !next && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Persona baru" : `Ubah ${edit?.key}`}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {(
                [
                  ["key", "Kunci"],
                  ["name", "Nama"],
                  ["initials", "Inisial"],
                  ["role", "Peran"],
                  ["mode", "Mode"],
                  ["type", "Tipe"],
                  ["color", "Warna"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <Label htmlFor={`p-${field}`}>{label}</Label>
                  <Input
                    id={`p-${field}`}
                    className="mt-1"
                    disabled={field === "key" && !isNew}
                    value={edit[field]}
                    onChange={(e) => {
                      if (field === "key" && !isNew) return; // read-only once saved
                      setEdit({ ...edit, [field]: e.target.value });
                    }}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="p-active"
                  checked={edit.active}
                  onCheckedChange={(v) => setEdit({ ...edit, active: v === true })}
                />
                <Label htmlFor="p-active">Aktif</Label>
              </div>
              <div>
                <Label htmlFor="p-trait">Sifat</Label>
                <Textarea
                  id="p-trait"
                  rows={3}
                  className="mt-1"
                  value={edit.trait}
                  onChange={(e) => setEdit({ ...edit, trait: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                const row = edit!;
                setEdit(null);
                act(() => putPersona(row));
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
