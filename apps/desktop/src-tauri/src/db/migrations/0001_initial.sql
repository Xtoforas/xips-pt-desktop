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

CREATE TABLE IF NOT EXISTS auth_state (
  auth_state_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS format_rules (
  format_rule_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  watch_root_id TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  format_id TEXT NOT NULL,
  format_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detected_files (
  detected_file_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  watch_root_id TEXT NOT NULL,
  path TEXT NOT NULL,
  staged_path TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  checksum TEXT NOT NULL,
  source_modified_at TEXT NOT NULL DEFAULT '',
  local_state TEXT NOT NULL,
  local_presence TEXT NOT NULL DEFAULT 'present',
  format_id TEXT NOT NULL,
  tournament_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  upload_job_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  staged_path TEXT NOT NULL DEFAULT '',
  file_kind TEXT NOT NULL,
  local_presence TEXT NOT NULL DEFAULT 'present',
  local_state TEXT NOT NULL,
  lifecycle_phase TEXT,
  checksum TEXT NOT NULL,
  source_modified_at TEXT NOT NULL DEFAULT '',
  format_id TEXT NOT NULL,
  tournament_id TEXT NOT NULL DEFAULT '',
  upload_id TEXT NOT NULL,
  server_status TEXT NOT NULL DEFAULT '',
  remote_checksum TEXT NOT NULL DEFAULT '',
  last_request_id TEXT NOT NULL DEFAULT '',
  duplicate_reason TEXT NOT NULL DEFAULT '',
  next_retry_after TEXT NOT NULL DEFAULT '',
  queued_at TEXT NOT NULL DEFAULT '',
  processing_at TEXT NOT NULL DEFAULT '',
  parsed_at TEXT NOT NULL DEFAULT '',
  refreshing_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  failed_at TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL,
  retries INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_attempts (
  upload_attempt_id TEXT PRIMARY KEY,
  upload_job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
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
