export interface User { id: number; username: string; }
export type Role = "examiner" | "user";
export interface Turn { role: Role; content: string; }
export interface ExaminerMode {
  value: string;
  label: string;
}
export type ExaminerType = ExaminerMode;
export interface SettingsView {
  provider: string;
  model: string;
  has_api_key: boolean;
  attack_points: string;
  examiner_mode: string;
  examiner_modes: ExaminerMode[];
  examiner_type: string;
  examiner_types: ExaminerType[];
  tts_provider: string;
  tts_voice: string;
  has_google_tts_key: boolean;
  has_openai_tts_key: boolean;
  stt_provider: string;
  has_openai_stt_key: boolean;
}
export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  calls: number;
}
export interface UsageView {
  total: UsageTotals;
  by_kind: { kind: string; totals: UsageTotals }[];
  since: string | null;
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
export interface TestResult {
  ok: boolean;
  error?: string;
}
export interface SkripsiInfo {
  filename: string;
  char_count: number;
  uploaded_at: string;
}
export interface SessionSummary {
  id: string;
  created_at: string;
  label: string | null;
  turn_count: number;
  status: string;
  final_score: number | null;
}
export interface Assessment {
  scores: {
    penguasaan_materi: number;
    metodologi: number;
    kualitas_orisinalitas: number;
    argumentasi: number;
  };
  final_score: number;
  grade: string;
  verdict: string;
  ringkasan: string;
  kelebihan: string[];
  kekurangan: string[];
  saran: string[];
}
