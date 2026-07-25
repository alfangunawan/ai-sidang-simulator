export type Role = "examiner" | "user";
export interface Turn { role: Role; content: string; }
export interface ExaminerMode {
  value: string;
  label: string;
}
export interface SettingsView {
  provider: string;
  model: string;
  has_api_key: boolean;
  attack_points: string;
  examiner_mode: string;
  examiner_modes: ExaminerMode[];
  tts_provider: string;
  tts_voice: string;
  has_google_tts_key: boolean;
  has_openai_tts_key: boolean;
}
export interface TtsVoice {
  name: string;
  type: string;
  gender?: string;
}
export interface TtsAudio {
  audio: string;
  mime: string;
}
export interface SkripsiInfo {
  filename: string;
  char_count: number;
  uploaded_at: string;
}
