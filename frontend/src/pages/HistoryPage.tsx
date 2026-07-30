import { useEffect, useMemo, useState } from "react";
import { listSessions, getTurns, deleteSession } from "../api.js";
import type { SessionSummary, Turn } from "../types.js";
import { Transcript } from "../components/Transcript.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { turnsToCsv, downloadCsv } from "../lib/csv.js";
import { formatDate, scoreTone } from "../lib/sessions.js";

function exportSession(s: SessionSummary, turns: Turn[]): void {
  const slug = s.created_at.slice(0, 16).replace(/[:T]/g, "-");
  downloadCsv(`sibiru-sesi-${slug}.csv`, turnsToCsv(turns));
}

// "Hari ini" / "Minggu ini" / "Lebih lama", from the session's own timestamp.
function bucketOf(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Lebih lama";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hari ini";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return days < 7 ? "Minggu ini" : "Lebih lama";
}

const BUCKETS = ["Hari ini", "Minggu ini", "Lebih lama"];

interface Props {
  onOpenResult: (id: string) => void;
  /** Session Beranda asked to open straight into, consumed once on load. */
  openId?: string | null;
  onOpened?: () => void;
}

export function HistoryPage({ onOpenResult, openId, onOpened }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [detailTurns, setDetailTurns] = useState<Turn[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "scored" | "unscored">("all");

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setErr((e as Error).message));
  }, []);

  // "Buka" on Beranda lands here; the row it points at only exists once the
  // list has loaded, so the request is held until then.
  useEffect(() => {
    if (!openId) return;
    const hit = sessions.find((s) => s.id === openId);
    if (!hit) return;
    onOpened?.();
    open(hit);
  }, [openId, sessions]);

  const stats = useMemo(() => {
    const scored = sessions.filter((s) => s.final_score != null);
    const avg = scored.length
      ? Math.round(scored.reduce((n, s) => n + (s.final_score ?? 0), 0) / scored.length)
      : null;
    const turns = sessions.reduce((n, s) => n + s.turn_count, 0);
    return { total: sessions.length, avg, scored: scored.length, turns };
  }, [sessions]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = sessions.filter((s) => {
      if (filter === "scored" && s.final_score == null) return false;
      if (filter === "unscored" && s.final_score != null) return false;
      if (!q) return true;
      return `${s.label ?? ""} ${formatDate(s.created_at)}`.toLowerCase().includes(q);
    });
    return BUCKETS.map((label) => ({
      label,
      items: visible.filter((s) => bucketOf(s.created_at) === label),
    })).filter((g) => g.items.length > 0);
  }, [sessions, query, filter]);

  async function open(s: SessionSummary) {
    setErr(null);
    setSelected(s);
    try {
      setDetailTurns(await getTurns(s.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function doDelete() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    try {
      await deleteSession(id);
      setSessions((list) => list.filter((s) => s.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        setDetailTurns([]);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (selected) {
    return (
      <div>
        <button className="sm" onClick={() => setSelected(null)} style={{ marginBottom: 18 }}>
          ← Semua sesi
        </button>

        <div className="page-head">
          <div>
            <h2>{selected.label ?? "Sesi latihan"}</h2>
            <p className="page-sub">
              {formatDate(selected.created_at)} · {selected.turn_count} percakapan
              {selected.final_score != null && ` · Skor ${selected.final_score}`}
            </p>
          </div>
          <div className="head-tools">
            <button onClick={() => exportSession(selected, detailTurns)}>Export CSV</button>
            {selected.status === "closed" && (
              <button className="primary" onClick={() => onOpenResult(selected.id)}>
                Lihat hasil sidang
              </button>
            )}
            <button className="danger" onClick={() => setConfirmId(selected.id)}>
              Hapus
            </button>
          </div>
        </div>

        <section className="card card-flush">
          <header className="convo-head">
            <div className="avatar-wrap">
              <div className="avatar" aria-hidden="true">P</div>
            </div>
            <div className="convo-who">
              <span className="convo-name">Transkrip Sidang</span>
              <span className="convo-role">Hanya baca</span>
            </div>
          </header>
          <div className="transcript-body readonly">
            {detailTurns.length === 0 ? (
              <div className="empty">
                <p>Tidak ada percakapan pada sesi ini.</p>
              </div>
            ) : (
              <Transcript turns={detailTurns} />
            )}
          </div>
        </section>

        {err && <p className="error">{err}</p>}
        <ConfirmModal
          open={confirmId !== null}
          title="Hapus sesi?"
          message="Seluruh percakapan sesi ini akan dihapus permanen."
          onConfirm={doDelete}
          onCancel={() => setConfirmId(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Riwayat Sidang</h2>
          <p className="page-sub">
            {sessions.length} sesi tersimpan. Buka transkrip untuk membaca ulang,
            atau lihat hasil penilaian penguji.
          </p>
        </div>
        <div className="head-tools">
          <div className="search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              placeholder="Cari sesi…"
              aria-label="Cari sesi"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            value={filter}
            aria-label="Saring sesi"
            style={{ margin: 0, width: "auto" }}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">Semua sesi</option>
            <option value="scored">Sudah dinilai</option>
            <option value="unscored">Belum dinilai</option>
          </select>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="empty-sub">Belum ada riwayat sesi.</p>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="eyebrow">Total sesi</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <div className="eyebrow">Rata-rata skor</div>
              <div className="stat-value">
                {stats.avg ?? "—"}
                {stats.avg != null && <small>/100</small>}
              </div>
            </div>
            <div className="stat-card">
              <div className="eyebrow">Sesi dinilai</div>
              <div className="stat-value">
                {stats.scored}
                <small>dari {stats.total}</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="eyebrow">Total percakapan</div>
              <div className="stat-value">{stats.turns}</div>
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="empty-sub">Tidak ada sesi yang cocok dengan filter.</p>
          ) : (
            groups.map((g) => (
              <div className="group" key={g.label}>
                <div className="group-head">
                  <span className="eyebrow">{g.label}</span>
                  <span className="count">{g.items.length} sesi</span>
                  <i />
                </div>
                <ul className="history-list">
                  {g.items.map((s) => (
                    <li key={s.id} className="history-row">
                      <div className={`score-badge ${scoreTone(s.final_score)}`}>
                        {s.final_score ?? "—"}
                      </div>
                      <div className="history-meta">
                        <span className="history-title">{s.label ?? "Sesi latihan"}</span>
                        <span className="history-count">
                          {formatDate(s.created_at)} · {s.turn_count} percakapan
                          {s.final_score != null && ` · Skor ${s.final_score}`}
                        </span>
                      </div>
                      <div className="history-actions">
                        <button className="sm" onClick={() => open(s)}>
                          Buka
                        </button>
                        {s.status === "closed" && (
                          <button className="sm primary" onClick={() => onOpenResult(s.id)}>
                            Lihat Hasil
                          </button>
                        )}
                        <button className="sm quiet-danger" onClick={() => setConfirmId(s.id)}>
                          Hapus
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      )}

      {err && <p className="error">{err}</p>}
      <ConfirmModal
        open={confirmId !== null}
        title="Hapus sesi?"
        message="Seluruh percakapan sesi ini akan dihapus permanen."
        onConfirm={doDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
