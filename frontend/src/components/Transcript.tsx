import type { Turn } from "../types.js";
import type { Persona } from "../personas.js";
import { renderInline } from "../lib/markdown.js";

// Shared bubble list for the live session and the history detail view, so the
// examiner's markup renders the same way in both. A live session passes the
// persona so the examiner wears its own initials and colour; archived
// transcripts keep the neutral "P" — which persona ran them is not recorded.
export function Transcript({ turns, persona }: { turns: Turn[]; persona?: Persona }) {
  return (
    <>
      {turns.map((t, i) => {
        const examiner = t.role === "examiner";
        const style =
          examiner && persona ? { background: persona.color, color: "#fff" } : undefined;
        return (
          <div key={i} className={`turn ${t.role}`}>
            <div className="turn-avatar" style={style} aria-hidden="true">
              {examiner ? (persona?.initials ?? "P") : "A"}
            </div>
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
