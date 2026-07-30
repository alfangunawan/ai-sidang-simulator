import type { Turn } from "../types.js";
import type { Persona } from "../personas.js";
import { renderInline } from "../lib/markdown.js";
import { cn } from "@/lib/utils";

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
          <div
            key={i}
            className={cn("flex items-start gap-3", !examiner && "flex-row-reverse")}
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                examiner
                  ? "bg-foreground text-background"
                  : "bg-primary text-primary-foreground",
              )}
              style={style}
              aria-hidden="true"
            >
              {examiner ? (persona?.initials ?? "P") : "A"}
            </div>
            <div
              className={cn(
                "bubble max-w-[min(46rem,80%)] rounded-xl px-4 py-3 text-sm leading-relaxed",
                examiner
                  ? "rounded-tl-sm border bg-card text-card-foreground shadow-xs"
                  : "rounded-tr-sm bg-primary text-primary-foreground",
              )}
            >
              <span
                className={cn(
                  "who mb-1 block text-[11px] font-bold tracking-wide uppercase",
                  examiner ? "text-muted-foreground" : "text-primary-foreground/70",
                )}
              >
                {examiner ? "Penguji" : "Anda"}
              </span>
              <span className="msg block [&_strong]:font-semibold">
                {renderInline(t.content)}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
