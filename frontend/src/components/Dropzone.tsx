import { useState } from "react";

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
      className={`dropzone ${over ? "over" : ""} ${busy ? "busy" : ""}`}
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
      <span className="dropzone-icon" aria-hidden="true">PDF</span>
      <strong>{busy ? "Mengunggah…" : "Tarik file PDF skripsi ke sini"}</strong>
      <span className="dropzone-sub">atau klik untuk memilih dari perangkat Anda</span>
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
