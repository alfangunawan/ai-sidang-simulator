import { useCallback, useEffect, useRef } from "react";

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

/**
 * When `active`, opens the microphone and exposes `getLevel()` returning the
 * current input amplitude in [0, 1]. Tears everything down when inactive or on
 * unmount. In environments without getUserMedia / AudioContext (e.g. jsdom) it
 * is a no-op and `getLevel()` returns 0.
 */
export function useAudioLevel(active: boolean): {
  supported: boolean;
  getLevel: () => number;
} {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!getAudioCtor();

  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;

    const AudioCtorFn = getAudioCtor()!;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const ctx = new AudioCtorFn();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        streamRef.current = stream;
      })
      .catch(() => {
        // permission denied or no device — viz falls back to synthetic
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
      analyserRef.current = null;
      dataRef.current = null;
      ctxRef.current = null;
      streamRef.current = null;
    };
  }, [active, supported]);

  const getLevel = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return 0;
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255; // 0..1
    return Math.min(1, avg * 1.8); // boost so quiet speech is visible
  }, []);

  return { supported, getLevel };
}
