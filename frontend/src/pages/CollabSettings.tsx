import { useEffect, useState } from "react";
import {
  getCollab,
  becomeHost,
  disbandCollab,
  setCollabShares,
  regenerateCollabCode,
  joinCollab,
  leaveCollab,
  kickMember,
} from "../api.js";
import type { CollabState, CollabShares } from "../types.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const EMPTY: CollabState = { hosting: null, joined: null };

const SHARES: { key: keyof CollabShares; label: string; hint: string }[] = [
  { key: "share_ai", label: "AI", hint: "jawaban penguji" },
  { key: "share_tts", label: "Suara (TTS)", hint: "text-to-speech" },
  { key: "share_stt", label: "Diktasi (STT)", hint: "speech-to-text" },
];

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID");
}

// Every host mutation's response already carries the fresh `hosting` slice, and
// join/leave/disband only ever touch one side of the state — so each handler
// merges its own response instead of firing a second GET just to "refresh".
export function CollabSettings() {
  const [state, setState] = useState<CollabState | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCollab()
      .then(setState)
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function run<T>(fn: () => Promise<T>, apply: (result: T) => void) {
    setErr(null);
    try {
      apply(await fn());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const patchHosting = (hosting: CollabState["hosting"]) =>
    setState((s) => ({ ...(s ?? EMPTY), hosting }));

  const onBecomeHost = () => run(becomeHost, (r) => patchHosting(r.hosting));
  const onRegenerate = () => run(regenerateCollabCode, (r) => patchHosting(r.hosting));
  const onKick = (memberUserId: number) =>
    run(() => kickMember(memberUserId), (r) => patchHosting(r.hosting));
  const onDisband = () => run(disbandCollab, () => patchHosting(null));

  const onJoin = () =>
    run(
      () => joinCollab(code),
      (r) => {
        setState((s) => ({ ...(s ?? EMPTY), joined: r.joined }));
        setCode("");
      },
    );
  const onLeave = () =>
    run(leaveCollab, () => setState((s) => ({ ...(s ?? EMPTY), joined: null })));

  function onToggleShare(key: keyof CollabShares) {
    const shares = state?.hosting?.shares;
    if (!shares) return;
    const next = { ...shares, [key]: shares[key] ? 0 : 1 };
    run(
      () =>
        setCollabShares({
          share_ai: !!next.share_ai,
          share_tts: !!next.share_tts,
          share_stt: !!next.share_stt,
        }),
      (r) => patchHosting(r.hosting),
    );
  }

  if (!state) return null; // still loading

  const { hosting, joined } = state;

  return (
    <Card id="kolaborasi" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Kolaborasi</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bagikan key AI/Suara/Diktasi Anda dengan anggota tim, atau gabung ke
          kolaborasi lewat kode undangan.
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!hosting && (
          <div>
            <Button variant="outline" onClick={onBecomeHost}>
              Jadi host
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Jadi host untuk membagikan key Anda ke anggota tim lewat kode undangan.
            </p>
          </div>
        )}

        {hosting && (
          <>
            <div>
              <div className="mb-2 text-sm font-medium">Kode undangan Anda</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
                  {hosting.invite_code}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard?.writeText(hosting.invite_code)}
                >
                  Salin
                </Button>
                <Button variant="outline" size="sm" onClick={onRegenerate}>
                  Regenerate
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-medium">Bagikan ke anggota</div>
              <div className="flex flex-col gap-3">
                {SHARES.map((s) => (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`share-${s.key}`}
                      checked={!!hosting.shares[s.key]}
                      onCheckedChange={() => onToggleShare(s.key)}
                    />
                    <Label htmlFor={`share-${s.key}`} className="font-normal">
                      {s.label}
                    </Label>
                    <span className="text-xs text-muted-foreground">{s.hint}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">
                Anggota ({hosting.members.length})
              </div>
              {hosting.members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada anggota yang gabung.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {hosting.members.map((m) => (
                    <li key={m.member_user_id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-sm">{m.username}</span>
                      <span className="text-xs text-muted-foreground">
                        Gabung {formatJoined(m.joined_at)}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => onKick(m.member_user_id)}
                      >
                        Keluarkan
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Pemakaian</div>
              <p className="text-xs text-muted-foreground">
                Total panggilan: {hosting.usage.total.calls}
              </p>
              {hosting.usage.by_member.length > 0 && (
                <ul className="mt-2 divide-y rounded-lg border">
                  {hosting.usage.by_member.map((m) => (
                    <li
                      key={m.member_user_id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>{m.username}</span>
                      <span className="text-muted-foreground">
                        {m.totals.calls} panggilan
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Button variant="outline" className="text-destructive hover:text-destructive"
                onClick={onDisband}>
                Bubarkan
              </Button>
            </div>

            <Separator />
          </>
        )}

        {!joined && (
          <div>
            <Label htmlFor="collab-code">Kode undangan</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="collab-code"
                value={code}
                placeholder="tempel kode undangan host"
                onChange={(e) => setCode(e.target.value)}
              />
              <Button onClick={onJoin} disabled={!code.trim()}>
                Gabung
              </Button>
            </div>
          </div>
        )}

        {joined && (
          <div>
            <p className="text-sm">
              Tergabung dengan: <strong>{joined.host_username}</strong>
            </p>
            <div className="mt-2 flex gap-1.5">
              {!!joined.shares.share_ai && <Badge variant="secondary">AI</Badge>}
              {!!joined.shares.share_tts && <Badge variant="secondary">TTS</Badge>}
              {!!joined.shares.share_stt && <Badge variant="secondary">STT</Badge>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-destructive hover:text-destructive"
              onClick={onLeave}
            >
              Keluar
            </Button>
          </div>
        )}

        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
