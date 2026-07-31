import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  listAdminPersonas, putPersona, deletePersona, type AdminPersonaRow,
} from "../../adminApi.js";
import { MODE_LABELS, TYPE_LABELS } from "../../personas.js";
import { Alert, Avatar, Loading, PageHead, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BLANK: AdminPersonaRow = {
  key: "", name: "", initials: "", role: "", mode: "standar", type: "umum",
  color: "#475569", trait: "", position: 0, active: true,
};

// Mode itu tekanan, bukan kategori: warnanya naik dari tenang ke galak.
const MODE_TONE: Record<string, string> = {
  santai: "bg-success/10 text-success",
  standar: "bg-secondary text-muted-foreground",
  kritis: "bg-warning/15 text-warning",
  galak: "bg-destructive/10 text-destructive",
};

export function Personas({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<AdminPersonaRow[] | null>(null);
  const [edit, setEdit] = useState<AdminPersonaRow | null>(null);
  // Kunci hanya boleh diisi saat membuat persona baru: PUT mengirim ke
  // /admin/personas/:key memakai key ini, jadi mengubahnya di tengah "Ubah"
  // membuat baris baru alih-alih mengganti nama baris lama.
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reload() {
    listAdminPersonas()
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

  if (err && !rows) return <Alert>{err}</Alert>;
  if (!rows) return <Loading />;

  function openNew() {
    setEdit({ ...BLANK, position: rows!.length });
    setIsNew(true);
  }
  function openEdit(p: AdminPersonaRow) {
    setEdit(p);
    setIsNew(false);
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title="Persona penguji"
        sub={`${rows.length} persona · ${rows.filter((p) => p.active).length} aktif dipakai penguji`}
      >
        <Button className="h-[38px] rounded-[10px]" onClick={openNew}>
          <Plus />
          Persona baru
        </Button>
      </PageHead>

      {err && <Alert>{err}</Alert>}

      <div className="grid gap-3.5 xl:grid-cols-2">
        {rows.map((p) => (
          <Panel key={p.key} className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <Avatar
                className="size-[42px] rounded-[13px] text-sm"
                style={{ color: p.color, backgroundColor: `${p.color}1A` }}
              >
                {p.initials || p.name.slice(0, 2).toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug font-bold tracking-tight">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.role}</div>
              </div>
              <button
                role="switch"
                aria-checked={p.active}
                aria-label={`${p.active ? "Nonaktifkan" : "Aktifkan"} ${p.key}`}
                onClick={() => act(() => putPersona({ ...p, active: !p.active }))}
                className={cn(
                  "flex h-[26px] flex-none items-center gap-1.5 rounded-full py-0 pr-1 pl-2.5 transition-colors",
                  p.active ? "bg-primary" : "bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    p.active ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {p.active ? "Aktif" : "Nonaktif"}
                </span>
                <span className="size-[18px] rounded-full bg-card shadow-sm" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                  MODE_TONE[p.mode] ?? MODE_TONE.standar,
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {MODE_LABELS[p.mode] ?? p.mode}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground">
                {TYPE_LABELS[p.type] ?? p.type}
              </span>
            </div>

            <div className="flex gap-2 border-t pt-3.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-[9px] text-xs"
                aria-label={`Ubah ${p.key}`}
                onClick={() => openEdit(p)}
              >
                Ubah persona
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-8 rounded-[9px] border-destructive/25 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Hapus ${p.key}`}
                onClick={() => act(() => deletePersona(p.key))}
              >
                Hapus
              </Button>
            </div>
          </Panel>
        ))}
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
              {/* mode dan type dibatasi ke opsi yang backend kenal (Select, bukan
                  teks bebas) — pasangan keduanya harus tetap unik di antar
                  persona supaya personaFor bisa membaca persona balik dari
                  pasangan tersimpan; lihat frontend/src/personas.ts. */}
              <div>
                <Label htmlFor="p-mode">Mode</Label>
                <Select value={edit.mode} onValueChange={(v) => setEdit({ ...edit, mode: v })}>
                  <SelectTrigger id="p-mode" aria-label="Mode" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-type">Tipe</Label>
                <Select value={edit.type} onValueChange={(v) => setEdit({ ...edit, type: v })}>
                  <SelectTrigger id="p-type" aria-label="Tipe" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-color">Warna</Label>
                <Input
                  id="p-color"
                  className="mt-1"
                  value={edit.color}
                  onChange={(e) => setEdit({ ...edit, color: e.target.value })}
                />
              </div>
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
