use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread;
use std::thread::JoinHandle;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::commands::desktop::process_upload_queue_for_profile;
use crate::services::storage;

const SNAPSHOT_EVENT: &str = "desktop:snapshot-updated";

pub struct DispatcherController {
  stop_tx: Sender<()>,
  worker: JoinHandle<()>,
}

impl DispatcherController {
  pub fn stop(self) {
    let _ = self.stop_tx.send(());
    let _ = self.worker.join();
  }
}

pub fn start(app: &AppHandle, state: &AppState) -> Result<(), String> {
  if let Some(controller) = state
    .dispatcher_controller
    .lock()
    .map_err(|_| String::from("dispatcher_lock_failed"))?
    .take()
  {
    controller.stop();
  }

  let db_path = state.db_path.clone();
  let queue_lock = state.queue_lock.clone();
  let app_handle = app.clone();
  let (stop_tx, stop_rx) = mpsc::channel::<()>();
  let worker = thread::spawn(move || {
    let mut run_immediately = true;
    loop {
      let snapshot = match storage::load_snapshot(&db_path) {
        Ok(snapshot) => snapshot,
        Err(error) => {
          let _ = storage::write_diagnostic_event(
            &db_path,
            "error",
            "queue",
            "Background dispatcher could not load snapshot",
            &error,
          );
          match stop_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => continue,
          }
        }
      };

      if !run_immediately {
        let wait_for = jittered_interval(snapshot.preferences.polling_interval_seconds);
        match stop_rx.recv_timeout(wait_for) {
          Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
          Err(RecvTimeoutError::Timeout) => {}
        }
      }
      run_immediately = false;

      if snapshot.auth_profile_id.is_empty() {
        continue;
      }

      let result = tauri::async_runtime::block_on(async {
        let _queue_guard = queue_lock.lock().await;
        process_upload_queue_for_profile(&db_path, &snapshot.auth_profile_id).await
      });

      match result {
        Ok(_) => {
          let _ = app_handle.emit(SNAPSHOT_EVENT, true);
        }
        Err(error) => {
          let _ = storage::write_diagnostic_event(
            &db_path,
            "error",
            "queue",
            "Background dispatcher run failed",
            &format!("profile_id={},reason={}", snapshot.auth_profile_id, error),
          );
          let _ = app_handle.emit(SNAPSHOT_EVENT, true);
        }
      }
    }
  });

  state
    .dispatcher_controller
    .lock()
    .map_err(|_| String::from("dispatcher_lock_failed"))?
    .replace(DispatcherController { stop_tx, worker });

  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "queue",
    "Started native upload dispatcher",
    "runs pending uploads and active upload polling on the native side",
  )?;
  Ok(())
}

fn jittered_interval(base_seconds: u32) -> Duration {
  let effective_seconds = base_seconds.max(3) as u64;
  let jitter_millis = (std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_else(|_| Duration::from_secs(0))
    .subsec_millis()
    % 900) as u64;
  Duration::from_secs(effective_seconds) + Duration::from_millis(jitter_millis)
}

#[cfg(test)]
mod tests {
  use super::jittered_interval;
  use std::time::Duration;

  #[test]
  fn jittered_interval_respects_minimum_base() {
    let interval = jittered_interval(1);
    assert!(interval >= Duration::from_secs(3));
    assert!(interval < Duration::from_millis(3900));
  }

  #[test]
  fn jittered_interval_stays_within_one_second_of_base() {
    let interval = jittered_interval(8);
    assert!(interval >= Duration::from_secs(8));
    assert!(interval < Duration::from_millis(8900));
  }
}
