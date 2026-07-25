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
  vi.spyOn(api, "postTurn").mockResolvedValue("Apa kontribusi utama skripsi Anda?");
  vi.spyOn(api, "getSettings").mockResolvedValue(settingsView);
  vi.spyOn(api, "saveSettings").mockResolvedValue(settingsView);
});
afterEach(() => vi.restoreAllMocks());

describe("SessionPage", () => {
  it("sends a manual answer and renders the examiner reply", async () => {
    render(<SessionPage />);
    await waitFor(() => expect(api.getTurns).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(/Ketik jawaban/);
    fireEvent.change(textarea, { target: { value: "Jawaban saya." } });
    fireEvent.click(screen.getByText("Kirim"));

    await waitFor(() =>
      expect(screen.getByText(/Apa kontribusi utama/)).toBeTruthy(),
    );
    expect(api.postTurn).toHaveBeenCalledWith("sess-1", "Jawaban saya.");
  });

  it("renders the examiner-mode selector and persists a change", async () => {
    render(<SessionPage />);
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
});
