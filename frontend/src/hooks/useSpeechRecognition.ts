import { useCallback, useEffect, useRef, useState } from "react";
import { sttTranscribe } from "../api.js";

type SR = typeof window & {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
};

// Container the browser will actually give us. Chrome/Firefox record WebM,
// Safari MP4; OpenAI picks its decoder from the extension, so both must be
// named correctly on upload.
function fileNameFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "answer.mp4";
  if (mimeType.includes("ogg")) return "answer.ogg";
  return "answer.webm";
}

/**
 * Dictation for the answer box. `browser` transcribes live with the on-device
 * Web Speech API; `whisper` records the answer and has the backend transcribe
 * it with OpenAI once the student stops — no interim text, but far better
 * accuracy for Indonesian.
 */
export function useSpeechRecognition(provider: string = "browser") {
  const isWhisper = provider === "whisper";
  const w = window as SR;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const recorderSupported =
    typeof window !== "undefined" &&
    typeof (window as any).MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const supported = isWhisper ? recorderSupported : Boolean(Ctor);

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");
  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // A session left mid-recording must not keep the mic light on.
  useEffect(() => releaseMic, [releaseMic]);

  const startBrowser = useCallback(() => {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += chunk + " ";
        else interim += chunk;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    finalRef.current = "";
    setTranscript("");
    rec.start();
    setListening(true);
  }, [Ctor]);

  const startWhisper = useCallback(async () => {
    if (!recorderSupported) return;
    setError(null);
    setTranscript("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new (window as any).MediaRecorder(stream);
      rec.ondataavailable = (e: any) => {
        if (e.data?.size !== 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        releaseMic();
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          setTranscript(await sttTranscribe(blob, fileNameFor(type)));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch (e) {
      releaseMic();
      setError(
        (e as Error)?.name === "NotAllowedError"
          ? "Akses mikrofon ditolak — izinkan mikrofon di browser."
          : (e as Error).message,
      );
    }
  }, [recorderSupported, releaseMic]);

  // Stays synchronous for both providers: callers fire it from a click handler
  // and read `listening` / `transcribing` for progress.
  const start = useCallback(() => {
    if (isWhisper) {
      void startWhisper();
      return;
    }
    startBrowser();
  }, [isWhisper, startWhisper, startBrowser]);

  const stop = useCallback(() => {
    if (isWhisper) {
      // The upload happens in onstop, once the last chunk has landed.
      recorderRef.current?.stop();
      recorderRef.current = null;
    } else {
      recRef.current?.stop();
    }
    setListening(false);
  }, [isWhisper]);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setError(null);
  }, []);

  return { supported, listening, transcribing, transcript, error, start, stop, reset };
}
