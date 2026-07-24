import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "./useSpeechRecognition.js";

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
