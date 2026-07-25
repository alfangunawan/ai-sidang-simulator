import { useCallback, useRef, useState } from "react";
import { ttsSpeak } from "../api.js";

// Voices the examiner's replies. `browser` uses the on-device Web Speech API;
// `google` / `openai` fetch synthesized audio from the backend and play it.
export function useSpeechSynthesis(provider: string = "browser") {
  const browserSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);

  // Keep the latest provider without re-creating the stable callbacks.
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAll = useCallback(() => {
    if (browserSupported) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [browserSupported]);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      stopAll();

      if (providerRef.current === "browser") {
        if (!browserSupported) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "id-ID";
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
        return;
      }

      // Server-side provider (google / openai).
      try {
        const { audio, mime } = await ttsSpeak(text);
        const el = new Audio(`data:${mime};base64,${audio}`);
        audioRef.current = el;
        el.onplay = () => setSpeaking(true);
        el.onended = () => setSpeaking(false);
        el.onerror = () => setSpeaking(false);
        await el.play();
      } catch {
        // Synthesis failed (no key, provider error) — skip audio silently so the
        // chat is never blocked. The error surfaces via the Settings page.
        setSpeaking(false);
      }
    },
    [browserSupported, stopAll],
  );

  const cancel = useCallback(() => {
    stopAll();
    setSpeaking(false);
  }, [stopAll]);

  return { supported: browserSupported, speaking, speak, cancel };
}
