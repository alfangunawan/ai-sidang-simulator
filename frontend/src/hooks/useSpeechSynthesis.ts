import { useCallback, useEffect, useRef, useState } from "react";
import { ttsSpeak } from "../api.js";

// Voices the examiner's replies. `browser` uses the on-device Web Speech API;
// `google` / `openai` fetch synthesized audio from the backend and play it.
export function useSpeechSynthesis(provider: string = "browser") {
  const browserSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest provider without re-creating the stable callbacks.
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Hold the current utterance so it is not garbage-collected mid-speech —
  // a Chrome bug that otherwise cuts audio off or drops it entirely.
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Warm up the voice list so the first utterance has an id-ID voice available.
  useEffect(() => {
    if (!browserSupported) return;
    const synth = window.speechSynthesis;
    synth.getVoices?.();
    const noop = () => {};
    synth.addEventListener?.("voiceschanged", noop);
    return () => synth.removeEventListener?.("voiceschanged", noop);
  }, [browserSupported]);

  const stopAll = useCallback(() => {
    if (browserSupported) {
      const synth = window.speechSynthesis;
      // Only cancel when something is actually playing/queued. Calling cancel()
      // right before speak() while idle can drop the next utterance.
      if (synth.speaking || synth.pending) synth.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [browserSupported]);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      setError(null);
      stopAll();

      if (providerRef.current === "browser") {
        if (!browserSupported) return;
        const synth = window.speechSynthesis;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "id-ID";
        const voice = pickIndonesianVoice(synth);
        if (voice) u.voice = voice;
        u.onstart = () => setSpeaking(true);
        u.onend = () => {
          setSpeaking(false);
          utterRef.current = null;
        };
        u.onerror = () => {
          setSpeaking(false);
          utterRef.current = null;
        };
        utterRef.current = u;
        synth.speak(u);
        return;
      }

      // Server-side provider (google / openai).
      setPreparing(true);
      let clip: { audio: string; mime: string };
      try {
        clip = await ttsSpeak(text);
      } catch (e) {
        // Synthesis itself failed — report what the server actually said
        // instead of always blaming the API key.
        setPreparing(false);
        setSpeaking(false);
        setError(`Suara gagal disiapkan — ${(e as Error).message}`);
        return;
      }

      const el = new Audio(`data:${clip.mime};base64,${clip.audio}`);
      audioRef.current = el;
      el.onplay = () => {
        setSpeaking(true);
        setPreparing(false);
      };
      el.onended = () => setSpeaking(false);
      el.onerror = () => {
        setSpeaking(false);
        setPreparing(false);
        setError("Audio gagal diputar.");
      };
      try {
        await el.play();
      } catch (e) {
        setPreparing(false);
        setSpeaking(false);
        // A play() rejection is a browser/playback problem, never a TTS key
        // problem: autoplay policy blocks it, or a newer reply interrupted it.
        if ((e as Error)?.name === "AbortError") return;
        setError(
          (e as Error)?.name === "NotAllowedError"
            ? "Browser memblokir pemutaran otomatis — klik halaman ini sekali, lalu suara akan berjalan."
            : "Audio gagal diputar.",
        );
      }
    },
    [browserSupported, stopAll],
  );

  const cancel = useCallback(() => {
    stopAll();
    setSpeaking(false);
    setPreparing(false);
  }, [stopAll]);

  return { supported: browserSupported, speaking, preparing, error, speak, cancel };
}

// Prefer an exact id-ID voice, then any Indonesian variant, else null (the
// browser falls back to its default for the utterance's lang).
function pickIndonesianVoice(
  synth: SpeechSynthesis,
): SpeechSynthesisVoice | null {
  if (!synth.getVoices) return null;
  const voices = synth.getVoices();
  return (
    voices.find((v) => v.lang === "id-ID") ??
    voices.find((v) => v.lang?.replace("_", "-").toLowerCase().startsWith("id")) ??
    null
  );
}
