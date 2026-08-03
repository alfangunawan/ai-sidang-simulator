import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { listCodes, kickMember, putCode } from "../../adminApi.js";
import type { AdminCodeRow } from "../../types.js";
import { Alert, Avatar, EYEBROW, Loading, PageHead, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SHARES: { field: keyof AdminCodeRow["shares"]; label: string }[] = [
  { field: "share_ai", label: "AI" },
  { field: "share_tts", label: "TTS" },
  { field: "share_stt", label: "STT" },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className={cn(EYEBROW, "mb-1")}>{label}</div>
      <div className="text-xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

export function Codes({ onCount }: { onCount?: (n: number) => void }) {
  const [codes, setCodes] = useState<AdminCodeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: number; value: string } | null>(null);

  function reload() {
    listCodes()
      .then((rows) => {
        setCodes(rows);
        onCount?.(rows.length);
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  if (err && !codes) return <Alert>{err}</Alert>;
  if (!codes) return <Loading />;

  async function kick(hostId: number, memberId: number) {
    try {
      await kickMember(hostId, memberId);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveCode(hostId: number, value: string) {
    setErr(null);
    try {
      await putCode(hostId, value.trim());
      setEdit(null);
      reload();
    } catch (e) {
      setErr((e as Error).message); // form tetap terbuka supaya kodenya bisa dibetulkan
    }
  }

  // Kode undangan bukan bahan rahasia — endpoint tidak pernah mengirim nilai
  // API key-nya — jadi tidak ada gunanya disembunyikan di balik tombol.
  async function copy(code: string) {
    await navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1800);
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title="Kode akses"
        sub="Satu host membagikan kunci API-nya ke anggota yang dipercaya."
      />

      {err && <Alert>{err}</Alert>}

      {codes.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted-foreground">
          Belum ada kode akses.
        </Panel>
      ) : (
        codes.map((c) => (
          <Panel key={c.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start gap-4 border-b p-6">
              <Avatar className="size-11 rounded-[13px] bg-primary/10 text-base text-primary">
                {c.host_username.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-[220px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight">{c.host_username}</span>
                  <span className={cn(EYEBROW, "rounded-md bg-secondary px-1.5 py-0.5")}>
                    Host
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {edit?.id === c.id ? (
                    <>
                      <Input
                        value={edit.value}
                        aria-label={`Kode ${c.host_username}`}
                        className="h-7 w-52 rounded-lg font-mono text-[13px]"
                        autoFocus
                        onChange={(e) => setEdit({ id: c.id, value: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveCode(c.host_user_id, edit.value)}
                      />
                      <Button
                        size="sm"
                        className="h-7 rounded-lg text-[11.5px]"
                        disabled={!edit.value.trim()}
                        onClick={() => saveCode(c.host_user_id, edit.value)}
                      >
                        Simpan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg text-[11.5px]"
                        onClick={() => setEdit(null)}
                      >
                        Batal
                      </Button>
                    </>
                  ) : (
                    <>
                      <code className="rounded-lg border bg-background px-2.5 py-1 font-mono text-[13px] tracking-wide text-foreground/80">
                        {c.invite_code}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg text-[11.5px]"
                        aria-label={`Salin kode ${c.host_username}`}
                        onClick={() => copy(c.invite_code)}
                      >
                        <Copy />
                        {copied === c.invite_code ? "Tersalin" : "Salin"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg text-[11.5px]"
                        aria-label={`Ubah kode ${c.host_username}`}
                        onClick={() => setEdit({ id: c.id, value: c.invite_code })}
                      >
                        Ubah
                      </Button>
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SHARES.filter(({ field }) => c.shares[field] === 1).map(({ field, label }) => (
                    <span
                      key={field}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-6">
                <Stat label="Panggilan" value={c.calls} />
                <Stat label="Biaya" value={`$${c.cost_usd.toFixed(2)}`} />
                <Stat label="Anggota" value={c.members.length} />
              </div>
            </div>

            <div className="px-6 pt-3 pb-4">
              <span className={cn(EYEBROW, "block py-2")}>Anggota</span>
              {c.members.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Belum ada yang memakai kode ini.
                </p>
              ) : (
                c.members.map((m) => (
                  <div
                    key={m.member_user_id}
                    className="flex items-center gap-3 border-t py-2.5"
                  >
                    <Avatar className="size-[30px]">{m.username.slice(0, 1).toUpperCase()}</Avatar>
                    <span className="flex flex-col leading-snug">
                      <span className="text-[13.5px] font-semibold tracking-tight">
                        {m.username}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        Bergabung {m.joined_at.slice(0, 10)}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-[30px] rounded-lg border-destructive/25 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Tendang ${m.username}`}
                      onClick={() => kick(c.host_user_id, m.member_user_id)}
                    >
                      Keluarkan
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
