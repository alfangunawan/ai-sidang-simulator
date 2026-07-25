import type { Assessment } from "../types.js";

const DIMENSIONS: { key: keyof Assessment["scores"]; label: string }[] = [
  { key: "penguasaan_materi", label: "Penguasaan Materi" },
  { key: "metodologi", label: "Metodologi" },
  { key: "kualitas_orisinalitas", label: "Kualitas & Orisinalitas" },
  { key: "argumentasi", label: "Argumentasi" },
];

function verdictClass(v: string): string {
  if (v === "Lulus") return "pass";
  if (v === "Tidak lulus") return "fail";
  return "revise";
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="result-list">
      <h3>{title}</h3>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

interface Props {
  assessment: Assessment;
  onNewSession: () => void;
  onBack: () => void;
}

export function ResultPage({ assessment, onNewSession, onBack }: Props) {
  const a = assessment;
  return (
    <div className="result-page">
      <div className="session-head">
        <h2>Hasil Sidang</h2>
        <button onClick={onBack}>← Kembali</button>
      </div>

      <div className="result-score">
        <div className="score-big">
          {a.final_score}
          <span className="score-max">/100</span>
        </div>
        <div className="score-grade">{a.grade}</div>
        <span className={`verdict-badge ${verdictClass(a.verdict)}`}>{a.verdict}</span>
      </div>

      {a.ringkasan && <p className="result-summary">{a.ringkasan}</p>}

      <div className="result-dims">
        {DIMENSIONS.map((d) => (
          <div key={d.key} className="dim-row">
            <span className="dim-label">{d.label}</span>
            <span className="dim-bar">
              <i style={{ width: `${a.scores[d.key]}%` }} />
            </span>
            <span className="dim-val">{a.scores[d.key]}</span>
          </div>
        ))}
      </div>

      <div className="result-lists">
        <ResultList title="Kelebihan" items={a.kelebihan} />
        <ResultList title="Kekurangan" items={a.kekurangan} />
        <ResultList title="Saran Perbaikan" items={a.saran} />
      </div>

      <div className="composer-actions">
        <button className="primary" onClick={onNewSession}>
          Sesi Baru
        </button>
      </div>
    </div>
  );
}
