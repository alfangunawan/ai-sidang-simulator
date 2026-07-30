import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getDossier, uploadSkripsi } from "../api.js";
import type { DossierStatus, SkripsiInfo } from "../types.js";
import { Dropzone } from "./Dropzone.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const nf = new Intl.NumberFormat("id-ID");

interface Props {
  /** "Nanti saja" — kembali ke Beranda tanpa memulai sidang. */
  onClose: () => void;
  /** Naskah siap dipakai: lanjut ke pemilihan penguji. */
  onReady: () => void;
}

/**
 * Penghalang di depan pintu: tanpa naskah, penguji tidak punya bahan bertanya.
 * Ditagih di sini, bukan saat mahasiswa menekan Rekam dan sidang sudah jalan.
 */
export function SkripsiModal({ onClose, onReady }: Props) {
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [status, setStatus] = useState<DossierStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pembacaan naskah berjalan di luar request upload, jadi status barunya hanya
  // bisa diketahui dengan menanya ulang.
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(() => {
      getDossier()
        .then((d) => setStatus(d?.status ?? null))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [status]);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const info = await uploadSkripsi(file);
      setSkripsi(info);
      setStatus(info.dossier_status ?? "pending");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  const ready = status === "ready";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unggah naskah skripsi dulu</DialogTitle>
          <DialogDescription>
            Penguji bertanya langsung dari isi naskah Anda — bab, tabel, dan angka
            yang benar-benar ada di sana. Unggah PDF skripsi di sini, lalu sidang
            bisa dilanjutkan.
          </DialogDescription>
        </DialogHeader>

        {skripsi && status !== "failed" ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{skripsi.filename}</div>
              <div className="text-xs text-muted-foreground">
                {nf.format(skripsi.char_count)} karakter
              </div>
            </div>
            <Badge
              variant="secondary"
              className={ready ? "bg-success/15 text-success" : undefined}
            >
              {ready ? "✓ Siap" : "⏳ Menganalisis"}
            </Badge>
          </div>
        ) : (
          <Dropzone busy={busy} onFile={upload} />
        )}

        {skripsi && status === "pending" && (
          <p className="text-xs text-muted-foreground">
            Membaca naskah dan menyusun poin serangan. Butuh sekitar satu menit —
            sidang belum bisa dimulai sampai selesai.
          </p>
        )}
        {status === "failed" && (
          <p className="text-sm text-destructive">
            Gagal membaca naskah ini. Coba unggah PDF lain.
          </p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Nanti saja
          </Button>
          <Button disabled={!ready} onClick={onReady}>
            {skripsi && !ready ? "Membaca naskah…" : "Lanjut pilih penguji"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
