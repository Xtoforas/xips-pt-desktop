use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};

use reqwest::Url;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::app_state::AppState;
use crate::models::api::{
    CardsResponse, MyAggResponse, ServiceHealth, TournamentFormat, UploadRecord,
};
use crate::models::local_state::{
    AddDiagnosticEventInput, AddWatchRootInput, AssignDetectedFileFormatInput,
    AssignDetectedFileTournamentInput, CompleteAuthExchangeInput, DesktopSnapshot,
    FailAuthExchangeInput, FinishAuthExchangeInput, SaveFormatRuleInput, SaveServerProfileInput,
    UpdatePreferencesInput,
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
pub async fn desktop_fetch_cards(
    profile_id: String,
    format_id: String,
    state: State<'_, AppState>,
) -> Result<CardsResponse, String> {
    let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
    let access_token = storage::load_access_token_for_profile(&state.db_path, &profile_id)?;
    match api_client::fetch_cards(&base_url, &access_token, &format_id).await {
        Ok(response) => {
            storage::write_diagnostic_event(
                &state.db_path,
                "info",
                "api",
                "Fetched cards",
                &format!(
                    "profile_id={},request_id={}",
                    profile_id, response.request_id
                ),
            )?;
            Ok(response.payload)
        }
        Err(error) => {
            if error.is_auth_error() {
                handle_auth_api_error(&state.db_path, &profile_id, "Card fetch failed", &error)?;
            }
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub async fn desktop_fetch_my_agg(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<MyAggResponse, String> {
    let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
    let access_token = storage::load_access_token_for_profile(&state.db_path, &profile_id)?;
    match api_client::fetch_my_agg(&base_url, &access_token).await {
        Ok(response) => {
            storage::write_diagnostic_event(
                &state.db_path,
                "info",
                "api",
                "Fetched my aggregate data",
                &format!(
                    "profile_id={},request_id={}",
                    profile_id, response.request_id
                ),
            )?;
            Ok(response.payload)
        }
        Err(error) => {
            if error.is_auth_error() {
                handle_auth_api_error(
                    &state.db_path,
                    &profile_id,
                    "My aggregate fetch failed",
                    &error,
                )?;
            }
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub async fn desktop_open_auth_window(
    profile_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = storage::load_profile_base_url(&state.db_path, &profile_id)?;
    let login_url = Url::parse(&format!(
        "{}/api/auth/login/discord",
        path_to_url(base_url)?
    ))
    .map_err(|error| error.to_string())?;
    if let Some(window) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        window
            .navigate(login_url)
            .map_err(|error| error.to_string())?;
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
    let base_url = path_to_url(storage::load_profile_base_url(
        &state.db_path,
        &input.profile_id,
    )?)?;
    let expected_url = Url::parse(&base_url).map_err(|error| error.to_string())?;
    let window = app
        .get_webview_window(AUTH_WINDOW_LABEL)
        .ok_or_else(|| String::from("auth_window_not_open"))?;
    let current_url = window.url().map_err(|error| error.to_string())?;
    if current_url.domain() != expected_url.domain() {
        return Err(String::from("auth_window_not_ready"));
    }

    let exchange_url = serde_json::to_string(&format!("{}/api/v1/auth/desktop/exchange", base_url))
        .map_err(|error| error.to_string())?;
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
    app.emit(SNAPSHOT_EVENT, true)
        .map_err(|error| error.to_string())?;
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
    app.emit(SNAPSHOT_EVENT, true)
        .map_err(|error| error.to_string())?;
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
                &format!(
                    "profile_id={},request_id={}",
                    profile_id, response.request_id
                ),
            )?;
            Ok(snapshot)
        }
        Err(error) => handle_auth_api_error(
            &state.db_path,
            &profile_id,
            "Auth validation failed",
            &error,
        ),
    }
}

#[tauri::command]
pub async fn desktop_logout(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let base_url = path_to_url(storage::load_profile_base_url(&state.db_path, &profile_id)?)?;
    let access_token =
        storage::load_access_token_for_profile(&state.db_path, &profile_id).unwrap_or_default();
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
    let snapshot = storage::assign_detected_file_format(
        &state.db_path,
        &input.detected_file_id,
        &input.format_id,
    )?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Assigned detected file format",
        &format!(
            "detected_file_id={},format_id={}",
            input.detected_file_id, input.format_id
        ),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_assign_detected_file_tournament(
    input: AssignDetectedFileTournamentInput,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::assign_detected_file_tournament(
        &state.db_path,
        &input.detected_file_id,
        &input.tournament_id,
    )?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Assigned detected file tournament",
        &format!(
            "detected_file_id={},tournament_id={}",
            input.detected_file_id, input.tournament_id
        ),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn desktop_process_upload_queue(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let _queue_guard = state.queue_lock.lock().await;
    process_upload_queue_for_profile(&state.db_path, &profile_id).await
}

pub(crate) async fn process_upload_queue_for_profile(
    db_path: &Path,
    profile_id: &str,
) -> Result<DesktopSnapshot, String> {
    let base_url = path_to_url(storage::load_profile_base_url(db_path, profile_id)?)?;
    let access_token =
        storage::load_access_token_for_profile(db_path, profile_id).map_err(|_| {
            let _ = storage::mark_all_profile_jobs_auth_blocked(db_path, profile_id);
            String::from("authentication_required")
        })?;
    if let Err(error) =
        flush_pending_upload_batches(db_path, profile_id, &base_url, &access_token).await
    {
        if error.is_auth_error() {
            return handle_auth_api_error(
                db_path,
                profile_id,
                "Deferred upload batch release failed",
                &error,
            );
        }
        storage::write_diagnostic_event(
            db_path,
            "warn",
            "queue",
            "Deferred upload batch release failed",
            &format!("profile_id={},reason={}", profile_id, error),
        )?;
    }
    let jobs = storage::list_pending_upload_jobs_for_profile(db_path, profile_id)?;
    let upload_batch_id = if jobs.len() > 1 {
        Some(uuid::Uuid::new_v4().to_string())
    } else {
        None
    };
    let mut deferred_uploads_created = false;
    for (index, job) in jobs.iter().enumerate() {
        storage::append_upload_attempt(
            db_path,
            &job.id,
            (job.retries + 1).max((index as u32) + 1),
            "running",
            "begin_upload_attempt",
        )?;

        let source_path = if !job.staged_path.is_empty() {
            &job.staged_path
        } else {
            &job.path
        };
        let file_bytes = fs::read(source_path).map_err(|error| error.to_string())?;
        let raw_content = String::from_utf8_lossy(&file_bytes).to_string();
        if raw_content.len() > 15_000_000 {
            storage::update_upload_job_metadata(
                db_path,
                &job.id,
                "failed_terminal",
                Some("failed"),
                None,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                &chrono_like::to_iso_string(std::time::SystemTime::now()),
                "payload_too_large",
                job.retries + 1,
            )?;
            storage::append_upload_attempt(
                db_path,
                &job.id,
                job.retries + 1,
                "failed",
                "payload_too_large",
            )?;
            continue;
        }

        match api_client::check_duplicate(
            &base_url,
            &access_token,
            &job.checksum,
            &job.file_kind,
            &job.format_id,
        )
        .await
        {
            Ok(duplicate) => {
                if duplicate.payload.duplicate {
                    storage::update_upload_job_metadata(
                        db_path,
                        &job.id,
                        "duplicate_skipped_local",
                        Some("skipped_duplicate"),
                        Some(&duplicate.payload.upload_id),
                        "",
                        "",
                        &duplicate.request_id,
                        &duplicate.payload.reason,
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        &duplicate.payload.reason,
                        job.retries,
                    )?;
                    storage::append_upload_attempt(
                        db_path,
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
                    return handle_auth_api_error(
                        db_path,
                        profile_id,
                        "Duplicate preflight failed",
                        &error,
                    );
                }
                storage::update_upload_job_metadata(
                    db_path,
                    &job.id,
                    "failed_retryable",
                    Some("failed"),
                    None,
                    "",
                    "",
                    &error.request_id,
                    "",
                    &retry_after_iso(job.retries + 1),
                    "",
                    "",
                    "",
                    "",
                    "",
                    &chrono_like::to_iso_string(std::time::SystemTime::now()),
                    &error.to_string(),
                    job.retries + 1,
                )?;
                storage::append_upload_attempt(
                    db_path,
                    &job.id,
                    job.retries + 1,
                    "failed",
                    &error.to_string(),
                )?;
                continue;
            }
        }

        storage::update_upload_job_metadata(
            db_path,
            &job.id,
            "uploading",
            Some("queued"),
            None,
            "",
            "",
            "",
            "",
            "",
            &chrono_like::to_iso_string(std::time::SystemTime::now()),
            "",
            "",
            "",
            "",
            "",
            "",
            job.retries,
        )?;
        match api_client::create_upload(
            &base_url,
            &access_token,
            &job.filename,
            &raw_content,
            &job.file_kind,
            &job.format_id,
            &job.tournament_id,
            upload_batch_id.as_deref(),
            upload_batch_id.is_some(),
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
                storage::update_upload_job_metadata(
                    db_path,
                    &job.id,
                    next_state,
                    lifecycle_phase,
                    Some(&created.payload.upload_id),
                    &created.payload.status,
                    &created.payload.checksum,
                    &created.request_id,
                    "",
                    "",
                    &chrono_like::to_iso_string(std::time::SystemTime::now()),
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    job.retries,
                )?;
                if let Some(batch_id) = upload_batch_id.as_deref() {
                    if !created.payload.skipped {
                        storage::set_upload_job_batch_id(db_path, &job.id, batch_id)?;
                        deferred_uploads_created = true;
                    }
                }
                storage::append_upload_attempt(
                    db_path,
                    &job.id,
                    job.retries + 1,
                    "complete",
                    &format!("upload_created request_id={}", created.request_id),
                )?;
            }
            Err(error) => {
                if error.is_auth_error() {
                    return handle_auth_api_error(
                        db_path,
                        profile_id,
                        "Upload request failed",
                        &error,
                    );
                }
                storage::update_upload_job_metadata(
                    db_path,
                    &job.id,
                    "failed_retryable",
                    Some("failed"),
                    None,
                    "",
                    "",
                    &error.request_id,
                    "",
                    &retry_after_iso(job.retries + 1),
                    "",
                    "",
                    "",
                    "",
                    "",
                    &chrono_like::to_iso_string(std::time::SystemTime::now()),
                    &error.to_string(),
                    job.retries + 1,
                )?;
                storage::append_upload_attempt(
                    db_path,
                    &job.id,
                    job.retries + 1,
                    "failed",
                    &error.to_string(),
                )?;
            }
        }
    }
    if deferred_uploads_created {
        if let Some(batch_id) = upload_batch_id.as_deref() {
            if let Err(error) = release_upload_batch(db_path, profile_id, &base_url, &access_token, batch_id).await
            {
                if error.is_auth_error() {
                    return handle_auth_api_error(
                        db_path,
                        profile_id,
                        "Deferred upload batch release failed",
                        &error,
                    );
                }
                storage::write_diagnostic_event(
                    db_path,
                    "warn",
                    "queue",
                    "Deferred upload batch release failed",
                    &format!("profile_id={},batch_id={},reason={}", profile_id, batch_id, error),
                )?;
            }
        }
    }
    poll_active_uploads_for_profile(db_path, profile_id).await
}

#[tauri::command]
pub async fn desktop_poll_active_uploads(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let _queue_guard = state.queue_lock.lock().await;
    poll_active_uploads_for_profile(&state.db_path, &profile_id).await
}

fn storage_api_error(detail: String) -> api_client::ApiError {
    api_client::ApiError {
        status: 500,
        code: String::from("storage_error"),
        request_id: String::new(),
        detail,
    }
}

async fn release_upload_batch(
    db_path: &Path,
    profile_id: &str,
    base_url: &str,
    access_token: &str,
    upload_batch_id: &str,
) -> Result<(), api_client::ApiError> {
    let released = api_client::complete_upload_batch(base_url, access_token, upload_batch_id).await?;
    storage::clear_upload_batch_id_for_profile_batch(db_path, profile_id, upload_batch_id)
        .map_err(storage_api_error)?;
    storage::write_diagnostic_event(
        db_path,
        "info",
        "queue",
        "Released deferred upload batch",
        &format!(
            "profile_id={},batch_id={},request_id={}",
            profile_id, upload_batch_id, released.request_id
        ),
    )
    .map_err(storage_api_error)?;
    Ok(())
}

async fn flush_pending_upload_batches(
    db_path: &Path,
    profile_id: &str,
    base_url: &str,
    access_token: &str,
) -> Result<(), api_client::ApiError> {
    let pending_batch_ids =
        storage::list_pending_upload_batch_ids_for_profile(db_path, profile_id)
            .map_err(storage_api_error)?;
    for batch_id in pending_batch_ids {
        release_upload_batch(db_path, profile_id, base_url, access_token, &batch_id).await?;
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_retry_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::retry_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Queued local retry",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_dismiss_duplicate_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::dismiss_duplicate_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Dismissed duplicate upload row",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_ignore_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::ignore_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Ignored queue row",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_restore_ignored_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::restore_ignored_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Restored ignored queue row",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_remove_awaiting_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::remove_awaiting_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Removed awaiting format row",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_dismiss_working_upload_job(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    let snapshot = storage::dismiss_working_upload_job(&state.db_path, &upload_job_id)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Dismissed working queue row",
        &format!("upload_job_id={}", upload_job_id),
    )?;
    Ok(snapshot)
}

#[tauri::command]
pub fn desktop_open_upload_file_location(
    upload_job_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let job = storage::load_upload_job_by_id(&state.db_path, &upload_job_id)?;
    let reveal_path = if !job.staged_path.is_empty() {
        job.staged_path.clone()
    } else {
        job.path.clone()
    };
    open_file_location(&reveal_path)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "queue",
        "Opened upload file location",
        &format!("upload_job_id={},path={}", upload_job_id, reveal_path),
    )?;
    Ok(())
}

#[tauri::command]
pub fn desktop_add_diagnostic_event(
    event: AddDiagnosticEventInput,
    state: State<'_, AppState>,
) -> Result<DesktopSnapshot, String> {
    storage::add_diagnostic_event(&state.db_path, event)
}

#[tauri::command]
pub fn desktop_export_diagnostics_bundle(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let snapshot = storage::load_snapshot(&state.db_path)?;
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("exports");
    fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;
    let generated_at = chrono_like::to_iso_string(std::time::SystemTime::now());
    let export_path = export_dir.join(format!(
        "diagnostics-{}.json",
        generated_at.replace(':', "-")
    ));
    let payload = serde_json::json!({
      "generatedAt": generated_at,
      "platform": std::env::consts::OS,
      "arch": std::env::consts::ARCH,
      "snapshot": snapshot
    });
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&export_path, bytes).map_err(|error| error.to_string())?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "diagnostics",
        "Exported diagnostics bundle",
        &format!("path={}", export_path.to_string_lossy()),
    )?;
    Ok(export_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn desktop_open_app_data_directory(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    open_path_location(&app_data_dir)?;
    storage::write_diagnostic_event(
        &state.db_path,
        "info",
        "diagnostics",
        "Opened app data directory",
        &format!("path={}", app_data_dir.to_string_lossy()),
    )?;
    Ok(())
}

#[tauri::command]
pub fn desktop_get_default_watch_root(app: AppHandle) -> Result<String, String> {
    let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
    let path = if cfg!(target_os = "windows") {
        home_dir
            .join("Documents")
            .join("Out of the Park Developments")
            .join("OOTP Baseball 27")
            .join("online_data")
    } else if cfg!(target_os = "macos") {
        home_dir
            .join("Library")
            .join("Application Support")
            .join("Out of the Park Developments")
            .join("OOTP Baseball 27")
            .join("online_data")
    } else {
        PathBuf::new()
    };
    Ok(path.to_string_lossy().into_owned())
}

pub fn create_app_state(app: &AppHandle) -> Result<AppState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let db_path = app_data_dir.join("desktop-state.sqlite3");
    storage::ensure_db(&db_path)?;
    let repaired_jobs = storage::repair_stale_upload_jobs(&db_path)?;
    if repaired_jobs > 0 {
        storage::write_diagnostic_event(
            &db_path,
            "warn",
            "queue",
            "Repaired stale upload jobs during startup",
            &format!("repaired_jobs={}", repaired_jobs),
        )?;
    }
    let rescanned_files = storage::rescan_active_watch_roots(&db_path)?;
    if rescanned_files > 0 {
        storage::write_diagnostic_event(
            &db_path,
            "info",
            "watcher",
            "Rescanned active watch roots during startup",
            &format!("detected_files={}", rescanned_files),
        )?;
    }
    Ok(AppState {
        db_path,
        watcher_controller: Arc::new(Mutex::new(None)),
        dispatcher_controller: Arc::new(Mutex::new(None)),
        queue_lock: Arc::new(tokio::sync::Mutex::new(())),
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
        Some("refresh_pending") => {
            if row.file_kind == "card_catalog" {
                ("complete", Some("complete"), row.error.clone())
            } else {
                (
                    "server_refresh_pending",
                    Some("refresh_pending"),
                    row.error.clone(),
                )
            }
        }
        Some("refreshing") => ("server_refreshing", Some("refreshing"), row.error.clone()),
        Some("complete") => ("complete", Some("complete"), row.error.clone()),
        Some("failed") => ("failed_terminal", Some("failed"), row.error.clone()),
        Some("skipped_duplicate") => (
            "duplicate_skipped_local",
            Some("skipped_duplicate"),
            row.error.clone(),
        ),
        _ => (
            "uploaded_waiting_server",
            row.lifecycle_phase.as_deref(),
            row.error.clone(),
        ),
    }
}

fn retry_after_iso(retries: u32) -> String {
    let base_delay_seconds = 5_u64.saturating_mul(2_u64.saturating_pow(retries.min(5)));
    let jitter_seconds = ((std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_else(|_| std::time::Duration::from_secs(0))
        .subsec_nanos()
        % 3_000_000_000) as u64)
        / 1_000_000_000;
    let retry_at = std::time::SystemTime::now()
        .checked_add(std::time::Duration::from_secs(
            base_delay_seconds + jitter_seconds,
        ))
        .unwrap_or_else(std::time::SystemTime::now);
    chrono_like::to_iso_string(retry_at)
}

async fn poll_active_uploads_for_profile(
    db_path: &std::path::Path,
    profile_id: &str,
) -> Result<DesktopSnapshot, String> {
    let base_url = path_to_url(storage::load_profile_base_url(db_path, profile_id)?)?;
    let access_token =
        storage::load_access_token_for_profile(db_path, profile_id).map_err(|_| {
            let _ = storage::mark_all_profile_jobs_auth_blocked(db_path, profile_id);
            String::from("authentication_required")
        })?;
    let jobs = storage::list_active_upload_jobs_for_profile(db_path, profile_id)?;
    for job in jobs {
        match api_client::fetch_upload_detail(&base_url, &access_token, &job.upload_id).await {
            Ok(detail) => {
                let (local_state, lifecycle_phase, error) =
                    map_upload_record_to_local_state(&detail.payload.row);
                storage::update_upload_job_metadata(
                    db_path,
                    &job.id,
                    local_state,
                    lifecycle_phase,
                    Some(&job.upload_id),
                    &detail.payload.row.status,
                    "",
                    &detail.request_id,
                    "",
                    "",
                    detail.payload.row.queued_at.as_deref().unwrap_or(""),
                    detail.payload.row.processing_at.as_deref().unwrap_or(""),
                    detail.payload.row.parsed_at.as_deref().unwrap_or(""),
                    detail.payload.row.refreshing_at.as_deref().unwrap_or(""),
                    detail.payload.row.completed_at.as_deref().unwrap_or(""),
                    detail.payload.row.failed_at.as_deref().unwrap_or(""),
                    &error,
                    job.retries,
                )?;
            }
            Err(error) => {
                if error.is_auth_error() {
                    return handle_auth_api_error(
                        db_path,
                        profile_id,
                        "Upload polling failed",
                        &error,
                    );
                }
                storage::update_upload_job_metadata(
                    db_path,
                    &job.id,
                    "failed_retryable",
                    Some("failed"),
                    Some(&job.upload_id),
                    "",
                    "",
                    &error.request_id,
                    "",
                    &retry_after_iso(job.retries + 1),
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
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

fn open_file_location(path: &str) -> Result<(), String> {
    open_path_location(&std::path::PathBuf::from(path))
}

fn open_path_location(target: &std::path::Path) -> Result<(), String> {
    if !target.exists() {
        return Err(String::from("path_not_found"));
    }
    #[cfg(target_os = "macos")]
    {
        if target.is_dir() {
            Command::new("open")
                .arg(target)
                .status()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("open")
                .arg("-R")
                .arg(target)
                .status()
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        if target.is_dir() {
            Command::new("explorer")
                .arg(target)
                .status()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("explorer")
                .arg(format!("/select,{}", target.to_string_lossy()))
                .status()
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        let directory = target.parent().unwrap_or(&target);
        Command::new("xdg-open")
            .arg(directory)
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err(String::from("open_file_location_unsupported"))
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
            pub fn from_unix(seconds: i64, nanos: u32) -> Self {
                let days = seconds.div_euclid(86_400);
                let seconds_of_day = seconds.rem_euclid(86_400);
                let (year, month, day) = civil_from_days(days);
                Self {
                    year,
                    month,
                    day,
                    hour: (seconds_of_day / 3_600) as u32,
                    minute: ((seconds_of_day % 3_600) / 60) as u32,
                    second: (seconds_of_day % 60) as u32,
                    millis: nanos / 1_000_000,
                }
            }

            pub fn to_iso_string(&self) -> String {
                format!(
                    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
                    self.year,
                    self.month,
                    self.day,
                    self.hour,
                    self.minute,
                    self.second,
                    self.millis
                )
            }
        }

        fn civil_from_days(days: i64) -> (i32, u32, u32) {
            let z = days + 719_468;
            let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
            let doe = z - era * 146_097;
            let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
            let y = yoe + era * 400;
            let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            let mp = (5 * doy + 2) / 153;
            let d = doy - (153 * mp + 2) / 5 + 1;
            let m = mp + if mp < 10 { 3 } else { -9 };
            let year = y + if m <= 2 { 1 } else { 0 };
            (year as i32, m as u32, d as u32)
        }
    }
}
