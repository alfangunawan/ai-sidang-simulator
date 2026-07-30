import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SkripsiModal } from "./SkripsiModal.js";
import * as api from "../api.js";
import type { SkripsiInfo } from "../types.js";

const UPLOADED: SkripsiInfo = {
  filename: "skripsi.pdf",
  char_count: 302447,
  uploaded_at: "2026-07-30T00:00:00Z",
  dossier_status: "pending",
};

// The dropzone takes a dragged file as well as a picked one.
function drop(file: File) {
  const zone = screen.getByText(/Tarik file PDF/).closest("label")!;
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

const PDF = () => new File(["%PDF"], "skripsi.pdf", { type: "application/pdf" });

describe("SkripsiModal", () => {
  beforeEach(() => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps the sidang shut while the uploaded naskah is still being read", async () => {
    vi.spyOn(api, "uploadSkripsi").mockResolvedValue(UPLOADED);
    vi.spyOn(api, "getDossier").mockResolvedValue(null);
    const onReady = vi.fn();

    render(<SkripsiModal onClose={vi.fn()} onReady={onReady} />);
    drop(PDF());

    await waitFor(() => expect(screen.getByText("skripsi.pdf")).toBeTruthy());
    fireEvent.click(screen.getByText("Membaca naskah…"));
    expect(onReady).not.toHaveBeenCalled();
  });

  it("hands the student to the examiner picker once the naskah is ready", async () => {
    vi.spyOn(api, "uploadSkripsi").mockResolvedValue({
      ...UPLOADED,
      dossier_status: "ready",
    });
    const onReady = vi.fn();

    render(<SkripsiModal onClose={vi.fn()} onReady={onReady} />);
    drop(PDF());

    await waitFor(() => expect(screen.getByText("✓ Siap")).toBeTruthy());
    fireEvent.click(screen.getByText("Lanjut pilih penguji"));
    expect(onReady).toHaveBeenCalled();
  });

  // Kegagalan ini pernah tampil sebagai "coba unggah PDF lain" padahal naskahnya
  // sudah terindeks dan yang habis adalah kredit model — user mengulang unggahan
  // yang berhasil, lalu terjebak.
  it("names the server's reason and offers a re-read instead of a re-upload", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({
      ...UPLOADED,
      dossier_status: "failed",
      dossier_error: "Pembacaan naskah oleh model gagal: kredit OpenRouter habis (HTTP 402)",
    });
    const rebuild = vi.spyOn(api, "rebuildDossier").mockResolvedValue("pending");
    vi.spyOn(api, "getDossier").mockResolvedValue(null);

    render(<SkripsiModal onClose={vi.fn()} onReady={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/kredit OpenRouter habis/)).toBeTruthy());
    // naskah yang sudah terunggah tetap terlihat, tidak ditukar kotak unggah
    expect(screen.getByText("skripsi.pdf")).toBeTruthy();
    expect(screen.getByText("✗ Gagal dibaca")).toBeTruthy();

    fireEvent.click(screen.getByText("Baca ulang naskah"));
    await waitFor(() => expect(rebuild).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("⏳ Menganalisis")).toBeTruthy());
  });

  // jsdom tidak melakukan layout, jadi lebarnya tidak bisa diukur di sini —
  // yang dijaga adalah dua kelas yang menahan overflow itu, karena keduanya
  // hidup di komponen shadcn yang gampang tertimpa saat di-generate ulang dan
  // hilangnya tidak menggagalkan satu test pun.
  it("keeps the guards that stop the dialog overflowing sideways", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({
      ...UPLOADED,
      dossier_status: "failed",
      dossier_error: "Pembacaan naskah oleh model gagal: API key belum diset",
    });
    vi.spyOn(api, "getDossier").mockResolvedValue(null);

    render(<SkripsiModal onClose={vi.fn()} onReady={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/API key belum diset/)).toBeTruthy());

    // kolom grid dialog harus boleh menyusut; kolom auto dipatok min-content
    // anak terlebar dan membuat SELURUH isi dialog melar
    const dialog = document.querySelector('[data-slot="dialog-content"]')!;
    expect(dialog.className).toContain("grid-cols-[minmax(0,1fr)]");

    // pesan server bisa memuat URL panjang tanpa spasi
    const desc = document.querySelector('[data-slot="alert-description"]')!;
    expect(desc.className).toContain("wrap-anywhere");
  });
});
