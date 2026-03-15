CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_profiles (
  profile_id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_roots (
  watch_root_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  path TEXT NOT NULL,
  recursive INTEGER NOT NULL,
  paused INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  upload_job_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  local_state TEXT NOT NULL,
  lifecycle_phase TEXT,
  checksum TEXT NOT NULL,
  format_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  error TEXT NOT NULL,
  retries INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_events (
  event_id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_formats (
  format_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL
);
