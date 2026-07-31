export interface User { id: number; username: string; is_admin: boolean; }
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
  base_url: string;
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
  effective_provider?: string;
  effective_model?: string;
  effective_base_url?: string;
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
export type DossierStatus = "pending" | "ready" | "failed";
export interface SkripsiInfo {
  filename: string;
  char_count: number;
  uploaded_at: string;
  chunk_count?: number;
  dossier_status?: DossierStatus | null;
  dossier_error?: string | null;
}
export interface Dossier {
  judul: string;
  rumusan_masalah: string[];
  tujuan: string[];
  batasan: string[];
  metode: { nama: string; justifikasi: string };
  instrumen: string[];
  populasi_sampel: { deskripsi: string; jumlah: number | null };
  hasil_kunci: { klaim: string; angka: string; sumber: string }[];
  kesimpulan: string[];
  keterbatasan: string[];
  peta_bab: { judul: string; halaman_mulai: number | null }[];
  fakta_struktural: {
    jumlah_rumusan_masalah: number;
    jumlah_kesimpulan: number;
    rumusan_tanpa_kesimpulan: string[];
    sitasi_bab2_tidak_di_daftar_pustaka: string[];
    jumlah_tabel: number;
    jumlah_gambar: number;
  };
  modul_kritik_terpicu: string[];
  poin_serangan: string[];
}
export interface DossierView {
  status: DossierStatus | null;
  error: string | null;
  model: string | null;
  dossier: Dossier | null;
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
export interface AdminOverview {
  users: number;
  sessions: number;
  documents: number;
  turns: number;
  cost_usd: number;
  tokens: number;
  top_spenders: { user_id: number; username: string; cost_usd: number; tokens: number }[];
  signups: { day: string; count: number }[];
}
export interface AdminUserRow {
  id: number;
  username: string;
  created_at: string;
  suspended: boolean;
  is_admin: boolean;
  sessions: number;
  documents: number;
  cost_usd: number;
  tokens: number;
  key_owner: string | null;
}
export interface AdminUserDetail {
  user: AdminUserRow;
  settings: SettingsView;
  sessions: { id: string; created_at: string; status: string; turn_count: number }[];
  documents: { id: number; filename: string; char_count: number; dossier_status: string | null }[];
}
export interface AdminSessionRow {
  id: string;
  user_id: number;
  username: string;
  created_at: string;
  status: string;
  label: string | null;
  turn_count: number;
  final_score: number | null;
}
export interface AdminCodeRow {
  id: number;
  host_user_id: number;
  host_username: string;
  invite_code: string;
  created_at: string;
  shares: { share_ai: number; share_tts: number; share_stt: number };
  members: { member_user_id: number; username: string; joined_at: string }[];
  cost_usd: number;
  calls: number;
}
