mod app_state;
mod commands;
mod db;
mod models;
mod services;

use commands::desktop::{
  create_app_state, desktop_add_diagnostic_event, desktop_add_watch_root, desktop_assign_detected_file_format,
  desktop_check_server_health, desktop_delete_format_rule, desktop_delete_server_profile, desktop_delete_watch_root,
  desktop_fetch_formats, desktop_get_snapshot, desktop_save_format_rule, desktop_save_server_profile,
  desktop_scan_watch_roots, desktop_select_server_profile, desktop_toggle_watch_root, desktop_update_preferences,
};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let state = create_app_state(app.handle())?;
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
      desktop_add_watch_root,
      desktop_save_format_rule,
      desktop_delete_format_rule,
      desktop_delete_watch_root,
      desktop_toggle_watch_root,
      desktop_update_preferences,
      desktop_scan_watch_roots,
      desktop_assign_detected_file_format,
      desktop_add_diagnostic_event
    ])
    .run(tauri::generate_context!())
    .expect("failed to run xips-pt desktop");
}
