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

function tone(score: number): string {
  if (score >= 75) return "good";
  if (score >= 50) return "";
  return "low";
}

function ProCon({
  kind,
  title,
  items,
}: {
  kind: "pros" | "cons";
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className={`card ${kind}`}>
      <div className="pro-con-head">
        <i />
        <span className="eyebrow">{title}</span>
      </div>
      <div className="pro-con-list">
        {items.map((it, i) => (
          <p key={i}>{it}</p>
        ))}
      </div>
    </div>
  );
}

interface Props {
  assessment: Assessment;
  onNewSession: () => void;
  onBack: () => void;
}

// Browsers name the saved PDF after the document title, so it is swapped for
// the duration of the print job and put back once the dialog closes.
function exportPdf(printedOn: string): void {
  const previous = document.title;
  document.title = `Penilaian Sidang — ${printedOn}`;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

export function ResultPage({ assessment, onNewSession, onBack }: Props) {
  const a = assessment;
  const printedOn = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="result-page">
      <div className="result-actions no-print">
        <button className="sm" onClick={onBack}>
          ← Kembali
        </button>
        <button className="sm" onClick={() => exportPdf(printedOn)}>
          ⬇ Export PDF
        </button>
      </div>

      {/* Masthead replacement for the printed sheet — the app chrome is hidden. */}
      <div className="print-only print-head">
        <strong>SiBiru · Penilaian Sidang Skripsi</strong>
        <span>Dicetak {printedOn}</span>
      </div>

      <div className="split split-wide">
        <div className="stack-lg">
          <section className="card card-lg" style={{ boxShadow: "var(--sh-deep)" }}>
            <div className="result-hero">
              <div>
                <span className="eyebrow">Hasil sidang</span>
                <h2>Penilaian Penguji</h2>
              </div>
              <span className={`verdict-badge ${verdictClass(a.verdict)}`}>{a.verdict}</span>
            </div>

            <div className="result-score">
              <div className="score-big">
                {a.final_score}
                <span className="score-max">/100</span>
              </div>
              <div className={`score-grade ${tone(a.final_score)}`}>{a.grade}</div>
              <div className="score-meter">
                <div className="score-meter-top">
                  <span>Skor sesi ini</span>
                  <span>Batas lulus 60</span>
                </div>
                <div className="meter">
                  <i style={{ width: `${a.final_score}%` }} />
                </div>
                <div className="score-meter-bot">
                  <span>0</span>
                  <span>60</span>
                  <span>100</span>
                </div>
              </div>
            </div>

            {a.ringkasan && <p className="result-summary">{a.ringkasan}</p>}
          </section>

          <section className="card card-lg">
            <h3>Penilaian per aspek</h3>
            <div className="result-dims">
              {DIMENSIONS.map((d) => {
                const v = a.scores[d.key];
                return (
                  <div key={d.key} className={`dim-row ${tone(v)}`}>
                    <span className="dim-label">{d.label}</span>
                    <span className="dim-bar">
                      <i style={{ width: `${v}%` }} />
                    </span>
                    <span className="dim-val">{v}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {a.saran.length > 0 && (
            <section className="card card-lg">
              <h3>Saran perbaikan</h3>
              <p className="card-note">Urut berdasarkan dampak terbesar terhadap nilai sidang.</p>
              <div className="advice-list">
                {a.saran.map((s, i) => (
                  <div className="advice" key={i}>
                    <span className="tag">{String(i + 1).padStart(2, "0")}</span>
                    <p>{s}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="stack">
          <ProCon kind="pros" title="Kelebihan" items={a.kelebihan} />
          <ProCon kind="cons" title="Kekurangan" items={a.kekurangan} />
          <button className="primary" onClick={onNewSession}>
            Sesi Baru
          </button>
        </aside>
      </div>
    </div>
  );
}
