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
  effective_ai_shared?: boolean;
  effective_tts_shared?: boolean;
  effective_stt_shared?: boolean;
  effective_tts_provider?: string;
  effective_tts_voice?: string;
  effective_stt_provider?: string;
}
export interface CollabMember { member_user_id: number; username: string; joined_at: string; }
export interface CollabShares { share_ai: number; share_tts: number; share_stt: number; }
export interface CollabState {
  hosting: {
    invite_code: string;
    shares: CollabShares;
    members: CollabMember[];
    usage: {
      total: { calls: number; cost_usd?: number };
      by_member: { member_user_id: number; username: string; totals: { calls: number; cost_usd?: number } }[];
    };
  } | null;
  joined: { host_username: string; shares: CollabShares } | null;
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
