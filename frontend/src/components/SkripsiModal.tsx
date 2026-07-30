import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getDossier, getSkripsi, rebuildDossier, uploadSkripsi } from "../api.js";
import type { DossierStatus, SkripsiInfo } from "../types.js";
import { DossierProgress } from "./DossierProgress.js";
import { Dropzone } from "./Dropzone.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const BADGE: Record<DossierStatus, { label: string; className?: string }> = {
  pending: { label: "⏳ Menganalisis" },
  ready: { label: "✓ Siap", className: "bg-success/15 text-success" },
  failed: { label: "✗ Gagal dibaca", className: "bg-destructive/10 text-destructive" },
};

interface Props {
  /** "Nanti saja" — kembali ke Beranda tanpa memulai sidang. */
  onClose: () => void;
  /** Naskah siap dipakai: lanjut ke pemilihan penguji. */
  onReady: () => void;
}

/**
 * Penghalang di depan pintu: tanpa naskah yang sudah terbaca, penguji tidak
 * punya bahan bertanya. Ditagih di sini, bukan saat mahasiswa menekan Rekam dan
 * sidang sudah jalan.
 *
 * Dua keadaan dibedakan tegas, karena keduanya pernah tertukar dan membuat user
 * mengulang unggahan yang sebenarnya berhasil: PDF-nya gagal masuk (unggah
 * ulang), versus PDF sudah terindeks tetapi pembacaan oleh model gagal (baca
 * ulang, bukan unggah ulang).
 */
export function SkripsiModal({ onClose, onReady }: Props) {
  const [skripsi, setSkripsi] = useState<SkripsiInfo | null>(null);
  const [status, setStatus] = useState<DossierStatus | null>(null);
  // Sebab kegagalan dari server. Modal ini pernah mengarang sebabnya sendiri
  // ("coba unggah PDF lain") padahal yang habis adalah kuota model.
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Naskah bisa sudah ada dari sesi sebelumnya dengan pembacaan yang gagal —
  // tanpa ini modal menampilkan kotak unggah kosong dan menyembunyikan satu-
  // satunya jalan keluar, yaitu baca ulang.
  useEffect(() => {
    getSkripsi()
      .then((s) => {
        if (!s) return;
        setSkripsi(s);
        setStatus(s.dossier_status ?? null);
        setReason(s.dossier_error ?? null);
      })
      .catch(() => {});
  }, []);

  // Pembacaan naskah berjalan di luar request upload, jadi status barunya hanya
  // bisa diketahui dengan menanya ulang.
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(() => {
      getDossier()
        .then((d) => {
          setStatus(d?.status ?? null);
          setReason(d?.error ?? null);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [status]);

  async function upload(file: File) {
    setErr(null);
    setReason(null);
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

  async function retry() {
    setErr(null);
    setReason(null);
    setBusy(true);
    try {
      setStatus((await rebuildDossier()) ?? "pending");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  const ready = status === "ready";
  // Status apa pun selain pending/ready pada naskah yang sudah ada berarti
  // dossier-nya tidak bisa dipakai — termasuk dokumen lama yang belum pernah
  // punya baris dossier. Keduanya keluar lewat pintu yang sama: baca ulang.
  const failed = !!skripsi && !ready && status !== "pending";
  const badge = status ? BADGE[status] : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unggah naskah skripsi dulu</DialogTitle>
          <DialogDescription>
            Penguji bertanya langsung dari isi naskah Anda — bab, tabel, dan angka
            yang benar-benar ada di sana. Unggah PDF skripsi di sini, lalu sidang
            bisa dilanjutkan.
          </DialogDescription>
        </DialogHeader>

        {/* Kartu naskah tetap terlihat di semua keadaan, termasuk gagal: file-nya
            memang sudah terunggah, dan menukarnya dengan kotak unggah membuat
            user menyangka unggahannya hilang. */}
        {skripsi && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{skripsi.filename}</div>
              <div className="text-xs text-muted-foreground">
                {nf.format(skripsi.char_count)} karakter · terindeks
              </div>
            </div>
            {badge && (
              <Badge variant="secondary" className={badge.className}>
                {badge.label}
              </Badge>
            )}
          </div>
        )}

        {/* Kegagalan pembacaan bisa berasal dari model ATAU dari naskah yang tak
            terbaca, jadi kotak unggah tetap tersedia sebagai jalan kedua. */}
        {(!skripsi || failed) && <Dropzone busy={busy} onFile={upload} />}

        {skripsi && status === "pending" && (
          <Alert>
            <AlertDescription>
              Membaca naskah dan menyusun poin serangan — sidang belum bisa dimulai
              sampai selesai.
              <DossierProgress charCount={skripsi.char_count} />
            </AlertDescription>
          </Alert>
        )}

        {failed && (
          <Alert variant="destructive">
            <AlertDescription>
              {reason ?? "Pembacaan naskah oleh model gagal."} Naskahnya sendiri sudah
              tersimpan — perbaiki penyebabnya di Pengaturan (API key, kuota, atau
              model) lalu tekan Baca ulang naskah, atau unggah PDF lain di bawah.
            </AlertDescription>
          </Alert>
        )}

        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Nanti saja
          </Button>
          {failed ? (
            <Button disabled={busy} onClick={retry}>
              {busy ? "Membaca ulang…" : "Baca ulang naskah"}
            </Button>
          ) : (
            <Button disabled={!ready} onClick={onReady}>
              {skripsi && !ready ? "Membaca naskah…" : "Lanjut pilih penguji"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
