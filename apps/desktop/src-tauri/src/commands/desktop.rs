use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use reqwest::Url;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::app_state::AppState;
use crate::models::api::{ServiceHealth, TournamentFormat, UploadRecord};
use crate::models::local_state::{
  AddDiagnosticEventInput, AddWatchRootInput, AssignDetectedFileFormatInput, CompleteAuthExchangeInput, DesktopSnapshot,
  FailAuthExchangeInput, FinishAuthExchangeInput, SaveFormatRuleInput, SaveServerProfileInput, UpdatePreferencesInput,
};
use crate::services::{api_client, file_watcher, scanner, storage};

const AUTH_WINDOW_LABEL: &str = "discord-auth";
const SNAPSHOT_EVENT: &str = "desktop:snapshot-updated";

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
pub async fn desktop_open_auth_window(
  profile_id: String,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<(), String> {
  let base_url = storage::load_profile_base_url(&state.db_path, &profile_id)?;
  let login_url = Url::parse(&format!("{}/api/auth/login/discord", path_to_url(base_url)?)).map_err(|error| error.to_string())?;
  if let Some(window) = app.get_webview_window(AUTH_WINDOW_LABEL) {
    window.navigate(login_url).map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    return Ok(());
  }
  WebviewWindowBuilder::new(&app, AUTH_WINDOW_LABEL, WebviewUrl::External(login_url))
    .title("xips-pt Discord sign in")
    .inner_size(960.0, 760.0)
    .resizable(true)
    .build()
    .map_err(|error| error.to_string())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "auth",
    "Opened desktop auth window",
    &format!("profile_id={}", profile_id),
  )?;
  Ok(())
}

#[tauri::command]
pub async fn desktop_complete_auth(
  input: CompleteAuthExchangeInput,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<(), String> {
  let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &input.profile_id)?)?;
  let expected_url = Url::parse(&base_url).map_err(|error| error.to_string())?;
  let window = app
    .get_webview_window(AUTH_WINDOW_LABEL)
    .ok_or_else(|| String::from("auth_window_not_open"))?;
  let current_url = window.url().map_err(|error| error.to_string())?;
  if current_url.domain() != expected_url.domain() {
    return Err(String::from("auth_window_not_ready"));
  }

  let exchange_url = serde_json::to_string(&format!("{}/api/v1/auth/desktop/exchange", base_url)).map_err(|error| error.to_string())?;
  let profile_id = serde_json::to_string(&input.profile_id).map_err(|error| error.to_string())?;
  let script = format!(
    r#"
      (async () => {{
        try {{
          const response = await fetch({exchange_url}, {{
            method: 'POST',
            credentials: 'include',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ label: 'xips-pt-desktop' }})
          }});
          const payload = await response.json().catch(() => ({{}}));
          if (!response.ok) {{
            await window.__TAURI_INTERNALS__.invoke('desktop_fail_auth_exchange', {{
              input: {{
                profileId: {profile_id},
                message: String(payload.error || 'desktop_exchange_failed'),
                detail: JSON.stringify(payload)
              }}
            }});
            return;
          }}
          await window.__TAURI_INTERNALS__.invoke('desktop_finish_auth_exchange', {{
            input: {{
              profileId: {profile_id},
              payload
            }}
          }});
        }} catch (error) {{
          await window.__TAURI_INTERNALS__.invoke('desktop_fail_auth_exchange', {{
            input: {{
              profileId: {profile_id},
              message: 'desktop_exchange_failed',
              detail: String(error)
            }}
          }});
        }}
      }})();
    "#,
  );
  window.eval(script).map_err(|error| error.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn desktop_finish_auth_exchange(
  input: FinishAuthExchangeInput,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<(), String> {
  let user = api_client::into_session_user(&input.payload.user);
  let _ = storage::save_auth_session(
    &state.db_path,
    &input.profile_id,
    &user,
    &input.payload.access_token,
    &input.payload.expires_at,
  )?;
  if let Some(window) = app.get_webview_window(AUTH_WINDOW_LABEL) {
    let _ = window.close();
  }
  app.emit(SNAPSHOT_EVENT, true).map_err(|error| error.to_string())?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "auth",
    "Desktop auth exchange completed",
    &format!("profile_id={},user_id={}", input.profile_id, user.user_id),
  )?;
  Ok(())
}

#[tauri::command]
pub fn desktop_fail_auth_exchange(
  input: FailAuthExchangeInput,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<(), String> {
  storage::write_diagnostic_event(
    &state.db_path,
    "error",
    "auth",
    &input.message,
    &format!("profile_id={},detail={}", input.profile_id, input.detail),
  )?;
  app.emit(SNAPSHOT_EVENT, true).map_err(|error| error.to_string())?;
  Ok(())
}

#[tauri::command]
pub async fn desktop_refresh_me(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
  let access_token = storage::load_access_token_for_profile(&state.db_path, &profile_id)?;
  match api_client::fetch_me(&base_url, &access_token).await {
    Ok(response) => {
      let user = api_client::into_session_user(&response.payload.user);
      let snapshot = storage::save_auth_session(
        &state.db_path,
        &profile_id,
        &user,
        &access_token,
        &storage::load_snapshot(&state.db_path)?.token_expires_at,
      )?;
      storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "auth",
        "Validated desktop auth token",
        &format!("profile_id={},request_id={}", profile_id, response.request_id),
      )?;
      Ok(snapshot)
    }
    Err(error) => handle_auth_api_error(&state.db_path, &profile_id, "Auth validation failed", &error),
  }
}

#[tauri::command]
pub async fn desktop_logout(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
  let access_token = storage::load_access_token_for_profile(&state.db_path, &profile_id).unwrap_or_default();
  if !access_token.is_empty() {
    let _ = api_client::logout(&base_url, &access_token).await;
  }
  let snapshot = storage::clear_auth_session(&state.db_path)?;
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "auth",
    "Logged out desktop bearer token",
    &format!("profile_id={}", profile_id),
  )?;
  Ok(snapshot)
}

#[tauri::command]
pub fn desktop_add_watch_root(
  input: AddWatchRootInput,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::add_watch_root(&state.db_path, input.clone())?;
  file_watcher::restart(&app, &state)?;
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
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::delete_watch_root(&state.db_path, &watch_root_id)?;
  file_watcher::restart(&app, &state)?;
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
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let snapshot = storage::toggle_watch_root(&state.db_path, &watch_root_id, paused)?;
  file_watcher::restart(&app, &state)?;
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
pub async fn desktop_process_upload_queue(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
  let access_token = storage::load_access_token_for_profile(&state.db_path, &profile_id).map_err(|_| {
    let _ = storage::mark_all_profile_jobs_auth_blocked(&state.db_path, &profile_id);
    String::from("authentication_required")
  })?;
  let jobs = storage::list_pending_upload_jobs_for_profile(&state.db_path, &profile_id)?;
  for (index, job) in jobs.iter().enumerate() {
    storage::append_upload_attempt(
      &state.db_path,
      &job.id,
      (job.retries + 1).max((index as u32) + 1),
      "running",
      "begin_upload_attempt",
    )?;

    let file_bytes = fs::read(&job.path).map_err(|error| error.to_string())?;
    let raw_content = String::from_utf8_lossy(&file_bytes).to_string();
    if raw_content.len() > 15_000_000 {
      storage::update_upload_job_status(
        &state.db_path,
        &job.id,
        "failed_terminal",
        Some("failed"),
        None,
        "payload_too_large",
        job.retries + 1,
      )?;
      storage::append_upload_attempt(&state.db_path, &job.id, job.retries + 1, "failed", "payload_too_large")?;
      continue;
    }

    match api_client::check_duplicate(&base_url, &access_token, &job.checksum, &job.file_kind, &job.format_id).await {
      Ok(duplicate) => {
        if duplicate.payload.duplicate {
          storage::update_upload_job_status(
            &state.db_path,
            &job.id,
            "duplicate_skipped_local",
            Some("skipped_duplicate"),
            Some(&duplicate.payload.upload_id),
            &duplicate.payload.reason,
            job.retries,
          )?;
          storage::append_upload_attempt(
            &state.db_path,
            &job.id,
            job.retries + 1,
            "complete",
            &format!("duplicate_preflight request_id={}", duplicate.request_id),
          )?;
          continue;
        }
      }
      Err(error) => {
        if error.is_auth_error() {
          return handle_auth_api_error(&state.db_path, &profile_id, "Duplicate preflight failed", &error);
        }
        storage::update_upload_job_status(
          &state.db_path,
          &job.id,
          "failed_retryable",
          Some("failed"),
          None,
          &error.to_string(),
          job.retries + 1,
        )?;
        storage::append_upload_attempt(&state.db_path, &job.id, job.retries + 1, "failed", &error.to_string())?;
        continue;
      }
    }

    storage::update_upload_job_status(&state.db_path, &job.id, "uploading", Some("queued"), None, "", job.retries)?;
    match api_client::create_upload(
      &base_url,
      &access_token,
      &job.filename,
      &raw_content,
      &job.file_kind,
      &job.format_id,
    )
    .await
    {
      Ok(created) => {
        let next_state = if created.payload.skipped {
          "duplicate_skipped_local"
        } else {
          "uploaded_waiting_server"
        };
        let lifecycle_phase = if created.payload.skipped {
          Some("skipped_duplicate")
        } else {
          Some("queued")
        };
        storage::update_upload_job_status(
          &state.db_path,
          &job.id,
          next_state,
          lifecycle_phase,
          Some(&created.payload.upload_id),
          "",
          job.retries,
        )?;
        storage::append_upload_attempt(
          &state.db_path,
          &job.id,
          job.retries + 1,
          "complete",
          &format!("upload_created request_id={}", created.request_id),
        )?;
      }
      Err(error) => {
        if error.is_auth_error() {
          return handle_auth_api_error(&state.db_path, &profile_id, "Upload request failed", &error);
        }
        storage::update_upload_job_status(
          &state.db_path,
          &job.id,
          "failed_retryable",
          Some("failed"),
          None,
          &error.to_string(),
          job.retries + 1,
        )?;
        storage::append_upload_attempt(&state.db_path, &job.id, job.retries + 1, "failed", &error.to_string())?;
      }
    }
  }
  poll_active_uploads_for_profile(&state.db_path, &profile_id).await
}

#[tauri::command]
pub async fn desktop_poll_active_uploads(
  profile_id: String,
  state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
  poll_active_uploads_for_profile(&state.db_path, &profile_id).await
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
  Ok(AppState {
    db_path,
    watcher_controller: Arc::new(Mutex::new(None)),
  })
}

fn path_to_url(path: PathBuf) -> Result<String, String> {
  path.into_os_string()
    .into_string()
    .map_err(|_| String::from("invalid_profile_base_url"))
}

fn map_upload_record_to_local_state(row: &UploadRecord) -> (&'static str, Option<&str>, String) {
  match row.lifecycle_phase.as_deref() {
    Some("queued") => ("server_queued", Some("queued"), row.error.clone()),
    Some("processing") => ("server_processing", Some("processing"), row.error.clone()),
    Some("refresh_pending") => ("server_refresh_pending", Some("refresh_pending"), row.error.clone()),
    Some("refreshing") => ("server_refreshing", Some("refreshing"), row.error.clone()),
    Some("complete") => ("complete", Some("complete"), row.error.clone()),
    Some("failed") => ("failed_terminal", Some("failed"), row.error.clone()),
    Some("skipped_duplicate") => ("duplicate_skipped_local", Some("skipped_duplicate"), row.error.clone()),
    _ => ("uploaded_waiting_server", row.lifecycle_phase.as_deref(), row.error.clone()),
  }
}

async fn poll_active_uploads_for_profile(db_path: &std::path::Path, profile_id: &str) -> Result<DesktopSnapshot, String> {
  let base_url = path_to_url(storage::load_profile_base_url(db_path, profile_id)?)?;
  let access_token = storage::load_access_token_for_profile(db_path, profile_id).map_err(|_| {
    let _ = storage::mark_all_profile_jobs_auth_blocked(db_path, profile_id);
    String::from("authentication_required")
  })?;
  let jobs = storage::list_active_upload_jobs_for_profile(db_path, profile_id)?;
  for job in jobs {
    match api_client::fetch_upload_detail(&base_url, &access_token, &job.upload_id).await {
      Ok(detail) => {
        let (local_state, lifecycle_phase, error) = map_upload_record_to_local_state(&detail.payload.row);
        storage::update_upload_job_status(
          db_path,
          &job.id,
          local_state,
          lifecycle_phase,
          Some(&job.upload_id),
          &error,
          job.retries,
        )?;
      }
      Err(error) => {
        if error.is_auth_error() {
          return handle_auth_api_error(db_path, profile_id, "Upload polling failed", &error);
        }
        storage::update_upload_job_status(
          db_path,
          &job.id,
          "failed_retryable",
          Some("failed"),
          Some(&job.upload_id),
          &error.to_string(),
          job.retries + 1,
        )?;
      }
    }
  }
  storage::load_snapshot(db_path)
}

fn handle_auth_api_error(
  db_path: &std::path::Path,
  profile_id: &str,
  message: &str,
  error: &api_client::ApiError,
) -> Result<DesktopSnapshot, String> {
  storage::clear_auth_session(db_path)?;
  storage::mark_all_profile_jobs_auth_blocked(db_path, profile_id)?;
  storage::write_diagnostic_event(
    db_path,
    "error",
    "auth",
    message,
    &format!("profile_id={},error={}", profile_id, error),
  )?;
  storage::load_snapshot(db_path)
}
