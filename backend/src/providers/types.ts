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
}
