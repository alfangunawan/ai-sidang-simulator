import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { VoiceVisualizer } from "./VoiceVisualizer.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";

// jsdom can't render canvas; stub getContext to null (component guards on it)
// so we avoid the "Not implemented" console noise and keep output pristine.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("VoiceVisualizer", () => {
  it("renders a canvas and the state label without crashing", () => {
    render(<VoiceVisualizer state="speaking" getLevel={() => 0.5} />);
    expect(document.querySelector("canvas")).toBeTruthy();
    expect(screen.getByText("Penguji bicara…")).toBeTruthy();
  });

  it("renders idle with no label", () => {
    render(<VoiceVisualizer state="idle" getLevel={() => 0} />);
    expect(document.querySelector("canvas")).toBeTruthy();
    expect(screen.queryByText("Mendengarkan…")).toBeNull();
  });
});

describe("useAudioLevel", () => {
  it("reports unsupported and level 0 when no mic API is present (jsdom)", () => {
    const { result } = renderHook(() => useAudioLevel(false));
    expect(result.current.supported).toBe(false);
    expect(result.current.getLevel()).toBe(0);
  });

  it("does not throw when active with no mic API", () => {
    expect(() => renderHook(() => useAudioLevel(true))).not.toThrow();
  });
});
