use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::models::local_state::LocalWatchRoot;
use crate::services::{scanner, storage};

const SNAPSHOT_EVENT: &str = "desktop:snapshot-updated";
const QUIET_PERIOD: Duration = Duration::from_millis(1200);
const STABILITY_CHECK_DELAY: Duration = Duration::from_millis(350);
const STABILITY_CHECK_ATTEMPTS: usize = 4;

pub struct WatcherController {
  stop_tx: Sender<()>,
  watcher: RecommendedWatcher,
  worker: JoinHandle<()>,
}

impl WatcherController {
  pub fn stop(self) {
    let _ = self.stop_tx.send(());
    let _ = self.worker.join();
    drop(self.watcher);
  }
}

#[derive(Clone)]
struct WatchSubscription {
  profile_id: String,
  root_path: PathBuf,
}

pub fn restart(app: &AppHandle, state: &AppState) -> Result<(), String> {
  let watch_roots = storage::load_snapshot(&state.db_path)?.watch_roots;
  let active_roots = watch_roots.into_iter().filter(|root| !root.paused).collect::<Vec<LocalWatchRoot>>();

  if let Some(controller) = state
    .watcher_controller
    .lock()
    .map_err(|_| String::from("watcher_lock_failed"))?
    .take()
  {
    controller.stop();
  }

  if active_roots.is_empty() {
    return Ok(());
  }

  let (event_tx, event_rx) = mpsc::channel::<Result<Event, notify::Error>>();
  let mut watcher = RecommendedWatcher::new(
    move |result| {
      let _ = event_tx.send(result);
    },
    Config::default(),
  )
  .map_err(|error| error.to_string())?;

  let mut subscriptions = Vec::<WatchSubscription>::new();
  for root in &active_roots {
    let path = PathBuf::from(&root.path);
    if !path.exists() {
      continue;
    }
    watcher
      .watch(
        &path,
        if root.recursive {
          RecursiveMode::Recursive
        } else {
          RecursiveMode::NonRecursive
        },
      )
      .map_err(|error| error.to_string())?;
    subscriptions.push(WatchSubscription {
      profile_id: root.profile_id.clone(),
      root_path: path,
    });
  }

  if subscriptions.is_empty() {
    return Ok(());
  }

  let watch_root_count = subscriptions.len();
  let subscriptions_for_worker = subscriptions.clone();
  let (stop_tx, stop_rx) = mpsc::channel::<()>();
  let db_path = state.db_path.clone();
  let app_handle = app.clone();
  let worker = thread::spawn(move || {
    let mut dirty_profiles = HashMap::<String, HashSet<PathBuf>>::new();
    let mut last_event_at: Option<Instant> = None;
    loop {
      if stop_rx.try_recv().is_ok() {
        break;
      }
      match event_rx.recv_timeout(Duration::from_millis(300)) {
        Ok(Ok(event)) => {
          if let Some(changed_path) = event.paths.first() {
            for subscription in &subscriptions_for_worker {
              if changed_path.starts_with(&subscription.root_path) {
                dirty_profiles
                  .entry(subscription.profile_id.clone())
                  .or_default()
                  .insert(changed_path.clone());
              }
            }
          }
          last_event_at = Some(Instant::now());
        }
        Ok(Err(error)) => {
          let _ = storage::write_diagnostic_event(
            &db_path,
            "error",
            "watcher",
            "File watcher event error",
            &error.to_string(),
          );
        }
        Err(RecvTimeoutError::Disconnected) => break,
        Err(RecvTimeoutError::Timeout) => {}
      }

      if dirty_profiles.is_empty() {
        continue;
      }
      if let Some(last_event) = last_event_at {
        if last_event.elapsed() < QUIET_PERIOD {
          continue;
        }
      }

      let pending = std::mem::take(&mut dirty_profiles);
      last_event_at = None;
      for (profile_id, changed_paths) in pending {
        wait_for_stable_paths(&changed_paths.into_iter().collect::<Vec<PathBuf>>());
        if let Err(error) = rescan_profile(&app_handle, &db_path, &profile_id) {
          let _ = storage::write_diagnostic_event(
            &db_path,
            "error",
            "watcher",
            "Automatic rescan failed",
            &format!("profile_id={},reason={}", profile_id, error),
          );
        }
      }
    }
  });

  let controller = WatcherController {
    stop_tx,
    watcher,
    worker,
  };
  state
    .watcher_controller
    .lock()
    .map_err(|_| String::from("watcher_lock_failed"))?
    .replace(controller);
  storage::write_diagnostic_event(
    &state.db_path,
    "info",
    "watcher",
    "Started native file watcher",
    &format!("watch_roots={}", watch_root_count),
  )?;
  Ok(())
}

fn rescan_profile(app: &AppHandle, db_path: &Path, profile_id: &str) -> Result<(), String> {
  let watch_roots = storage::list_watch_roots_for_profile(db_path, profile_id)?;
  let format_rules = storage::list_format_rule_matches_for_profile(db_path, profile_id)?;
  let scanned = scanner::scan_watch_roots(&watch_roots, &format_rules)?;
  storage::save_scan_results(db_path, profile_id, &scanned)?;
  storage::write_diagnostic_event(
    db_path,
    "info",
    "watcher",
    "Background rescan completed",
    &format!("profile_id={},detected_files={}", profile_id, scanned.len()),
  )?;
  app.emit(SNAPSHOT_EVENT, true).map_err(|error| error.to_string())?;
  Ok(())
}

fn wait_for_stable_paths(paths: &[PathBuf]) {
  for path in paths {
    wait_for_stable_path(path);
  }
}

fn wait_for_stable_path(path: &Path) {
  if !path.exists() || !path.is_file() {
    return;
  }
  let mut previous = read_file_fingerprint(path);
  for _ in 0..STABILITY_CHECK_ATTEMPTS {
    thread::sleep(STABILITY_CHECK_DELAY);
    let current = read_file_fingerprint(path);
    if current == previous {
      break;
    }
    previous = current;
  }
}

fn read_file_fingerprint(path: &Path) -> Option<(u64, SystemTime)> {
  let metadata = path.metadata().ok()?;
  let modified = metadata.modified().ok()?;
  Some((metadata.len(), modified))
}
