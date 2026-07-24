import { useCallback } from "react";

export function useSpeechSynthesis() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "id-ID";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, cancel };
}
