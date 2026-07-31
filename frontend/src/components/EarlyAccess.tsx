import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { joinCollab } from "../api.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SEEN_KEY = "sibiru_early_access";

/** Sambutan early access hanya muncul sekali per browser; bannernya tetap. */
export function earlyAccessSeen(): boolean {
  return localStorage.getItem(SEEN_KEY) !== null;
}

/**
 * Pengumuman permanen bahwa aplikasi ini baru: dipasang di landing dan di
 * dashboard, karena pengunjung bisa masuk lewat keduanya.
 */
export function EarlyAccessBanner({
  className,
  onEnterCode,
}: {
  className?: string;
  /** Jalan kembali ke modal kode: tanpa ini, sekali ditutup ia hilang selamanya. */
  onEnterCode?: () => void;
}) {
  return (
    <div className={cn("border-b bg-warning/10", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs leading-relaxed">
        <FlaskConical className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Early access.</strong> SiBiru baru
          dirilis dan masih diuji — beberapa bagian mungkin error atau
          berperilaku aneh. Maaf sebelumnya, dan terima kasih sudah ikut mencoba.
        </p>
        {onEnterCode && (
          <Button variant="outline" size="xs" onClick={onEnterCode}>
            Masukkan kode
          </Button>
        )}
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
  /** Kode berhasil dipakai — pemanggil boleh mengulang yang tadi gagal karena key. */
  onJoined?: () => void;
}

/**
 * Sambutan pertama sesudah login. Selain memberi tahu status early access,
 * modal ini pintu masuk kode kolaborasi: penerima kode langsung memakai key
 * milik host, jadi ia bisa mencoba sidang tanpa menyiapkan API key sendiri.
 *
 * Kode bersifat opsional — "Lewati" tetap menutup modal dan menandainya sudah
 * dilihat, sebab pengguna yang punya key sendiri tidak perlu kode apa pun.
 */
export function EarlyAccessModal({ onClose, onJoined }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    if (host) onJoined?.();
    onClose();
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const state = await joinCollab(code.trim());
      setHost(state.joined?.host_username ?? "host");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && dismiss()}>
      {/* Klik di luar dan Esc tidak boleh menutupnya: satu salah klik dulu
          menandai sambutan "sudah dilihat" dan mengubur satu-satunya tempat
          kode early access diminta. Penutupnya hanya tombol. */}
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {host ? "Kode diterima" : "Selamat datang di early access"}
          </DialogTitle>
          <DialogDescription>
            {host ? (
              <>
                Kamu sekarang memakai key milik <strong>{host}</strong>. Model
                AI, suara, dan diktasi yang dibagikan host siap dipakai —
                langsung mulai sidang tanpa mengisi API key sendiri.
              </>
            ) : (
              <>
                SiBiru baru dirilis dan masih diuji, jadi masih mungkin ada
                error atau bug. Kalau kamu menerima kode early access dari
                founder (Alfan), masukkan di bawah supaya bisa memakai API key
                miliknya.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!host && (
          <div>
            <Label htmlFor="early-access-code">Kode early access</Label>
            <Input
              id="early-access-code"
              value={code}
              autoFocus
              placeholder="tempel kode di sini"
              className="mt-2"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim() && !busy) submit();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Belum punya kode? Lewati saja — kamu bisa memakai API key sendiri
              lewat Pengaturan, atau memasukkan kode nanti di Pengaturan →
              Kolaborasi.
            </p>
          </div>
        )}

        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}

        <DialogFooter>
          {host ? (
            <Button onClick={dismiss}>Mulai</Button>
          ) : (
            <>
              <Button variant="outline" onClick={dismiss} disabled={busy}>
                Lewati
              </Button>
              <Button onClick={submit} disabled={busy || !code.trim()}>
                {busy ? "Memeriksa…" : "Gunakan kode"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
