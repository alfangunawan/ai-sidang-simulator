import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpeechSynthesis } from "./useSpeechSynthesis.js";
import * as api from "../api.js";

beforeEach(() => {
  (window as any).speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  (window as any).SpeechSynthesisUtterance = vi
    .fn()
    .mockImplementation((text: string) => ({ text }));
});
afterEach(() => vi.restoreAllMocks());

describe("useSpeechSynthesis", () => {
  it("browser provider speaks via the Web Speech API", async () => {
    const { result } = renderHook(() => useSpeechSynthesis("browser"));
    await act(async () => {
      await result.current.speak("Halo");
    });
    expect((window as any).speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it("does not cancel the speech queue when nothing is currently speaking", async () => {
    (window as any).speechSynthesis.speaking = false;
    (window as any).speechSynthesis.pending = false;
    const { result } = renderHook(() => useSpeechSynthesis("browser"));
    await act(async () => {
      await result.current.speak("Halo");
    });
    expect((window as any).speechSynthesis.cancel).not.toHaveBeenCalled();
  });

  it("selects an Indonesian voice when the browser offers one", async () => {
    const idVoice = { lang: "id-ID", name: "Damayanti" };
    (window as any).speechSynthesis.getVoices = vi.fn(() => [{ lang: "en-US" }, idVoice]);
    let spoken: any;
    (window as any).speechSynthesis.speak = vi.fn((u: any) => {
      spoken = u;
    });
    const { result } = renderHook(() => useSpeechSynthesis("browser"));
    await act(async () => {
      await result.current.speak("Halo");
    });
    expect(spoken.voice).toBe(idVoice);
  });

  it("exposes an error when server synthesis fails instead of dropping it silently", async () => {
    vi.spyOn(api, "ttsSpeak").mockRejectedValue(new Error("no key"));
    const { result } = renderHook(() => useSpeechSynthesis("openai"));
    await act(async () => {
      await result.current.speak("Halo");
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it("server provider fetches audio and plays it", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    let srcUsed = "";
    (globalThis as any).Audio = vi.fn().mockImplementation((src: string) => {
      srcUsed = src;
      return { play, pause: vi.fn(), onplay: null, onended: null, onerror: null };
    });
    vi.spyOn(api, "ttsSpeak").mockResolvedValue({ audio: "QUJD", mime: "audio/mpeg" });

    const { result } = renderHook(() => useSpeechSynthesis("google"));
    await act(async () => {
      await result.current.speak("Halo");
    });

    await waitFor(() => expect(api.ttsSpeak).toHaveBeenCalledWith("Halo"));
    expect(play).toHaveBeenCalled();
    expect(srcUsed).toBe("data:audio/mpeg;base64,QUJD");
    // browser API is not used for a server provider
    expect((window as any).speechSynthesis.speak).not.toHaveBeenCalled();
  });
});
