import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { getQuestions, putQuestions } from "../../adminApi.js";
import { Alert, Loading, PageHead, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

export function Questions({ onCount }: { onCount?: (n: number) => void }) {
  const [phases, setPhases] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function load() {
    return getQuestions()
      .then(({ phases, bank }) => {
        setPhases(phases);
        setDraft(Object.fromEntries(phases.map((p) => [p, (bank[p] ?? []).join("\n")])));
        onCount?.(phases.length);
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message));
  }
  useEffect(() => void load(), []);

  async function save(phase: string) {
    setErr(null);
    try {
      // Satu pertanyaan per baris; baris kosong dibuang di server juga.
      const texts = lines(draft[phase] ?? "");
      await putQuestions(phase, texts);
      // Tulis balik hasil yang sudah dinormalisasi supaya textarea tidak
      // menyimpang dari yang benar-benar tersimpan di server.
      setDraft((d) => ({ ...d, [phase]: texts.join("\n") }));
      setSaved(phase);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Fase yang dikosongkan di DB dilayani ulang dari konstanta bawaan
  // (backend/src/repos/questions.ts), jadi "kembalikan bawaan" = simpan kosong
  // lalu baca ulang apa yang server pilihkan.
  async function reset(phase: string) {
    setErr(null);
    try {
      await putQuestions(phase, []);
      await load();
      setSaved(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && !phases) return <Alert>{err}</Alert>;
  if (!phases) return <Loading />;

  const phase = phases[active];
  const text = draft[phase] ?? "";

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title="Bank pertanyaan"
        sub="Satu pertanyaan per baris. Fase yang dikosongkan kembali memakai daftar bawaan."
      />

      {err && <Alert>{err}</Alert>}

      <div className="grid items-start gap-3.5 lg:grid-cols-[262px_minmax(0,1fr)]">
        <Panel className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
          {phases.map((p, i) => {
            const on = i === active;
            return (
              <button
                key={p}
                onClick={() => setActive(i)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left whitespace-nowrap transition-colors lg:whitespace-normal",
                  on ? "bg-primary/10" : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-[22px] flex-none items-center justify-center rounded-[7px] text-[11px] font-extrabold tabular-nums",
                    on ? "bg-card text-primary" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "text-[13px] leading-snug tracking-tight",
                    on ? "font-bold text-primary" : "font-medium text-foreground/70",
                  )}
                >
                  {p}
                </span>
                <span
                  aria-hidden="true"
                  className="ml-auto pl-2 text-[11.5px] font-bold text-muted-foreground/70 tabular-nums"
                >
                  {lines(draft[p] ?? "").length}
                </span>
              </button>
            );
          })}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b px-[22px] py-4">
            <div>
              <h2 className="text-[15.5px] font-bold tracking-tight">{phase}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {lines(text).length} pertanyaan aktif
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 rounded-[9px] text-xs"
              onClick={() => reset(phase)}
            >
              Kembalikan bawaan
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-[9px] text-xs"
              aria-label={`Simpan ${phase}`}
              onClick={() => save(phase)}
            >
              Simpan fase
            </Button>
          </div>
          <Textarea
            aria-label={phase}
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setDraft((d) => ({ ...d, [phase]: e.target.value }));
              setSaved((s) => (s === phase ? null : s));
            }}
            className="min-h-[400px] rounded-none border-0 px-[22px] py-5 text-[13.5px] leading-loose shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2.5 border-t bg-muted/40 px-[22px] py-3">
            <CircleAlert className="size-3.5 flex-none text-muted-foreground/70" />
            <span className="text-[11.5px] text-muted-foreground">
              Penguji memilih acak dari daftar ini, lalu menyusul dengan probing
              sesuai jawaban mahasiswa.
            </span>
            {saved === phase && (
              <span className="ml-auto text-[11.5px] font-bold text-success">Tersimpan.</span>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
