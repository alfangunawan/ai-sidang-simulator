import { useEffect, useRef, useState } from "react";
import { Check, Mic, X } from "lucide-react";
import { DEFAULT_PERSONA, heatOf, heatLabel, TYPE_LABELS } from "../personas.js";
import type { Persona } from "../personas.js";
import { ALL_PHASES, PHASE_CHOICES } from "../phases.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MicState = "idle" | "ok" | "fail";

const RULES = [
  "Penguji bertanya langsung dari naskah PDF Anda — bab, tabel, dan angka yang benar-benar ada di sana.",
  "Jawab dengan suara lewat tombol Rekam, atau ketik bila situasinya tidak memungkinkan.",
  "Jawaban dangkal akan dikejar sampai Anda menyebut data spesifik; boleh berhenti sejenak untuk berpikir.",
  "Sidang ditutup saat penguji merasa cukup atau saat Anda menekan Akhiri Sidang — penilaian muncul setelahnya.",
];

const PRIVACY = [
  "Rekaman suara hanya dipakai untuk menyusun transkrip sesi ini.",
  "Naskah dan transkrip tersimpan di server lokal Anda, tidak dibagikan ke pihak lain.",
  "Anda bisa menutup sesi kapan saja lewat tombol Akhiri Sidang.",
];

const MIC_BARS = Array.from({ length: 24 }, (_, i) => ({
  height: 8 + ((i * 5) % 20),
  delay: (i * 0.05).toFixed(2),
  duration: (0.6 + (i % 5) * 0.12).toFixed(2),
}));

const TEST_MS = 4000;
// Room tone alone sits well under this; a voice at normal volume clears it.
const HEARD = 0.02;

interface Props {
  step: 1 | 2 | 3;
  initial: Persona;
  personas: Persona[];
  mic: MicState;
  starting: boolean;
  onStep: (step: 0 | 1 | 2 | 3) => void;
  onMic: (state: MicState) => void;
  onStart: (persona: Persona, phases: string[]) => void;
}

export function SetupModal({
  step,
  initial,
  personas,
  mic,
  starting,
  onStep,
  onMic,
  onStart,
}: Props) {
  const [pending, setPending] = useState<Persona>(initial ?? DEFAULT_PERSONA);
  // Semua bab menyala di awal: sidang penuh adalah yang normal, mematikan bab
  // adalah keputusan sadar mahasiswa yang ingin melatih satu bagian saja.
  const [phases, setPhases] = useState<string[]>(ALL_PHASES);
  // Opened straight at the last step (the Kesiapan card's mic test) the dialog is
  // only a mic test: backing out closes it instead of dropping the student into an
  // examiner picker they never asked for. The modal is unmounted when closed, so
  // its first step is its entry point.
  const [micOnly] = useState(step === 3);
  const [testing, setTesting] = useState(false);
  const audio = useAudioLevel(testing);
  const peak = useRef(0);

  // A mic test is four seconds of listening: if nothing ever crosses the floor,
  // the student is told now rather than after the examiner's first question.
  useEffect(() => {
    if (!testing) return;
    peak.current = 0;
    const poll = setInterval(() => {
      peak.current = Math.max(peak.current, audio.getLevel());
    }, 100);
    const done = setTimeout(() => {
      setTesting(false);
      onMic(peak.current > HEARD ? "ok" : "fail");
    }, TEST_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(done);
    };
  }, [testing]);

  const micNote = testing
    ? "Bicara sekarang…"
    : mic === "ok"
      ? "✓ Mikrofon terdengar jelas"
      : mic === "fail"
        ? "Tidak terdengar — periksa izin mikrofon browser."
        : audio.supported
          ? "Belum diuji"
          : "Perangkat ini tidak mendukung perekaman.";

  return (
    <Dialog open onOpenChange={(next) => !next && onStep(0)}>
      {/* `flex flex-col`, bukan grid bawaan DialogContent: dengan grid, baris isi
          tidak selalu mengalah pada `max-h` (Safari/iOS tidak menyusutkannya),
          jadi enam kartu penguji mendorong baris tombol ke luar kotak — dan
          `overflow-hidden` memotongnya. Lanjut dan Batal hilang sama sekali.
          Kolom flex + `min-h-0` di badan yang menggulir memberi hasil yang sama
          di semua browser: hanya badan yang menyusut, header dan tombol tetap. */}
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <div className="flex shrink-0 items-start gap-4 border-b px-6 py-5">
          <div className="flex-1">
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              {micOnly ? "Kesiapan" : `Langkah ${step} dari 3`}
            </span>
            <DialogTitle className="mt-1 font-serif text-xl">
              {step === 1
                ? "Pilih dosen penguji Anda"
                : step === 2
                  ? "Pilih bab yang diuji"
                  : "Cek kesiapan Anda"}
            </DialogTitle>
          </div>
          {!micOnly && (
            <div className="mt-2 flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i
                  key={n}
                  className={cn(
                    "h-1.5 w-6 rounded-full",
                    n <= step ? "bg-primary" : "bg-border",
                  )}
                />
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Tutup"
            onClick={() => onStep(0)}
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Tiap penguji punya gaya menekan dan bidang yang dikejar sendiri. Pilih
                satu — ia yang akan menemani Anda sepanjang sidang.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {personas.map((p) => {
                  const on = p.key === pending.key;
                  const heat = heatOf(p);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPending(p)}
                      className={cn(
                        "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                        on && "border-primary bg-primary/5 ring-2 ring-primary/20",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: p.color }}
                        >
                          {p.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {p.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.role}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                      </div>
                      <span className="mt-3 block text-xs leading-relaxed text-muted-foreground">
                        {p.trait}
                      </span>
                      <div className="mt-3 flex items-center gap-2 border-t pt-3">
                        <span className="flex gap-0.5" aria-hidden="true">
                          {[1, 2, 3, 4].map((n) => (
                            <i
                              key={n}
                              className={cn(
                                "h-1.5 w-3 rounded-full",
                                n <= heat ? "bg-warning" : "bg-border",
                              )}
                            />
                          ))}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {heatLabel(p)}
                        </span>
                        <span className="ml-auto truncate text-[11px] text-muted-foreground">
                          {TYPE_LABELS[p.type] ?? p.type}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Default: semua bab diuji. Matikan bab yang belum ingin Anda hadapi — penguji
                tidak akan menyentuhnya, dan sidang jadi lebih pendek. Pembukaan dan penutup
                selalu ada.
              </p>
              <div className="flex flex-col gap-2">
                {PHASE_CHOICES.map((c) => {
                  const on = phases.includes(c.phase);
                  return (
                    <button
                      key={c.phase}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() =>
                        setPhases((prev) =>
                          on
                            ? prev.filter((p) => p !== c.phase)
                            : ALL_PHASES.filter((p) => p === c.phase || prev.includes(p)),
                        )
                      }
                      className={cn(
                        "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40",
                        on ? "border-primary bg-primary/5" : "opacity-60",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {c.bab} — {c.phase}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {c.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {phases.length === 0 && (
                <p className="mt-3 text-xs font-semibold text-destructive">
                  Pilih minimal satu bab untuk diuji.
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <ol className="flex flex-col gap-3">
                {RULES.map((text, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs font-bold text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-muted-foreground">{text}</span>
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border bg-muted/40 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      Tes mikrofon{" "}
                      <span className="font-normal text-muted-foreground">
                        — opsional, 4 detik
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Bicara seperti biasa untuk memastikan suara Anda terdengar jelas
                      sebelum sidang dimulai.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={testing ? "destructive" : "outline"}
                    disabled={testing || !audio.supported}
                    onClick={() => setTesting(true)}
                  >
                    <Mic />
                    {testing ? "Merekam…" : mic === "idle" ? "Tes Mic" : "Ulangi tes"}
                  </Button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden="true">
                    {MIC_BARS.map((b, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-1 rounded-full bg-border",
                          testing && "animate-pulse bg-primary",
                        )}
                        style={{
                          height: `${b.height}px`,
                          animationDelay: `${b.delay}s`,
                          animationDuration: `${b.duration}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      testing
                        ? "text-primary"
                        : mic === "ok"
                          ? "text-success"
                          : mic === "fail"
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                  >
                    {micNote}
                  </span>
                </div>
              </div>

              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {PRIVACY.map((text, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">·</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t bg-muted/30 px-6 py-4">
          <span className="flex-1 truncate text-xs text-muted-foreground">
            {micOnly
              ? "Tes ini tidak memulai sidang."
              : step === 1
                ? "Penguji terkunci sampai sidang selesai."
                : step === 2
                  ? `${phases.length} dari ${ALL_PHASES.length} bab diuji`
                  : `Penguji: ${pending.name} · ${phases.length} bab`}
          </span>
          {micOnly ? (
            <Button onClick={() => onStep(0)}>Tutup</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onStep(step === 1 ? 0 : ((step - 1) as 1 | 2))}>
                {step === 1 ? "Batal" : "Kembali"}
              </Button>
              <Button
                disabled={starting || (step === 2 && phases.length === 0)}
                onClick={() =>
                  step === 3 ? onStart(pending, phases) : onStep((step + 1) as 2 | 3)
                }
              >
                {step < 3 ? "Lanjut" : starting ? "Menyiapkan…" : "Mulai Sidang"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
