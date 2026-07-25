import type { Turn } from "../types.js";
import { renderInline } from "../lib/markdown.js";

// Shared bubble list for the live session and the history detail view, so the
// examiner's markup renders the same way in both.
export function Transcript({ turns }: { turns: Turn[] }) {
  return (
    <>
      {turns.map((t, i) => (
        <div key={i} className={`bubble ${t.role}`}>
          <span className="who">{t.role === "examiner" ? "Penguji" : "Anda"}</span>
          <span className="msg">{renderInline(t.content)}</span>
        </div>
      ))}
    </>
  );
}
