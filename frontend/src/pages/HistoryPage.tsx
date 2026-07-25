import { useEffect, useState } from "react";
import { listSessions, getTurns, deleteSession } from "../api.js";
import type { SessionSummary, Turn } from "../types.js";
import { Transcript } from "../components/Transcript.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { turnsToCsv, downloadCsv } from "../lib/csv.js";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportSession(s: SessionSummary, turns: Turn[]): void {
  const slug = s.created_at.slice(0, 16).replace(/[:T]/g, "-");
  downloadCsv(`sibiru-sesi-${slug}.csv`, turnsToCsv(turns));
}

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [detailTurns, setDetailTurns] = useState<Turn[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setErr((e as Error).message));
  }, []);

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
        <div className="session-head">
          <h2>Sesi — {formatDate(selected.created_at)}</h2>
          <button onClick={() => setSelected(null)}>← Kembali</button>
        </div>

        <section className="transcript">
          <header className="transcript-head">
            <span className="transcript-title">Transkrip Sidang</span>
            <div className="head-actions">
              <button onClick={() => exportSession(selected, detailTurns)}>
                Export CSV
              </button>
              <button className="ghost" onClick={() => setConfirmId(selected.id)}>
                Hapus
              </button>
            </div>
          </header>
          <div className="transcript-body">
            <Transcript turns={detailTurns} />
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
      <h2>Riwayat Sidang</h2>
      {sessions.length === 0 ? (
        <p className="empty-sub">Belum ada riwayat sesi.</p>
      ) : (
        <ul className="history-list">
          {sessions.map((s) => (
            <li key={s.id} className="history-row">
              <div className="history-meta">
                <span className="history-title">Sesi — {formatDate(s.created_at)}</span>
                <span className="history-count">{s.turn_count} percakapan</span>
              </div>
              <div className="history-actions">
                <button className="primary" onClick={() => open(s)}>
                  Buka
                </button>
                <button className="ghost" onClick={() => setConfirmId(s.id)}>
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
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
