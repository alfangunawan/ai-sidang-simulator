import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPage } from "./SessionPage.js";
import * as api from "../api.js";
import { PERSONAS } from "../personas.js";

const settingsView = {
  provider: "claude",
  model: "claude-sonnet-5",
  base_url: "",
  has_api_key: true,
  attack_points: "",
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

beforeEach(() => {
  localStorage.clear();
  // jsdom has no canvas backend; stub getContext (VoiceVisualizer guards on null)
  // to avoid jsdom's "Not implemented: getContext" stderr noise.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // no SpeechRecognition -> manual textarea fallback path
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  (window as any).speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  // jsdom has no SpeechSynthesisUtterance constructor; stub it so tts.speak() doesn't throw.
  (window as any).SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => ({ text }));
  vi.spyOn(api, "createSession").mockResolvedValue("sess-1");
  vi.spyOn(api, "getTurns").mockResolvedValue([]);
  vi.spyOn(api, "postTurn").mockResolvedValue({
    reply: "Apa kontribusi utama skripsi Anda?",
    propose_close: false,
  });
  vi.spyOn(api, "getSettings").mockResolvedValue(settingsView);
  vi.spyOn(api, "saveSettings").mockResolvedValue(settingsView);
});
afterEach(() => vi.restoreAllMocks());

describe("SessionPage", () => {
  it("sends a manual answer and renders the examiner reply", async () => {
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/Ketik jawaban/);
    fireEvent.change(textarea, { target: { value: "Jawaban saya." } });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() =>
      expect(screen.getByText(/Apa kontribusi utama/)).toBeTruthy(),
    );
    expect(api.postTurn).toHaveBeenCalledWith("sess-1", "Jawaban saya.");
  });

  // Jam sidang mencatat detik yang sudah berjalan, bukan jam mulainya: waktu di
  // luar halaman (mahasiswa refresh atau kembali ke Beranda) tidak boleh ikut
  // terhitung, dan hitungannya harus dilanjutkan, bukan diulang dari nol.
  it("resumes the clock from the stored count, ignoring time spent away", async () => {
    localStorage.setItem("sibiru_session_id", "sess-1");
    localStorage.setItem(
      "sibiru_session_elapsed",
      JSON.stringify({ id: "sess-1", secs: 125 }),
    );
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);

    expect(await screen.findByText("2:05")).toBeTruthy();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("keeps the clock at 0:00 until the student actually starts", async () => {
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    expect(screen.getByText("0:00")).toBeTruthy();
    expect(localStorage.getItem("sibiru_session_elapsed")).toBeNull();
  });

  it("Keluar closes the sidang without a grade and never deletes the transcript", async () => {
    const del = vi.spyOn(api, "deleteSession");
    const close = vi.spyOn(api, "closeSession");
    const exit = vi.spyOn(api, "exitSession").mockResolvedValue();
    const onExit = vi.fn();
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={onExit} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Keluar"));
    // Leaving without a grade is one-way, so it asks first.
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Keluar tanpa nilai"));

    await waitFor(() => expect(exit).toHaveBeenCalledWith("sess-1"));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled(); // no assessment call, no bill
    expect(del).not.toHaveBeenCalled();
    expect(localStorage.getItem("sibiru_session_id")).toBeNull();
  });

  it("names the persona behind the saved mode/type pair", async () => {
    vi.spyOn(api, "getSettings").mockResolvedValue({
      ...settingsView,
      examiner_mode: "kritis",
      examiner_type: "teknis",
    });
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);

    expect(await screen.findByText("Dr. Anindya Kusuma, S.T., M.T.")).toBeTruthy();
    expect(screen.getByText("Penguji teknis · mode Kritis")).toBeTruthy();
    // the examiner is locked for the sitting — no picker in the session view
    expect(screen.queryByText("Mode penguji")).toBeNull();
  });

  it("falls back to a plain examiner when the saved pair matches no persona", async () => {
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    // fixture is standar/umum, which no named persona covers
    expect(await screen.findByText("Penguji")).toBeTruthy();
  });

  it("offers closing as a banner, never a modal that covers the examiner's last reply", async () => {
    vi.spyOn(api, "postTurn").mockResolvedValue({
      reply: "Rekap kelemahan utama: metodologi.",
      propose_close: true,
    });
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), {
      target: { value: "jawaban" },
    });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());
    expect(screen.getByText(/Rekap kelemahan utama/)).toBeTruthy();
    expect(screen.queryByText("Akhiri sidang?")).toBeNull(); // no modal yet

    fireEvent.click(screen.getByText("Lihat hasil penilaian"));
    await waitFor(() => expect(screen.getByText("Akhiri sidang?")).toBeTruthy());
  });

  it("declining an AI proposal calls continueSession and drops the banner", async () => {
    vi.spyOn(api, "postTurn").mockResolvedValue({ reply: "Baik.", propose_close: true });
    const cont = vi.spyOn(api, "continueSession").mockResolvedValue();
    render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Kirim"));
    await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());

    fireEvent.click(screen.getByText("Lanjut bertanya"));
    await waitFor(() => expect(cont).toHaveBeenCalledWith("sess-1"));
    expect(screen.queryByText("Lanjut bertanya")).toBeNull();
  });

  it("surfaces a send failure as a banner above the page heading", async () => {
    vi.spyOn(api, "postTurn").mockRejectedValue(new Error("Upload skripsi (PDF) dulu"));
    const { container } = render(<SessionPage personas={PERSONAS} onClosed={vi.fn()} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Kirim"));

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Upload skripsi (PDF) dulu");
    // above the fold: the banner precedes the page heading in document order
    const heading = screen.getByText("Latihan Sidang");
    expect(banner.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".alert.danger")).toBeTruthy();
  });

  it("Akhiri Sidang → confirm closes and calls onClosed with the assessment", async () => {
    const assessment = { final_score: 80 } as any;
    vi.spyOn(api, "closeSession").mockResolvedValue(assessment);
    const onClosed = vi.fn();
    render(<SessionPage personas={PERSONAS} onClosed={onClosed} onExit={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    // "Akhiri Sidang" is disabled until there's at least one turn — same guard as "Export".
    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), {
      target: { value: "jawaban" },
    });
    fireEvent.click(screen.getByText("Kirim"));
    await waitFor(() => expect(screen.getByText(/Apa kontribusi utama/)).toBeTruthy());

    fireEvent.click(screen.getByText("Akhiri Sidang"));
    fireEvent.click(screen.getByText("Akhiri & lihat hasil"));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(assessment));
  });
});
