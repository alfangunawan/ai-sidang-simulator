export interface Turn {
  role: "examiner" | "user";
  content: string;
}

export interface LLMResult {
  reply: string;
  usage?: Record<string, number>;
}

export interface LLMProvider {
  sendTurn(
    personaAttack: string,
    skripsi: string,
    history: Turn[],
    userInput: string,
  ): Promise<LLMResult>;
  // Lightweight auth/connection check. Resolves on success, throws on failure.
  checkAuth(): Promise<void>;
}
