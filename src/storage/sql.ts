export type SqlValue = string | number | null;

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  signed_at TEXT,
  signed_by TEXT,
  sign_off_statement TEXT,
  active_section TEXT,
  section_lock_source TEXT,
  recording_mode TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS utterances (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  authored_text TEXT NOT NULL,
  normalization_json TEXT,
  normalization_decision TEXT NOT NULL,
  section TEXT NOT NULL,
  section_source TEXT NOT NULL,
  section_confirmed INTEGER NOT NULL,
  auto_section TEXT,
  auto_keywords_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  confidence REAL,
  audio_uri TEXT,
  audio_start_ms INTEGER,
  audio_end_ms INTEGER,
  source_photo_id TEXT,
  transcription_status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  caption TEXT NOT NULL,
  ocr_text TEXT,
  ocr_engine TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ocr_suggestions (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  evidence TEXT NOT NULL,
  decision TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  command_id TEXT,
  notification_id TEXT
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  spoken TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  kind TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
