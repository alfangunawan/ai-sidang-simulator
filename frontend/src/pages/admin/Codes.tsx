import { useEffect, useState } from "react";
import { listCodes, kickMember } from "../../adminApi.js";
import type { AdminCodeRow } from "../../types.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Codes() {
  const [codes, setCodes] = useState<AdminCodeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reload() {
    listCodes()
      .then((rows) => {
        setCodes(rows);
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message));
  }
  useEffect(reload, []);

  if (err && !codes) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!codes) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  async function kick(hostId: number, memberId: number) {
    try {
      await kickMember(hostId, memberId);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada kode akses.</p>
      ) : (
        codes.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardDescription>Host</CardDescription>
              <CardTitle className="text-base">{c.host_username}</CardTitle>
              <p className="font-mono text-sm">{c.invite_code}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {c.shares.share_ai === 1 && <Badge variant="secondary">AI</Badge>}
                {c.shares.share_tts === 1 && <Badge variant="secondary">TTS</Badge>}
                {c.shares.share_stt === 1 && <Badge variant="secondary">STT</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {c.calls} panggilan · ${c.cost_usd.toFixed(2)} (router saja)
              </p>
              {c.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada yang memakai kode ini.</p>
              ) : (
                <ul className="space-y-1">
                  {c.members.map((m) => (
                    <li key={m.member_user_id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.username}</span>
                      <span className="text-xs text-muted-foreground">
                        sejak {m.joined_at.slice(0, 10)}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        className="ml-auto"
                        onClick={() => kick(c.host_user_id, m.member_user_id)}
                      >
                        Tendang {m.username}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
