import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpeechRecognition } from "./useSpeechRecognition.js";
import * as api from "../api.js";

class FakeRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

let last: FakeRecognition;

beforeEach(() => {
  (window as any).SpeechRecognition = vi.fn(() => (last = new FakeRecognition()));
});
afterEach(() => {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

describe("useSpeechRecognition", () => {
  it("reports supported and lang id-ID", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(last.lang).toBe("id-ID");
    expect(result.current.listening).toBe(true);
  });

  it("accumulates final results into transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => {
      last.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: "halo" }], { isFinal: true }),
        ],
      });
    });
    expect(result.current.transcript).toBe("halo");
  });

  it("reports unsupported when no API present", () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
  });
});

// --- Whisper (server-side) mode -------------------------------------------

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";
  constructor(public stream: any) {
    FakeRecorder.instances.push(this);
  }
  start = vi.fn();
  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: "audio/webm" }) });
    this.onstop?.();
  });
}

describe("useSpeechRecognition — whisper", () => {
  const tracks = [{ stop: vi.fn() }];

  beforeEach(() => {
    FakeRecorder.instances = [];
    (window as any).MediaRecorder = FakeRecorder;
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })),
    };
  });
  afterEach(() => {
    delete (window as any).MediaRecorder;
    vi.restoreAllMocks();
  });

  it("is supported through MediaRecorder even without the browser SpeechRecognition API", () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition("whisper"));
    expect(result.current.supported).toBe(true);
  });

  it("records, uploads on stop, and fills the transcript with what came back", async () => {
    const send = vi.spyOn(api, "sttTranscribe").mockResolvedValue("Metode saya kuantitatif.");
    const { result } = renderHook(() => useSpeechRecognition("whisper"));

    await act(async () => {
      result.current.start();
    });
    expect(result.current.listening).toBe(true);

    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.transcript).toBe("Metode saya kuantitatif."));
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.listening).toBe(false);
    expect(result.current.transcribing).toBe(false);
    expect(tracks[0].stop).toHaveBeenCalled(); // mic released
  });

  it("surfaces a transcription failure instead of dropping the answer silently", async () => {
    vi.spyOn(api, "sttTranscribe").mockRejectedValue(new Error("API key STT belum diisi"));
    const { result } = renderHook(() => useSpeechRecognition("whisper"));

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.error).toMatch(/API key STT/));
    expect(result.current.transcribing).toBe(false);
  });
});
