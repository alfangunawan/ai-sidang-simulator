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

const EMPTY: CollabState = { hosting: null, joined: null };

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
    <section id="kolaborasi" className="card card-lg collab">
      <div className="section-head">
        <div>
          <h3>Kolaborasi</h3>
          <p>
            Bagikan key AI/Suara/Diktasi Anda dengan anggota tim, atau gabung
            ke kolaborasi lewat kode undangan.
          </p>
        </div>
      </div>

      {!hosting && (
        <div className="field">
          <button onClick={onBecomeHost}>Jadi host</button>
          <p className="hint">
            Jadi host untuk membagikan key Anda ke anggota tim lewat kode undangan.
          </p>
        </div>
      )}

      {hosting && (
        <>
          <div className="field">
            <label>Kode undangan Anda</label>
            <div className="inline-row">
              <code className="collab-code">{hosting.invite_code}</code>
              <button
                className="sm"
                onClick={() => navigator.clipboard?.writeText(hosting.invite_code)}
              >
                Salin
              </button>
              <button className="sm" onClick={onRegenerate}>
                Regenerate
              </button>
            </div>
          </div>

          <div className="field">
            <label>Bagikan ke anggota</label>
            <div className="share-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={!!hosting.shares.share_ai}
                  onChange={() => onToggleShare("share_ai")}
                />
                <span>AI</span>
                <span className="hint">jawaban penguji</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!hosting.shares.share_tts}
                  onChange={() => onToggleShare("share_tts")}
                />
                <span>Suara (TTS)</span>
                <span className="hint">text-to-speech</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!hosting.shares.share_stt}
                  onChange={() => onToggleShare("share_stt")}
                />
                <span>Diktasi (STT)</span>
                <span className="hint">speech-to-text</span>
              </label>
            </div>
          </div>

          <div className="field">
            <label>Anggota ({hosting.members.length})</label>
            {hosting.members.length === 0 ? (
              <p className="hint" style={{ marginTop: 0 }}>
                Belum ada anggota yang gabung.
              </p>
            ) : (
              <ul className="member-list">
                {hosting.members.map((m) => (
                  <li key={m.member_user_id} className="member-row">
                    <span>{m.username}</span>
                    <span className="hint">Gabung {formatJoined(m.joined_at)}</span>
                    <button className="sm danger" onClick={() => onKick(m.member_user_id)}>
                      Keluarkan
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">
            <label>Pemakaian</label>
            <p className="hint" style={{ marginTop: 0 }}>
              Total panggilan: {hosting.usage.total.calls}
            </p>
            {hosting.usage.by_member.length > 0 && (
              <ul className="member-list">
                {hosting.usage.by_member.map((m) => (
                  <li key={m.member_user_id} className="member-row">
                    <span>{m.username}</span>
                    <span>{m.totals.calls} panggilan</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="danger" onClick={onDisband}>
            Bubarkan
          </button>
        </>
      )}

      {!joined && (
        <div className="field">
          <label htmlFor="collab-code">Kode undangan</label>
          <div className="inline-row">
            <input
              id="collab-code"
              value={code}
              placeholder="tempel kode undangan host"
              onChange={(e) => setCode(e.target.value)}
            />
            <button onClick={onJoin} disabled={!code.trim()}>
              Gabung
            </button>
          </div>
        </div>
      )}

      {joined && (
        <div className="field">
          <p>
            Tergabung dengan: <strong>{joined.host_username}</strong>
          </p>
          <div className="inline-row">
            {!!joined.shares.share_ai && <span className="badge">AI</span>}
            {!!joined.shares.share_tts && <span className="badge">TTS</span>}
            {!!joined.shares.share_stt && <span className="badge">STT</span>}
          </div>
          <button className="sm danger" onClick={onLeave}>
            Keluar
          </button>
        </div>
      )}

      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
    </section>
  );
}
