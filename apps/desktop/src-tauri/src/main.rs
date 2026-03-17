mod app_state;
mod commands;
mod db;
mod models;
mod services;

use commands::desktop::{
  create_app_state, desktop_add_diagnostic_event, desktop_add_watch_root, desktop_assign_detected_file_format,
  desktop_check_server_health, desktop_complete_auth, desktop_delete_format_rule, desktop_delete_server_profile,
  desktop_delete_watch_root, desktop_fail_auth_exchange, desktop_fetch_cards, desktop_fetch_formats,
  desktop_export_diagnostics_bundle, desktop_fetch_my_agg, desktop_finish_auth_exchange, desktop_get_default_watch_root,
  desktop_get_snapshot,
  desktop_dismiss_duplicate_upload_job, desktop_logout, desktop_open_auth_window,
  desktop_open_app_data_directory, desktop_open_upload_file_location, desktop_poll_active_uploads, desktop_process_upload_queue,
  desktop_refresh_me, desktop_retry_upload_job, desktop_save_format_rule, desktop_save_server_profile,
  desktop_scan_watch_roots, desktop_select_server_profile, desktop_toggle_watch_root, desktop_update_preferences,
};
use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let state = create_app_state(app.handle())?;
      services::file_watcher::restart(app.handle(), &state)?;
      services::background_queue::start(app.handle(), &state)?;
      app.manage(state);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      desktop_get_snapshot,
      desktop_save_server_profile,
      desktop_delete_server_profile,
      desktop_select_server_profile,
      desktop_check_server_health,
      desktop_fetch_formats,
      desktop_fetch_cards,
      desktop_fetch_my_agg,
      desktop_open_auth_window,
      desktop_complete_auth,
      desktop_finish_auth_exchange,
      desktop_fail_auth_exchange,
      desktop_refresh_me,
      desktop_logout,
      desktop_add_watch_root,
      desktop_save_format_rule,
      desktop_delete_format_rule,
      desktop_delete_watch_root,
      desktop_toggle_watch_root,
      desktop_update_preferences,
      desktop_scan_watch_roots,
      desktop_assign_detected_file_format,
      desktop_process_upload_queue,
      desktop_poll_active_uploads,
      desktop_retry_upload_job,
      desktop_dismiss_duplicate_upload_job,
      desktop_open_upload_file_location,
      desktop_add_diagnostic_event,
      desktop_export_diagnostics_bundle,
      desktop_get_default_watch_root,
      desktop_open_app_data_directory
    ])
    .run(tauri::generate_context!())
    .expect("failed to run xips-pt desktop");
}
