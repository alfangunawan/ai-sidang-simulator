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
}
export interface SkripsiInfo {
  filename: string;
  char_count: number;
  uploaded_at: string;
}
