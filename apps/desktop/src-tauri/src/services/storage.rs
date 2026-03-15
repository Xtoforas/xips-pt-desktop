use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, Result as SqlResult};
use uuid::Uuid;

use crate::db::INITIAL_MIGRATION_SQL;
use crate::models::api::TournamentFormat;
use crate::models::local_state::{
  AddDiagnosticEventInput, AddWatchRootInput, DesktopPreferences, DesktopSnapshot, LocalDetectedFile,
  LocalDiagnosticEvent, LocalFormatRule, LocalServerProfile, LocalUploadAttempt, LocalUploadJob, LocalWatchRoot,
  SaveFormatRuleInput, SaveServerProfileInput, SessionUser, UpdatePreferencesInput,
};
use crate::services::scanner::{FormatRuleMatch, ScanResult};

fn now_iso() -> String {
  let now = std::time::SystemTime::now();
  let datetime = chrono_like::to_iso_string(now);
  datetime
}

pub fn ensure_db(db_path: &Path) -> Result<(), String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
  migrate(&connection).map_err(|error| error.to_string())
}

pub fn open_db(db_path: &Path) -> Result<Connection, String> {
  Connection::open(db_path).map_err(|error| error.to_string())
}

fn migrate(connection: &Connection) -> SqlResult<()> {
  connection.execute_batch(INITIAL_MIGRATION_SQL)
}

pub fn load_snapshot(db_path: &Path) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  let profiles = load_profiles(&connection)?;
  let selected_profile_id = load_setting(&connection, "selected_profile_id")?;
  let auth_user = load_auth_user(&connection)?;
  let token_expires_at = auth_user
    .as_ref()
    .map(|_| load_setting(&connection, "token_expires_at"))
    .transpose()?
    .unwrap_or_default();
  let watch_roots = load_watch_roots(&connection)?;
  let format_rules = load_format_rules(&connection)?;
  let detected_files = load_detected_files(&connection)?;
  let upload_jobs = load_upload_jobs(&connection)?;
  let upload_attempts = load_upload_attempts(&connection)?;
  let preferences = load_preferences(&connection)?;
  let diagnostics = load_diagnostics(&connection)?;
  let cached_formats = load_cached_formats(&connection)?;

  Ok(DesktopSnapshot {
    profiles,
    selected_profile_id,
    auth_user,
    token_expires_at,
    watch_roots,
    format_rules,
    detected_files,
    upload_jobs,
    upload_attempts,
    preferences,
    diagnostics,
    cached_formats,
  })
}

pub fn save_server_profile(db_path: &Path, input: SaveServerProfileInput) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  let profile_id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
  let now = now_iso();
  let existing_created_at = connection
    .query_row(
      "SELECT created_at FROM server_profiles WHERE profile_id = ?1",
      params![profile_id],
      |row| row.get::<_, String>(0),
    )
    .ok();
  let created_at = existing_created_at.unwrap_or_else(|| now.clone());
  connection
    .execute(
      "
      INSERT INTO server_profiles (profile_id, profile_name, base_url, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(profile_id) DO UPDATE SET
        profile_name = excluded.profile_name,
        base_url = excluded.base_url,
        updated_at = excluded.updated_at
      ",
      params![profile_id, input.name.trim(), normalize_base_url(&input.base_url), created_at, now],
    )
    .map_err(|error| error.to_string())?;
  save_setting(&connection, "selected_profile_id", &profile_id).map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn delete_server_profile(db_path: &Path, profile_id: &str) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute("DELETE FROM server_profiles WHERE profile_id = ?1", params![profile_id])
    .map_err(|error| error.to_string())?;
  connection
    .execute("DELETE FROM watch_roots WHERE profile_id = ?1", params![profile_id])
    .map_err(|error| error.to_string())?;
  let selected_profile_id = load_setting(&connection, "selected_profile_id").map_err(|error| error.to_string())?;
  if selected_profile_id == profile_id {
    save_setting(&connection, "selected_profile_id", "").map_err(|error| error.to_string())?;
  }
  load_snapshot(db_path)
}

pub fn select_server_profile(db_path: &Path, profile_id: &str) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  save_setting(&connection, "selected_profile_id", profile_id).map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn add_watch_root(db_path: &Path, input: AddWatchRootInput) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  let watch_root_id = Uuid::new_v4().to_string();
  let now = now_iso();
  connection
    .execute(
      "
      INSERT INTO watch_roots (watch_root_id, profile_id, path, recursive, paused, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)
      ",
      params![
        watch_root_id,
        input.profile_id,
        input.path.trim(),
        if input.recursive { 1 } else { 0 },
        now,
        now
      ],
    )
    .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn save_format_rule(db_path: &Path, input: SaveFormatRuleInput) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  let format_rule_id = Uuid::new_v4().to_string();
  let now = now_iso();
  connection
    .execute(
      "
      INSERT INTO format_rules (
        format_rule_id,
        profile_id,
        watch_root_id,
        match_type,
        pattern,
        format_id,
        format_name,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ",
      params![
        format_rule_id,
        input.profile_id,
        input.watch_root_id,
        input.match_type,
        input.pattern.trim(),
        input.format_id,
        input.format_name,
        now,
        now
      ],
    )
    .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn delete_format_rule(db_path: &Path, format_rule_id: &str) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute("DELETE FROM format_rules WHERE format_rule_id = ?1", params![format_rule_id])
    .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn delete_watch_root(db_path: &Path, watch_root_id: &str) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute("DELETE FROM watch_roots WHERE watch_root_id = ?1", params![watch_root_id])
    .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn toggle_watch_root(db_path: &Path, watch_root_id: &str, paused: bool) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute(
      "UPDATE watch_roots SET paused = ?2, updated_at = ?3 WHERE watch_root_id = ?1",
      params![watch_root_id, if paused { 1 } else { 0 }, now_iso()],
    )
    .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn update_preferences(db_path: &Path, input: UpdatePreferencesInput) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  save_setting(
    &connection,
    "preferences_json",
    &serde_json::to_string(&DesktopPreferences {
      launch_at_login: input.launch_at_login,
      close_to_tray: input.close_to_tray,
      polling_interval_seconds: input.polling_interval_seconds,
      diagnostics_retention_days: input.diagnostics_retention_days,
    })
    .map_err(|error| error.to_string())?,
  )
  .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn assign_detected_file_format(
  db_path: &Path,
  detected_file_id: &str,
  format_id: &str,
) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute(
      "
      UPDATE detected_files
      SET format_id = ?2,
          local_state = 'queued_local',
          updated_at = ?3
      WHERE detected_file_id = ?1
      ",
      params![detected_file_id, format_id, now_iso()],
    )
    .map_err(|error| error.to_string())?;

  let row = connection
    .query_row(
      "SELECT profile_id, path FROM detected_files WHERE detected_file_id = ?1 LIMIT 1",
      params![detected_file_id],
      |result| Ok((result.get::<_, String>(0)?, result.get::<_, String>(1)?)),
    )
    .map_err(|error| error.to_string())?;

  connection
    .execute(
      "
      UPDATE upload_jobs
      SET format_id = ?3,
          local_state = 'queued_local',
          updated_at = ?4
      WHERE profile_id = ?1
        AND path = ?2
      ",
      params![row.0, row.1, format_id, now_iso()],
    )
    .map_err(|error| error.to_string())?;

  load_snapshot(db_path)
}

pub fn list_watch_roots_for_profile(db_path: &Path, profile_id: &str) -> Result<Vec<LocalWatchRoot>, String> {
  let connection = open_db(db_path)?;
  let watch_roots = load_watch_roots(&connection)?;
  Ok(watch_roots.into_iter().filter(|root| root.profile_id == profile_id).collect())
}

pub fn list_format_rule_matches_for_profile(db_path: &Path, profile_id: &str) -> Result<Vec<FormatRuleMatch>, String> {
  let connection = open_db(db_path)?;
  let rules = load_format_rules(&connection)?;
  Ok(
    rules
      .into_iter()
      .filter(|rule| rule.profile_id == profile_id)
      .map(|rule| FormatRuleMatch {
        watch_root_id: rule.watch_root_id,
        match_type: rule.match_type,
        pattern: rule.pattern,
        format_id: rule.format_id,
      })
      .collect(),
  )
}

pub fn save_scan_results(
  db_path: &Path,
  profile_id: &str,
  rows: &[ScanResult],
) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  connection
    .execute("DELETE FROM detected_files WHERE profile_id = ?1", params![profile_id])
    .map_err(|error| error.to_string())?;
  connection
    .execute("DELETE FROM upload_jobs WHERE profile_id = ?1", params![profile_id])
    .map_err(|error| error.to_string())?;

  for row in rows {
    let now = now_iso();
    let detected_file_id = Uuid::new_v4().to_string();
    connection
      .execute(
        "
        INSERT INTO detected_files (
          detected_file_id,
          profile_id,
          watch_root_id,
          path,
          filename,
          file_kind,
          checksum,
          local_state,
          format_id,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ",
        params![
          detected_file_id,
          profile_id,
          row.watch_root_id,
          row.path,
          row.filename,
          row.file_kind,
          row.checksum,
          row.local_state,
          row.format_id,
          now,
          now
        ],
      )
      .map_err(|error| error.to_string())?;

    let upload_job_id = Uuid::new_v4().to_string();
    connection
      .execute(
        "
        INSERT INTO upload_jobs (
          upload_job_id,
          profile_id,
          filename,
          path,
          file_kind,
          local_state,
          lifecycle_phase,
          checksum,
          format_id,
          upload_id,
          error,
          retries,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, '', '', 0, ?9, ?10)
        ",
        params![
          upload_job_id,
          profile_id,
          row.filename,
          row.path,
          row.file_kind,
          row.local_state,
          row.checksum,
          row.format_id,
          now,
          now
        ],
      )
      .map_err(|error| error.to_string())?;
  }

  load_snapshot(db_path)
}

pub fn add_diagnostic_event(db_path: &Path, event: AddDiagnosticEventInput) -> Result<DesktopSnapshot, String> {
  let connection = open_db(db_path)?;
  insert_diagnostic_event(
    &connection,
    &event.level,
    &event.category,
    &event.message,
    &event.detail,
  )
  .map_err(|error| error.to_string())?;
  load_snapshot(db_path)
}

pub fn cache_formats(db_path: &Path, formats: &[TournamentFormat]) -> Result<(), String> {
  let connection = open_db(db_path)?;
  connection
    .execute("DELETE FROM cached_formats", [])
    .map_err(|error| error.to_string())?;
  let cached_at = now_iso();
  for format in formats {
    let payload_json = serde_json::to_string(format).map_err(|error| error.to_string())?;
    connection
      .execute(
        "INSERT INTO cached_formats (format_id, payload_json, cached_at) VALUES (?1, ?2, ?3)",
        params![format.id, payload_json, cached_at],
      )
      .map_err(|error| error.to_string())?;
  }
  Ok(())
}

pub fn write_diagnostic_event(
  db_path: &Path,
  level: &str,
  category: &str,
  message: &str,
  detail: &str,
) -> Result<(), String> {
  let connection = open_db(db_path)?;
  insert_diagnostic_event(&connection, level, category, message, detail).map_err(|error| error.to_string())
}

pub fn load_profile_base_url(db_path: &Path, profile_id: &str) -> Result<PathBuf, String> {
  let connection = open_db(db_path)?;
  let base_url = connection
    .query_row(
      "SELECT base_url FROM server_profiles WHERE profile_id = ?1",
      params![profile_id],
      |row| row.get::<_, String>(0),
    )
    .map_err(|error| error.to_string())?;
  Ok(PathBuf::from(base_url))
}

fn load_profiles(connection: &Connection) -> Result<Vec<LocalServerProfile>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT profile_id, profile_name, base_url, created_at, updated_at
      FROM server_profiles
      ORDER BY updated_at DESC, profile_name ASC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalServerProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalServerProfile>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_watch_roots(connection: &Connection) -> Result<Vec<LocalWatchRoot>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT watch_root_id, profile_id, path, recursive, paused, created_at, updated_at
      FROM watch_roots
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalWatchRoot {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        path: row.get(2)?,
        recursive: row.get::<_, i64>(3)? == 1,
        paused: row.get::<_, i64>(4)? == 1,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalWatchRoot>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_format_rules(connection: &Connection) -> Result<Vec<LocalFormatRule>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT format_rule_id, profile_id, watch_root_id, match_type, pattern, format_id, format_name, created_at, updated_at
      FROM format_rules
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalFormatRule {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        watch_root_id: row.get(2)?,
        match_type: row.get(3)?,
        pattern: row.get(4)?,
        format_id: row.get(5)?,
        format_name: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalFormatRule>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_detected_files(connection: &Connection) -> Result<Vec<LocalDetectedFile>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT detected_file_id, profile_id, watch_root_id, path, filename, file_kind, checksum, local_state, format_id, created_at, updated_at
      FROM detected_files
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalDetectedFile {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        watch_root_id: row.get(2)?,
        path: row.get(3)?,
        filename: row.get(4)?,
        file_kind: row.get(5)?,
        checksum: row.get(6)?,
        local_state: row.get(7)?,
        format_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalDetectedFile>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_upload_jobs(connection: &Connection) -> Result<Vec<LocalUploadJob>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT upload_job_id, profile_id, filename, path, file_kind, local_state, lifecycle_phase, checksum, format_id, upload_id, error, retries, created_at, updated_at
      FROM upload_jobs
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalUploadJob {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        filename: row.get(2)?,
        path: row.get(3)?,
        file_kind: row.get(4)?,
        local_state: row.get(5)?,
        lifecycle_phase: row.get(6)?,
        checksum: row.get(7)?,
        format_id: row.get(8)?,
        upload_id: row.get(9)?,
        error: row.get(10)?,
        retries: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalUploadJob>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_upload_attempts(connection: &Connection) -> Result<Vec<LocalUploadAttempt>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT upload_attempt_id, upload_job_id, attempt_number, status, detail, created_at, updated_at
      FROM upload_attempts
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalUploadAttempt {
        id: row.get(0)?,
        upload_job_id: row.get(1)?,
        attempt_number: row.get(2)?,
        status: row.get(3)?,
        detail: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalUploadAttempt>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_diagnostics(connection: &Connection) -> Result<Vec<LocalDiagnosticEvent>, String> {
  let mut statement = connection
    .prepare(
      "
      SELECT event_id, level, category, message, detail, created_at
      FROM diagnostic_events
      ORDER BY created_at DESC
      LIMIT 100
      ",
    )
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      Ok(LocalDiagnosticEvent {
        id: row.get(0)?,
        level: row.get(1)?,
        category: row.get(2)?,
        message: row.get(3)?,
        detail: row.get(4)?,
        created_at: row.get(5)?,
      })
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<LocalDiagnosticEvent>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_auth_user(connection: &Connection) -> Result<Option<SessionUser>, String> {
  let row = connection
    .query_row(
      "
      SELECT user_id, discord_id, display_name, role
      FROM auth_state
      ORDER BY updated_at DESC
      LIMIT 1
      ",
      [],
      |row| {
        Ok(SessionUser {
          user_id: row.get(0)?,
          discord_id: row.get(1)?,
          display_name: row.get(2)?,
          role: row.get(3)?,
        })
      },
    )
    .ok();
  Ok(row)
}

fn load_cached_formats(connection: &Connection) -> Result<Vec<TournamentFormat>, String> {
  let mut statement = connection
    .prepare("SELECT payload_json FROM cached_formats ORDER BY format_id ASC")
    .map_err(|error| error.to_string())?;
  let mapped = statement
    .query_map([], |row| {
      let payload_json: String = row.get(0)?;
      let parsed = serde_json::from_str::<TournamentFormat>(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
          payload_json.len(),
          rusqlite::types::Type::Text,
          Box::new(error),
        )
      })?;
      Ok(parsed)
    })
    .map_err(|error| error.to_string())?;
  let rows = mapped.collect::<SqlResult<Vec<TournamentFormat>>>().map_err(|error| error.to_string())?;
  Ok(rows)
}

fn load_setting(connection: &Connection, key: &str) -> Result<String, String> {
  let value = connection
    .query_row(
      "SELECT setting_value FROM app_settings WHERE setting_key = ?1",
      params![key],
      |row| row.get::<_, String>(0),
    )
    .unwrap_or_default();
  Ok(value)
}

fn load_preferences(connection: &Connection) -> Result<DesktopPreferences, String> {
  let raw = load_setting(connection, "preferences_json")?;
  if raw.is_empty() {
    return Ok(DesktopPreferences {
      launch_at_login: false,
      close_to_tray: true,
      polling_interval_seconds: 5,
      diagnostics_retention_days: 14,
    });
  }
  serde_json::from_str::<DesktopPreferences>(&raw).map_err(|error| error.to_string())
}

fn save_setting(connection: &Connection, key: &str, value: &str) -> SqlResult<()> {
  connection.execute(
    "
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES (?1, ?2)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    ",
    params![key, value],
  )?;
  Ok(())
}

fn normalize_base_url(value: &str) -> String {
  value.trim_end_matches('/').trim().to_string()
}

fn insert_diagnostic_event(
  connection: &Connection,
  level: &str,
  category: &str,
  message: &str,
  detail: &str,
) -> SqlResult<()> {
  connection.execute(
    "
    INSERT INTO diagnostic_events (event_id, level, category, message, detail, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ",
    params![Uuid::new_v4().to_string(), level, category, message, detail, now_iso()],
  )?;
  Ok(())
}

mod chrono_like {
  pub fn to_iso_string(time: std::time::SystemTime) -> String {
    let duration = time
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_else(|_| std::time::Duration::from_secs(0));
    let secs = duration.as_secs() as i64;
    let nanos = duration.subsec_nanos();
    let datetime = time_format::DateTime::from_unix(secs, nanos);
    datetime.to_iso_string()
  }

  mod time_format {
    pub struct DateTime {
      year: i32,
      month: u32,
      day: u32,
      hour: u32,
      minute: u32,
      second: u32,
      millis: u32,
    }

    impl DateTime {
      pub fn from_unix(secs: i64, nanos: u32) -> Self {
        let days = secs.div_euclid(86_400);
        let seconds_of_day = secs.rem_euclid(86_400) as u32;
        let (year, month, day) = civil_from_days(days);
        Self {
          year,
          month,
          day,
          hour: seconds_of_day / 3_600,
          minute: (seconds_of_day % 3_600) / 60,
          second: seconds_of_day % 60,
          millis: nanos / 1_000_000,
        }
      }

      pub fn to_iso_string(&self) -> String {
        format!(
          "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
          self.year, self.month, self.day, self.hour, self.minute, self.second, self.millis
        )
      }
    }

    fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
      let z = days_since_epoch + 719_468;
      let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
      let doe = z - era * 146_097;
      let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
      let year = yoe as i32 + era as i32 * 400;
      let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
      let mp = (5 * doy + 2) / 153;
      let day = doy - (153 * mp + 2) / 5 + 1;
      let month = mp + if mp < 10 { 3 } else { -9 };
      let year = year + if month <= 2 { 1 } else { 0 };
      (year, month as u32, day as u32)
    }
  }
}
