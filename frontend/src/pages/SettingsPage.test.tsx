import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import * as api from "../api.js";

import type { SettingsView } from "../types.js";

const VIEW: SettingsView = {
  provider: "claude",
  model: "claude-sonnet-5",
  has_api_key: false,
  attack_points: "POIN A",
  examiner_mode: "standar",
  examiner_modes: [
    { value: "santai", label: "Santai" },
    { value: "standar", label: "Standar" },
    { value: "kritis", label: "Kritis" },
    { value: "galak", label: "Galak" },
  ],
  examiner_type: "umum",
  examiner_types: [
    { value: "umum", label: "Umum (gabungan)" },
    { value: "metodolog", label: "Metodolog" },
    { value: "domain", label: "Ahli Domain" },
    { value: "teknis", label: "Teknis (RPL/SI)" },
    { value: "ketua", label: "Ketua Sidang" },
  ],
  tts_provider: "browser",
  tts_voice: "",
  has_google_tts_key: false,
  has_openai_tts_key: false,
};

beforeEach(() => {
  vi.spyOn(api, "getSettings").mockResolvedValue(VIEW);
  vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("loads settings and shows key-not-stored state", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Key tersimpan: tidak/)).toBeTruthy());
    expect(screen.getByText(/Belum ada skripsi/)).toBeTruthy();
  });

  it("reveals Google key + voice fields when TTS provider is Google and saves them", async () => {
    vi.spyOn(api, "getTtsVoices").mockResolvedValue([
      { name: "id-ID-Chirp3-HD-Kore", type: "Chirp3-HD", gender: "FEMALE" },
    ]);
    const save = vi.spyOn(api, "saveSettings").mockResolvedValue({
      ...VIEW,
      tts_provider: "google",
      tts_voice: "id-ID-Chirp3-HD-Kore",
      has_google_tts_key: true,
    });

    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    const ttsSelect = (
      await screen.findByText("Google Cloud (Neural2 / Chirp3-HD)")
    ).closest("select") as HTMLSelectElement;
    fireEvent.change(ttsSelect, { target: { value: "google" } });

    // voice list loads and the Google key field appears
    await screen.findByText("id-ID-Chirp3-HD-Kore");
    const keyField = screen.getByPlaceholderText(/Google Cloud API key/i);
    fireEvent.change(keyField, { target: { value: "gcp-123" } });

    fireEvent.click(screen.getByText("Simpan Pengaturan"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          tts_provider: "google",
          tts_voice: "id-ID-Chirp3-HD-Kore",
          google_tts_key: "gcp-123",
        }),
      ),
    );
  });

  it("shows Terhubung after a successful LLM connection test", async () => {
    vi.spyOn(api, "testLlm").mockResolvedValue({ ok: true });
    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Tes Koneksi"));

    expect(await screen.findByText(/Terhubung/)).toBeTruthy();
  });

  it("previews the selected Google voice by playing returned audio", async () => {
    vi.spyOn(api, "getTtsVoices").mockResolvedValue([
      { name: "id-ID-Chirp3-HD-Kore", type: "Chirp3-HD" },
    ]);
    const preview = vi
      .spyOn(api, "ttsPreview")
      .mockResolvedValue({ audio: "QUJD", mime: "audio/mpeg" });
    const play = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).Audio = vi.fn().mockImplementation(() => ({ play }));

    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    const ttsSelect = (
      await screen.findByText("Google Cloud (Neural2 / Chirp3-HD)")
    ).closest("select") as HTMLSelectElement;
    fireEvent.change(ttsSelect, { target: { value: "google" } });

    await screen.findByText("id-ID-Chirp3-HD-Kore");
    fireEvent.click(screen.getByText(/Preview/));

    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google", voice: "id-ID-Chirp3-HD-Kore" }),
      ),
    );
    expect(play).toHaveBeenCalled();
  });

  it("keeps skripsi state and shows error when delete fails", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({
      filename: "x.pdf",
      char_count: 10,
      uploaded_at: "t",
    });
    vi.spyOn(api, "deleteSkripsi").mockRejectedValue(new Error("gagal hapus"));

    render(<SettingsPage />);
    expect(await screen.findByText(/x\.pdf/)).toBeTruthy();

    fireEvent.click(screen.getByText("Hapus"));

    expect(await screen.findByText("gagal hapus")).toBeTruthy();
    expect(screen.getByText(/x\.pdf/)).toBeTruthy();
  });
});
