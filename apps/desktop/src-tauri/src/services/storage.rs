use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, Result as SqlResult};
use uuid::Uuid;

use crate::db::INITIAL_MIGRATION_SQL;
use crate::models::api::TournamentFormat;
use crate::models::local_state::{
  AddDiagnosticEventInput, AddWatchRootInput, DesktopSnapshot, LocalDiagnosticEvent, LocalServerProfile,
  LocalUploadJob, LocalWatchRoot, SaveServerProfileInput,
};

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
  let token_expires_at = load_setting(&connection, "token_expires_at")?;
  let watch_roots = load_watch_roots(&connection)?;
  let upload_jobs = load_upload_jobs(&connection)?;
  let diagnostics = load_diagnostics(&connection)?;
  let cached_formats = load_cached_formats(&connection)?;

  Ok(DesktopSnapshot {
    profiles,
    selected_profile_id,
    auth_user: None,
    token_expires_at,
    watch_roots,
    upload_jobs,
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
