import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import * as api from "../api.js";

import type { SettingsView, Dossier, SkripsiInfo } from "../types.js";

const SKRIPSI: SkripsiInfo = {
  filename: "skripsi.pdf",
  char_count: 302447,
  uploaded_at: "2026-07-29T00:00:00Z",
  chunk_count: 271,
  dossier_status: "ready",
};

const DOSSIER: Dossier = {
  judul: "Perancangan Chatbot Skrining Kecemasan",
  rumusan_masalah: ["RM satu?", "RM dua?"],
  tujuan: [],
  batasan: [],
  metode: { nama: "Prototyping", justifikasi: "" },
  instrumen: [],
  populasi_sampel: { deskripsi: "Mahasiswa", jumlah: 113 },
  hasil_kunci: [],
  kesimpulan: ["Kesimpulan satu."],
  keterbatasan: [],
  peta_bab: [],
  fakta_struktural: {
    jumlah_rumusan_masalah: 2,
    jumlah_kesimpulan: 1,
    rumusan_tanpa_kesimpulan: ["RM dua?"],
    sitasi_bab2_tidak_di_daftar_pustaka: [],
    jumlah_tabel: 12,
    jumlah_gambar: 8,
  },
  modul_kritik_terpicu: ["sistem", "ai"],
  poin_serangan: ["RM dua tidak terjawab di kesimpulan."],
};

const VIEW: SettingsView = {
  provider: "claude",
  model: "claude-sonnet-5",
    base_url: "",
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
  stt_provider: "browser",
  has_openai_stt_key: false,
};

const EMPTY_TOTALS = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  cost_usd: 0,
  calls: 0,
};

// The pickers are Radix selects: the options only exist once the trigger is
// opened, and the trigger opens on pointerdown rather than click.
async function pick(triggerLabel: string, optionName: string | RegExp) {
  fireEvent.pointerDown(screen.getByLabelText(triggerLabel), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

beforeEach(() => {
  vi.spyOn(api, "getSettings").mockResolvedValue(VIEW);
  vi.spyOn(api, "getSkripsi").mockResolvedValue(null);
  vi.spyOn(api, "getUsage").mockResolvedValue({
    total: EMPTY_TOTALS,
    by_kind: [],
    since: null,
  });
  vi.spyOn(api, "getCollab").mockResolvedValue({ hosting: null, joined: null });
  vi.spyOn(api, "getDossier").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("loads settings and shows key-not-stored state", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Key tersimpan: tidak/)).toBeTruthy());
    expect(screen.getByText(/Belum ada skripsi/)).toBeTruthy();
  });

  it("shows an empty-state message when no tokens have been spent", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(api.getUsage).toHaveBeenCalled());
    expect(screen.getByText(/Belum ada pemakaian tercatat/)).toBeTruthy();
  });

  it("renders token totals per source and resets the counter", async () => {
    vi.spyOn(api, "getUsage").mockResolvedValue({
      total: { ...EMPTY_TOTALS, input_tokens: 34000, output_tokens: 242, cost_usd: 0.0046, calls: 3 },
      by_kind: [
        { kind: "turn", totals: { ...EMPTY_TOTALS, input_tokens: 30000, output_tokens: 200, calls: 2 } },
        { kind: "assessment", totals: { ...EMPTY_TOTALS, input_tokens: 4000, output_tokens: 42, calls: 1 } },
      ],
      since: "2026-01-01T00:00:00Z",
    });
    const reset = vi.spyOn(api, "resetUsage").mockResolvedValue({
      total: EMPTY_TOTALS,
      by_kind: [],
      since: null,
    });

    render(<SettingsPage />);
    await waitFor(() => expect(api.getUsage).toHaveBeenCalled());

    // id-ID grouping; shown twice — summary card and the total row
    expect(screen.getAllByText("34.000")).toHaveLength(2);
    expect(screen.getByText("Tanya jawab")).toBeTruthy();
    expect(screen.getByText("Penilaian akhir")).toBeTruthy();

    fireEvent.click(screen.getByText("Reset Penghitung"));
    await waitFor(() => expect(reset).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Belum ada pemakaian tercatat/)).toBeTruthy(),
    );
  });

  // Selama tergabung, setelan sendiri diabaikan saat sidang berjalan. Kolom yang
  // bisa disunting tapi tidak berpengaruh adalah jebakan, jadi yang tampil harus
  // setelan host dan terkunci.
  it("locks AI/TTS/STT to the host's settings while joined to a collab", async () => {
    vi.spyOn(api, "getSettings").mockResolvedValue({
      ...VIEW,
      tts_provider: "openai",
      tts_voice: "alloy",
      effective_ai_shared: true,
      effective_tts_shared: true,
      effective_stt_shared: true,
      effective_provider: "openrouter",
      effective_model: "z-ai/glm-4.6",
      effective_tts_provider: "google",
      effective_tts_voice: "id-ID-Chirp3-HD-Kore",
      effective_stt_provider: "whisper",
    });
    vi.spyOn(api, "getTtsVoices").mockResolvedValue([]);
    const save = vi.spyOn(api, "saveSettings").mockResolvedValue(VIEW);

    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    // nilai host yang ditampilkan, bukan milik sendiri
    expect(screen.getByText("z-ai/glm-4.6")).toBeTruthy();
    expect(screen.getByText("id-ID-Chirp3-HD-Kore")).toBeTruthy();
    expect(screen.getByText("Whisper API (OpenAI)")).toBeTruthy();

    // dan tidak satu pun bisa disunting
    expect(screen.queryByLabelText("Provider")).toBeNull();
    expect(screen.queryByLabelText("Provider Suara")).toBeNull();
    expect(screen.queryByLabelText("Provider Diktasi")).toBeNull();
    expect(screen.queryByPlaceholderText(/API key/i)).toBeNull();

    // menyimpan tidak boleh menimpa setelan sendiri dengan setelan host
    fireEvent.click(screen.getByText("Simpan Pengaturan"));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const body = save.mock.calls[0][0];
    expect(body).not.toHaveProperty("provider");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("tts_provider");
    expect(body).not.toHaveProperty("stt_provider");
  });

  it("reveals the URL field when the provider is 9router and saves it", async () => {
    const save = vi.spyOn(api, "saveSettings").mockResolvedValue({
      ...VIEW,
      provider: "9router",
      base_url: "https://api.9router.ai/v1",
    });

    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    await pick("Provider", "9router (URL sendiri)");

    const urlField = await screen.findByPlaceholderText(/https:\/\/api\.9router/i);
    fireEvent.change(urlField, { target: { value: "https://api.9router.ai/v1" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-x" } });

    fireEvent.click(screen.getByText("Simpan Pengaturan"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "9router",
          model: "gpt-x",
          base_url: "https://api.9router.ai/v1",
        }),
      ),
    );
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

    await pick("Provider Suara", "Google Cloud (Neural2 / Chirp3-HD)");

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

  it("reveals the Whisper key field when STT provider is Whisper and saves it", async () => {
    const save = vi.spyOn(api, "saveSettings").mockResolvedValue({
      ...VIEW,
      stt_provider: "whisper",
      has_openai_stt_key: true,
    });

    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    await pick("Provider Diktasi", "Whisper API (OpenAI)");

    const keyField = await screen.findByPlaceholderText(/tempel OpenAI API key/i);
    fireEvent.change(keyField, { target: { value: "sk-stt-1" } });

    fireEvent.click(screen.getByText("Simpan Pengaturan"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ stt_provider: "whisper", openai_stt_key: "sk-stt-1" }),
      ),
    );
  });

  it("tests the Whisper connection with the typed key", async () => {
    const test = vi.spyOn(api, "testStt").mockResolvedValue({ ok: true });
    render(<SettingsPage />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    await pick("Provider Diktasi", "Whisper API (OpenAI)");

    fireEvent.change(await screen.findByPlaceholderText(/tempel OpenAI API key/i), {
      target: { value: "sk-typed" },
    });
    fireEvent.click(screen.getByText("Tes Koneksi STT"));

    await waitFor(() =>
      expect(test).toHaveBeenCalledWith({ provider: "whisper", key: "sk-typed" }),
    );
    expect(await screen.findByText(/Diktasi siap/)).toBeTruthy();
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

    await pick("Provider Suara", "Google Cloud (Neural2 / Chirp3-HD)");

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

describe("SettingsPage — panel dossier", () => {
  function withDossier(over: Partial<Parameters<typeof api.saveDossier>[0]> = {}) {
    vi.spyOn(api, "getSkripsi").mockResolvedValue(SKRIPSI);
    vi.spyOn(api, "getDossier").mockResolvedValue({
      status: "ready",
      error: null,
      model: "z-ai/glm-5.2",
      dossier: { ...DOSSIER, ...over },
    });
  }

  it("prefills the attack points the model found, instead of a blank textarea", async () => {
    withDossier();
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("RM dua tidak terjawab di kesimpulan.")).toBeTruthy(),
    );
    // Fakta struktural yang menjawab pertanyaan agregatif penguji.
    expect(screen.getByText(/2 \/ 1/)).toBeTruthy();
    expect(screen.getByText(/1 rumusan belum terjawab/)).toBeTruthy();
    expect(screen.getByText(/sistem, ai/)).toBeTruthy();
  });

  it("saves edited attack points one per line", async () => {
    withDossier();
    const save = vi.spyOn(api, "saveDossier").mockResolvedValue(DOSSIER);
    render(<SettingsPage />);
    const box = await screen.findByDisplayValue("RM dua tidak terjawab di kesimpulan.");
    fireEvent.change(box, { target: { value: "poin satu\n\n  poin dua  \n" } });
    fireEvent.click(screen.getByText("Simpan poin serangan"));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].poin_serangan).toEqual(["poin satu", "poin dua"]);
  });

  it("explains that a sidang cannot start while the dossier is still building", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({ ...SKRIPSI, dossier_status: "pending" });
    vi.spyOn(api, "getDossier").mockResolvedValue({
      status: "pending", error: null, model: null, dossier: null,
    });
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/sidang belum bisa dimulai/)).toBeTruthy());
  });

  it("surfaces the build error and offers a rebuild", async () => {
    vi.spyOn(api, "getSkripsi").mockResolvedValue({ ...SKRIPSI, dossier_status: "failed" });
    vi.spyOn(api, "getDossier").mockResolvedValue({
      status: "failed",
      error: "Model kehabisan token output sebelum dossier selesai.",
      model: null,
      dossier: null,
    });
    const rebuild = vi.spyOn(api, "rebuildDossier").mockResolvedValue("pending");
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/kehabisan token output/)).toBeTruthy());
    fireEvent.click(screen.getByText("Baca ulang skripsi"));
    await waitFor(() => expect(rebuild).toHaveBeenCalled());
  });
});
