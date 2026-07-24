import { useCallback, useRef, useState } from "react";

type SR = typeof window & {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
};

export function useSpeechRecognition() {
  const w = window as SR;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const supported = Boolean(Ctor);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);
  const finalRef = useRef("");

  const start = useCallback(() => {
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

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
  }, []);

  return { supported, listening, transcript, start, stop, reset };
}
