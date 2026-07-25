import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPage } from "./SessionPage.js";
import * as api from "../api.js";

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
  const settingsView = {
    provider: "claude",
    model: "claude-sonnet-5",
    has_api_key: true,
    attack_points: "",
    examiner_mode: "standar",
    examiner_modes: [
      { value: "santai", label: "Santai" },
      { value: "standar", label: "Standar" },
      { value: "kritis", label: "Kritis" },
      { value: "galak", label: "Galak" },
    ],
    tts_provider: "browser",
    tts_voice: "",
    has_google_tts_key: false,
    has_openai_tts_key: false,
  };
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
    render(<SessionPage onClosed={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/Ketik jawaban/);
    fireEvent.change(textarea, { target: { value: "Jawaban saya." } });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() =>
      expect(screen.getByText(/Apa kontribusi utama/)).toBeTruthy(),
    );
    expect(api.postTurn).toHaveBeenCalledWith("sess-1", "Jawaban saya.");
  });

  it("Sesi Baru starts a fresh session without deleting the old one", async () => {
    const del = vi.spyOn(api, "deleteSession");
    render(<SessionPage onClosed={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Sesi Baru"));

    await waitFor(() => expect(api.createSession).toHaveBeenCalledTimes(2));
    expect(del).not.toHaveBeenCalled();
  });

  it("renders the examiner-mode selector and persists a change", async () => {
    render(<SessionPage onClosed={vi.fn()} />);
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());

    const select = (await screen.findByText("Galak")).closest(
      "select",
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: "galak" } });

    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({ examiner_mode: "galak" }),
    );
  });

  it("opens the close modal when the examiner proposes closing", async () => {
    vi.spyOn(api, "postTurn").mockResolvedValue({ reply: "Baik.", propose_close: true });
    render(<SessionPage onClosed={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), {
      target: { value: "jawaban" },
    });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());
  });

  it("declining an AI proposal calls continueSession and keeps the session", async () => {
    vi.spyOn(api, "postTurn").mockResolvedValue({ reply: "Baik.", propose_close: true });
    const cont = vi.spyOn(api, "continueSession").mockResolvedValue();
    render(<SessionPage onClosed={vi.fn()} />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Ketik jawaban/), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Kirim"));
    await waitFor(() => expect(screen.getByText("Lanjut bertanya")).toBeTruthy());

    fireEvent.click(screen.getByText("Lanjut bertanya"));
    await waitFor(() => expect(cont).toHaveBeenCalledWith("sess-1"));
  });

  it("Akhiri Sidang → confirm closes and calls onClosed with the assessment", async () => {
    const assessment = { final_score: 80 } as any;
    vi.spyOn(api, "closeSession").mockResolvedValue(assessment);
    const onClosed = vi.fn();
    render(<SessionPage onClosed={onClosed} />);
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
