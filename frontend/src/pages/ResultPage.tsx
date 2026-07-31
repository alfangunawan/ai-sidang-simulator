import { ArrowLeft, Download, Minus, Plus } from "lucide-react";
import type { Assessment } from "../types.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const DIMENSIONS: { key: keyof Assessment["scores"]; label: string }[] = [
  { key: "penguasaan_materi", label: "Penguasaan Materi" },
  { key: "metodologi", label: "Metodologi" },
  { key: "kualitas_orisinalitas", label: "Kualitas & Orisinalitas" },
  { key: "argumentasi", label: "Argumentasi" },
];

function verdictClass(v: string): string {
  if (v === "Lulus") return "bg-success/15 text-success";
  if (v === "Tidak lulus") return "bg-destructive/10 text-destructive";
  return "bg-warning/15 text-warning";
}

/** Bar + number colour per band; the same thresholds the backend grades on. */
function tone(score: number): { bar: string; text: string } {
  if (score >= 75) return { bar: "bg-success", text: "text-success" };
  if (score >= 50) return { bar: "bg-primary", text: "text-primary" };
  return { bar: "bg-destructive", text: "text-destructive" };
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
  const pros = kind === "pros";
  const Icon = pros ? Plus : Minus;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full",
            pros ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
        </span>
        <CardTitle className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((it, i) => (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {it}
          </p>
        ))}
      </CardContent>
    </Card>
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
  const overall = tone(a.final_score);

  return (
    <div>
      <div className="no-print mb-4 flex gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft />
          Kembali
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPdf(printedOn)}>
          <Download />
          Export PDF
        </Button>
      </div>

      {/* Masthead replacement for the printed sheet — the app chrome is hidden. */}
      <div className="print-only mb-4 border-b pb-2">
        <strong>SiBiru · Penilaian Sidang Skripsi</strong>{" "}
        <span className="text-muted-foreground">Dicetak {printedOn}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Card className="shadow-md">
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
                    Hasil sidang
                  </span>
                  <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight">
                    Penilaian Penguji
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    verdictClass(a.verdict),
                  )}
                >
                  {a.verdict}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-6">
                <div className="font-serif text-6xl leading-none font-semibold">
                  {a.final_score}
                  <span className="ml-1 text-xl text-muted-foreground">/100</span>
                </div>
                <div
                  className={cn(
                    "flex size-14 items-center justify-center rounded-xl text-2xl font-bold",
                    overall.text,
                    "bg-muted",
                  )}
                >
                  {a.grade}
                </div>
                <div className="min-w-56 flex-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Skor sesi ini</span>
                    <span>Batas lulus 60</span>
                  </div>
                  <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <i
                      className={cn("absolute inset-y-0 left-0 rounded-full", overall.bar)}
                      style={{ width: `${a.final_score}%` }}
                    />
                    <i className="absolute inset-y-0 left-[60%] w-px bg-foreground/40" />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>0</span>
                    <span>60</span>
                    <span>100</span>
                  </div>
                </div>
              </div>

              {a.ringkasan && (
                <>
                  <Separator className="my-5" />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {a.ringkasan}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Penilaian per aspek</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {DIMENSIONS.map((d) => {
                const v = a.scores[d.key];
                const t = tone(v);
                return (
                  <div key={d.key} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 max-sm:grid-cols-[1fr_2.5rem]">
                    <span className="text-sm font-medium max-sm:col-span-2">{d.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <i
                        className={cn("block h-full rounded-full", t.bar)}
                        style={{ width: `${v}%` }}
                      />
                    </span>
                    <span className={cn("text-right text-sm font-bold", t.text)}>{v}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {a.saran.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Saran perbaikan</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Urut berdasarkan dampak terbesar terhadap nilai sidang.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {a.saran.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs font-bold text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <ProCon kind="pros" title="Kelebihan" items={a.kelebihan} />
          <ProCon kind="cons" title="Kekurangan" items={a.kekurangan} />
          <Button className="no-print" onClick={onNewSession}>
            Sesi Baru
          </Button>
        </aside>
      </div>
    </div>
  );
}
