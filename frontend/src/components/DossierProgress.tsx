import { useEffect, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";

const nf = new Intl.NumberFormat("id-ID");

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Step({
  state,
  label,
  note,
}: {
  state: "done" | "active" | "todo";
  label: string;
  note?: string;
}) {
  const Icon = state === "done" ? Check : state === "active" ? Loader2 : Circle;
  return (
    <li className="flex items-center gap-2">
      <Icon
        className={
          state === "done"
            ? "size-4 shrink-0 text-success"
            : state === "active"
              ? "size-4 shrink-0 animate-spin text-primary"
              : "size-4 shrink-0 text-muted-foreground/40"
        }
        aria-hidden="true"
      />
      <span className={state === "todo" ? "text-muted-foreground/60" : undefined}>{label}</span>
      {note && <span className="text-xs text-muted-foreground tabular-nums">· {note}</span>}
    </li>
  );
}

/**
 * Penanda tahapan selama dossier dibangun. Menunggu satu menit di depan teks
 * diam membuat user menyangka prosesnya mati dan mengunggah ulang naskah yang
 * sebenarnya sedang dibaca.
 *
 * Sengaja tidak memakai bar persentase: pembangunan dossier adalah satu
 * panggilan model tanpa laporan kemajuan, jadi angka persen apa pun adalah
 * karangan. Yang jujur hanya tahap mana yang sedang jalan plus jam berjalan
 * sebagai bukti prosesnya hidup.
 */
export function DossierProgress({ charCount }: { charCount: number }) {
  const [sec, setSec] = useState(0);
  // ponytail: hitungan mulai saat komponen tampil, bukan saat server mulai
  // membaca — setelah reload jam ini mundur ke nol. Simpan dossier_started_at
  // di documents kalau ketepatannya mulai dipersoalkan.
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <ul className="mt-2 flex flex-col gap-1.5 text-sm">
      <Step state="done" label="PDF terunggah" />
      <Step state="done" label="Teks terekstraksi" note={`${nf.format(charCount)} karakter`} />
      <Step
        state="active"
        label="Analisis naskah oleh AI"
        note={`${mmss(sec)} · biasanya ±1 menit`}
      />
      <Step state="todo" label="Poin serangan siap" />
    </ul>
  );
}
