export interface TtsResult {
  audio: string; // base64-encoded audio bytes
  mime: string;
}

export interface TtsVoice {
  name: string;
  type: string; // e.g. "Chirp3-HD", "Neural2", "Wavenet", "Standard", "OpenAI"
  gender?: string;
}

export interface TtsConfig {
  provider: string;
  voice: string;
  apiKey: string;
  model?: string;
}
