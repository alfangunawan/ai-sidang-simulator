import { useEffect, useState } from "react";
import { getOverview } from "../../adminApi.js";
import type { AdminOverview } from "../../types.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOverview().then(setData).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  const peak = Math.max(1, ...data.signups.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pengguna" value={data.users} />
        <Stat label="Sesi sidang" value={data.sessions} />
        <Stat label="Naskah diunggah" value={data.documents} />
        <Stat label="Token terpakai" value={data.tokens.toLocaleString("id-ID")} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Biaya (router saja)</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            ${data.cost_usd.toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Provider Claude langsung menulis cost_usd 0, jadi angka ini hanya
              mencakup pemakaian lewat router OpenAI-compatible. */}
          <p className="text-xs text-muted-foreground">
            Hanya pemakaian lewat router OpenAI-compatible yang melaporkan biaya.
            Pengguna Claude langsung selalu tercatat $0.00 — pakai kolom token
            sebagai ukuran yang jujur.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendaftar 14 hari terakhir</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-stretch gap-1">
            {data.signups.map((s) => (
              <div
                key={s.day}
                className="flex flex-1 flex-col justify-end"
                title={`${s.day}: ${s.count}`}
              >
                <div
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${(s.count / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.signups[0].day} → {data.signups.at(-1)!.day}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
