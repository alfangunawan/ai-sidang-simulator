import type { Turn } from "./providers/types.js";

export function buildSystemText(
  personaAttack: string,
  skripsi: string,
): { persona: string; skripsi: string } {
  return { persona: personaAttack, skripsi };
}

export function mapHistory(
  history: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  return history.map((t) => ({
    role: t.role === "examiner" ? "assistant" : "user",
    content: t.content,
  }));
}
