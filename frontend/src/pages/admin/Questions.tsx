import { useEffect, useState } from "react";
import { getQuestions, putQuestions } from "../../adminApi.js";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Questions() {
  const [phases, setPhases] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getQuestions()
      .then(({ phases, bank }) => {
        setPhases(phases);
        setDraft(Object.fromEntries(phases.map((p) => [p, (bank[p] ?? []).join("\n")])));
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function save(phase: string) {
    setErr(null);
    try {
      // Satu pertanyaan per baris; baris kosong dibuang di server juga.
      await putQuestions(
        phase,
        (draft[phase] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      );
      setSaved(phase);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (err && phases.length === 0) {
    return <p role="alert" className="text-sm text-destructive">{err}</p>;
  }

  return (
    <div className="space-y-6">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <p className="text-sm text-muted-foreground">
        Satu pertanyaan per baris. Fase yang dikosongkan kembali memakai daftar
        bawaan, jadi penguji tidak pernah kehabisan bahan.
      </p>
      {phases.map((p) => (
        <div key={p} className="space-y-2">
          <Label htmlFor={`phase-${p}`}>{p}</Label>
          <Textarea
            id={`phase-${p}`}
            rows={6}
            value={draft[p] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => save(p)}>
              Simpan {p}
            </Button>
            {saved === p && <span className="text-xs text-muted-foreground">Tersimpan.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
