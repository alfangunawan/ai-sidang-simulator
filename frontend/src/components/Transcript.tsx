import type { Turn } from "../types.js";
import { renderInline } from "../lib/markdown.js";

// Shared bubble list for the live session and the history detail view, so the
// examiner's markup renders the same way in both.
export function Transcript({ turns }: { turns: Turn[] }) {
  return (
    <>
      {turns.map((t, i) => {
        const examiner = t.role === "examiner";
        return (
          <div key={i} className={`turn ${t.role}`}>
            <div className="turn-avatar" aria-hidden="true">{examiner ? "P" : "A"}</div>
            <div className={`bubble ${t.role}`}>
              <span className="who">{examiner ? "Penguji" : "Anda"}</span>
              <span className="msg">{renderInline(t.content)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
