use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::services::file_watcher::WatcherController;

#[derive(Clone)]
pub struct AppState {
  pub db_path: PathBuf,
  pub watcher_controller: Arc<Mutex<Option<WatcherController>>>,
}
