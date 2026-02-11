export interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  count: number;
  duration_seconds: number;
  created_at: string;
}

export interface DailyRecord {
  date: string;
  total_count: number;
  total_duration_seconds: number;
  session_count: number;
}

export interface MonthlyRecord {
  month: string;
  total_count: number;
  total_duration_seconds: number;
  days_active: number;
}

export interface Goal {
  id: string;
  daily_target: number;
  is_active: boolean;
  created_at: string;
}

export interface ActiveSession {
  isRunning: boolean;
  isListening: boolean;
  count: number;
  startTime: number | null;
  elapsedSeconds: number;
}
