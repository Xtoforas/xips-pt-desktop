use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;
use crate::models::api::{ServiceHealth, TournamentFormat};
use crate::models::local_state::{
  AddDiagnosticEventInput, AddWatchRootInput, AssignDetectedFileFormatInput, DesktopSnapshot, SaveFormatRuleInput,
  SaveServerProfileInput, UpdatePreferencesInput,
};
use crate::services::{api_client, scanner, storage};

#[tauri::command]
pub fn desktop_get_snapshot(state: State<'_, AppState>) -> Result<DesktopSnapshot, String> {
  storage::load_snapshot(&state.db_path)
}

#[tauri::command]
pub fn desktop_save_server_profile(
  input: SaveServerProfileInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::save_server_profile(&state.db_path, input.clone())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "storage",
    "Saved server profile",
    &format!("profile_name={},base_url={}", input.name, input.base_url),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_delete_server_profile(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::delete_server_profile(&state.db_path, &profile_id)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "warn",
    "storage",
    "Deleted server profile",
    &format!("profile_id={}", profile_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_select_server_profile(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::select_server_profile(&state.db_path, &profile_id)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "storage",
    "Selected server profile",
    &format!("profile_id={}", profile_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub async fn desktop_check_server_health(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<ServiceHealth, String> {
  let base_url = storage::load_profile_base_url(&state.db_path, &profile_id)?;
  let url = path_to_url(base_url)?;
  let result = api_client::check_health(&url).await;
  match &result {
    Ok(health) => {
      storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "api",
        "Checked server health",
        &format!(
          "profile_id={},ok={},queue_depth={:?},failed_jobs={:?}",
          profile_id, health.ok, health.queue_depth, health.failed_jobs
        ),
      )?;
    }
    Err(error) => {
      storage::write_diagnostic_event(
        &state.db_path,
        "error",
        "api",
        "Server health check failed",
        &format!("profile_id={},reason={}", profile_id, error),
      )?;
    }
  }
  result
}

#[tauri::command]
pub async fn desktop_fetch_formats(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<Vec<TournamentFormat>, String> {
  let base_url = storage::load_profile_base_url(&state.db_path, &profile_id)?;
  let url = path_to_url(base_url)?;
  let result = api_client::fetch_formats(&url).await;
  match &result {
    Ok(formats) => {
      storage::cache_formats(&state.db_path, formats)?;
      storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "api",
        "Fetched formats",
        &format!("profile_id={},count={}", profile_id, formats.len()),
      )?;
    }
    Err(error) => {
      storage::write_diagnostic_event(
        &state.db_path,
        "error",
        "api",
        "Format refresh failed",
        &format!("profile_id={},reason={}", profile_id, error),
      )?;
    }
  }
  result
}

#[tauri::command]
pub fn desktop_add_watch_root(
  input: AddWatchRootInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::add_watch_root(&state.db_path, input.clone())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "watcher",
    "Added watch root",
    &format!("profile_id={},path={}", input.profile_id, input.path),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_save_format_rule(
  input: SaveFormatRuleInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::save_format_rule(&state.db_path, input.clone())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "watcher",
    "Saved format rule",
    &format!(
      "profile_id={},watch_root_id={},match_type={},pattern={},format_id={}",
      input.profile_id, input.watch_root_id, input.match_type, input.pattern, input.format_id
    ),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_delete_format_rule(
  format_rule_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::delete_format_rule(&state.db_path, &format_rule_id)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "warn",
    "watcher",
    "Deleted format rule",
    &format!("format_rule_id={}", format_rule_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_delete_watch_root(
  watch_root_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::delete_watch_root(&state.db_path, &watch_root_id)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "warn",
    "watcher",
    "Deleted watch root",
    &format!("watch_root_id={}", watch_root_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_toggle_watch_root(
  watch_root_id: String,
  paused: bool,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::toggle_watch_root(&state.db_path, &watch_root_id, paused)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "watcher",
    "Toggled watch root",
    &format!("watch_root_id={},paused={}", watch_root_id, paused),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_update_preferences(
  input: UpdatePreferencesInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::update_preferences(&state.db_path, input.clone())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "storage",
    "Updated desktop preferences",
    &format!(
      "launch_at_login={},close_to_tray={},polling_interval_seconds={},diagnostics_retention_days={}",
      input.launch_at_login,
      input.close_to_tray,
      input.polling_interval_seconds,
      input.diagnostics_retention_days
    ),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_scan_watch_roots(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let watch_roots = storage::list_watch_roots_for_profile(&state.db_path, &profile_id)?;
  let format_rules = storage::list_format_rule_matches_for_profile(&state.db_path, &profile_id)?;
  let scanned = scanner::scan_watch_roots(&watch_roots, &format_rules)?;
  let snapshot = storage::save_scan_results(&state.db_path, &profile_id, &scanned)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "watcher",
    "Scanned watch roots",
    &format!("profile_id={},detected_files={}", profile_id, scanned.len()),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_assign_detected_file_format(
  input: AssignDetectedFileFormatInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::assign_detected_file_format(&state.db_path, &input.detected_file_id, &input.format_id)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "queue",
    "Assigned detected file format",
    &format!("detected_file_id={},format_id={}", input.detected_file_id, input.format_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_add_diagnostic_event(
  event: AddDiagnosticEventInput,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  storage::add_diagnostic_event(&state.db_path, event)
}

pub fn create_app_state(app: &AppHandle) -> Result<AppState, String> {
  let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
  let db_path = app_data_dir.join("desktop-state.sqlite3");
  storage::ensure_db(&db_path)?;
  Ok(AppState { db_path })
}

fn path_to_url(path: PathBuf) -> Result<String, String> {
  path.into_os_string()
    .into_string()
    .map_err(|_| String::from("invalid_profile_base_url"))
}
