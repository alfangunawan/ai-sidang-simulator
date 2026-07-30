import { describe, it, expect, vi, afterEach } from "vitest";
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
});
