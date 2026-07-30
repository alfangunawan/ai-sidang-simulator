import { useEffect, useState } from "react";
import { getDossier, uploadSkripsi } from "../api.js";
import type { DossierStatus, SkripsiInfo } from "../types.js";
import { Dropzone } from "./Dropzone.js";

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
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Unggah naskah skripsi"
    >
      <div className="modal modal-wide">
        <h3>Unggah naskah skripsi dulu</h3>
        <p>
          Penguji bertanya langsung dari isi naskah Anda — bab, tabel, dan angka
          yang benar-benar ada di sana. Unggah PDF skripsi di sini, lalu sidang
          bisa dilanjutkan.
        </p>

        {skripsi && status !== "failed" ? (
          <div className="file-card">
            <div className="file-icon" aria-hidden="true">PDF</div>
            <div className="file-meta">
              <div className="file-name">{skripsi.filename}</div>
              <div className="file-sub">{nf.format(skripsi.char_count)} karakter</div>
            </div>
            <span className={ready ? "chip ok" : "chip"}>
              {ready ? "✓ Siap" : "⏳ Menganalisis"}
            </span>
          </div>
        ) : (
          <Dropzone busy={busy} onFile={upload} />
        )}

        {skripsi && status === "pending" && (
          <p className="hint">
            Membaca naskah dan menyusun poin serangan. Butuh sekitar satu menit —
            sidang belum bisa dimulai sampai selesai.
          </p>
        )}
        {status === "failed" && (
          <p className="error">Gagal membaca naskah ini. Coba unggah PDF lain.</p>
        )}
        {err && <p className="error">{err}</p>}

        <div className="modal-actions">
          <button onClick={onClose}>Nanti saja</button>
          <button className="primary" disabled={!ready} onClick={onReady}>
            {skripsi && !ready ? "Membaca naskah…" : "Lanjut pilih penguji"}
          </button>
        </div>
      </div>
    </div>
  );
}
