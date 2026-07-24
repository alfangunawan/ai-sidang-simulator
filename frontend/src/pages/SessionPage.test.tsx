import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPage } from "./SessionPage.js";
import * as api from "../api.js";

beforeEach(() => {
  localStorage.clear();
  // no SpeechRecognition -> manual textarea fallback path
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  (window as any).speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  // jsdom has no SpeechSynthesisUtterance constructor; stub it so tts.speak() doesn't throw.
  (window as any).SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => ({ text }));
  vi.spyOn(api, "createSession").mockResolvedValue("sess-1");
  vi.spyOn(api, "getTurns").mockResolvedValue([]);
  vi.spyOn(api, "postTurn").mockResolvedValue("Apa kontribusi utama skripsi Anda?");
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
});
