import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
}

/**
 * Kotak unggah: seret file ke atasnya, atau klik untuk membuka file explorer.
 * Kliknya gratis — <label> yang membungkus input file sudah melakukannya.
 */
export function Dropzone({ onFile, busy }: Props) {
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file) return;
    onFile(file);
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted",
        over && "border-primary bg-primary/5",
        busy && "pointer-events-none opacity-60",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
    >
      <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
      <strong className="text-sm font-semibold">
        {busy ? "Mengunggah…" : "Tarik file PDF skripsi ke sini"}
      </strong>
      <span className="text-xs text-muted-foreground">
        atau klik untuk memilih dari perangkat Anda
      </span>
      <input
        type="file"
        accept="application/pdf"
        hidden
        disabled={busy}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
