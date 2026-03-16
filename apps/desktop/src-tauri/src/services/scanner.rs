use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::models::local_state::LocalWatchRoot;

#[derive(Clone)]
pub struct ScanResult {
  pub watch_root_id: String,
  pub path: String,
  pub filename: String,
  pub file_kind: String,
  pub checksum: String,
  pub local_state: String,
  pub format_id: String,
}

#[derive(Clone)]
pub struct FormatRuleMatch {
  pub watch_root_id: String,
  pub match_type: String,
  pub pattern: String,
  pub format_id: String,
}

pub fn scan_watch_roots(watch_roots: &[LocalWatchRoot], format_rules: &[FormatRuleMatch]) -> Result<Vec<ScanResult>, String> {
  let mut results: Vec<ScanResult> = Vec::new();
  for watch_root in watch_roots.iter().filter(|root| !root.paused) {
    let root_path = PathBuf::from(&watch_root.path);
    if !root_path.exists() {
      continue;
    }
    collect_files(&root_path, watch_root.recursive, &mut |path| {
      if path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase() != "csv" {
        return Ok(());
      }
      if should_ignore_path(path) {
        return Ok(());
      }
      let bytes = fs::read(path).map_err(|error| error.to_string())?;
      let header_line = String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .map(|value| value.to_string())
        .unwrap_or_default();
      let header = split_header(&header_line);
      let file_kind = detect_kind(&header).to_string();
      let checksum = checksum_hex(&bytes);
      let format_id = resolve_format_id(path, watch_root, format_rules);
      let local_state = if file_kind == "unknown" {
        String::from("ignored")
      } else if file_kind == "stats_export" && format_id.is_empty() {
        String::from("awaiting_format_assignment")
      } else {
        String::from("queued_local")
      };
      results.push(ScanResult {
        watch_root_id: watch_root.id.clone(),
        path: path.to_string_lossy().to_string(),
        filename: path.file_name().and_then(|value| value.to_str()).unwrap_or_default().to_string(),
        file_kind,
        checksum,
        local_state,
        format_id,
      });
      Ok(())
    })?;
  }
  Ok(results)
}

fn should_ignore_path(path: &Path) -> bool {
  let filename = path.file_name().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
  filename.starts_with('.')
    || filename.starts_with("~$")
    || filename.ends_with(".tmp")
    || filename.ends_with(".part")
    || filename.ends_with(".crdownload")
}

fn collect_files(path: &Path, recursive: bool, visit: &mut dyn FnMut(&Path) -> Result<(), String>) -> Result<(), String> {
  let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
  if metadata.is_file() {
    return visit(path);
  }
  for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let child_path = entry.path();
    let child_metadata = entry.metadata().map_err(|error| error.to_string())?;
    if child_metadata.is_dir() {
      if recursive {
        collect_files(&child_path, recursive, visit)?;
      }
      continue;
    }
    visit(&child_path)?;
  }
  Ok(())
}

fn split_header(header_line: &str) -> Vec<String> {
  header_line.split(',').map(|column| column.trim().to_string()).collect()
}

fn detect_kind(header: &[String]) -> &'static str {
  let normalized = header.iter().map(|value| value.to_lowercase()).collect::<Vec<String>>();
  if contains_columns(
    &normalized,
    &[
      "card id",
      "card type",
      "throws",
      "position",
      "tier",
      "packs",
    ],
  ) {
    return "card_catalog";
  }
  if contains_columns(
    &normalized,
    &[
      "pos",
      "cid",
      "vlvl",
      "pa",
      "ip",
      "era+",
      "frm",
      "arm",
    ],
  ) {
    return "stats_export";
  }
  "unknown"
}

fn contains_columns(header: &[String], columns: &[&str]) -> bool {
  columns.iter().all(|column| header.iter().any(|value| value == &column.to_lowercase()))
}

fn checksum_hex(bytes: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  format!("{:x}", hasher.finalize())
}

fn resolve_format_id(path: &Path, watch_root: &LocalWatchRoot, format_rules: &[FormatRuleMatch]) -> String {
  let filename = path.file_name().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
  for rule in format_rules.iter().filter(|rule| rule.watch_root_id == watch_root.id) {
    if rule.match_type == "folder" {
      return rule.format_id.clone();
    }
    if !rule.pattern.is_empty() && filename.contains(&rule.pattern.to_lowercase()) {
      return rule.format_id.clone();
    }
  }
  String::new()
}

#[cfg(test)]
mod tests {
  use super::{detect_kind, resolve_format_id, should_ignore_path};
  use crate::models::local_state::LocalWatchRoot;
  use crate::services::scanner::FormatRuleMatch;
  use std::path::Path;

  fn watch_root() -> LocalWatchRoot {
    LocalWatchRoot {
      id: String::from("root-1"),
      profile_id: String::from("profile-1"),
      path: String::from("/tmp"),
      recursive: false,
      paused: false,
      created_at: String::from("2026-01-01T00:00:00.000Z"),
      updated_at: String::from("2026-01-01T00:00:00.000Z"),
    }
  }

  #[test]
  fn ignores_hidden_and_partial_downloads() {
    assert!(should_ignore_path(Path::new("/tmp/.hidden.csv")));
    assert!(should_ignore_path(Path::new("/tmp/~$temp.csv")));
    assert!(should_ignore_path(Path::new("/tmp/file.csv.part")));
    assert!(should_ignore_path(Path::new("/tmp/file.csv.crdownload")));
    assert!(!should_ignore_path(Path::new("/tmp/file.csv")));
  }

  #[test]
  fn detects_card_catalog_headers() {
    let header = ["Card ID", "Card Type", "Throws", "Position", "Tier", "Packs"]
      .iter()
      .map(|value| value.to_string())
      .collect::<Vec<String>>();
    assert_eq!(detect_kind(&header), "card_catalog");
  }

  #[test]
  fn detects_stats_export_headers() {
    let header = ["POS", "CID", "vLvl", "PA", "IP", "ERA+", "FRM", "ARM"]
      .iter()
      .map(|value| value.to_string())
      .collect::<Vec<String>>();
    assert_eq!(detect_kind(&header), "stats_export");
  }

  #[test]
  fn resolves_folder_rule_before_filename_match() {
    let root = watch_root();
    let rules = vec![
      FormatRuleMatch {
        watch_root_id: root.id.clone(),
        match_type: String::from("folder"),
        pattern: String::new(),
        format_id: String::from("folder-format"),
      },
      FormatRuleMatch {
        watch_root_id: root.id.clone(),
        match_type: String::from("filename"),
        pattern: String::from("sortable_stats"),
        format_id: String::from("filename-format"),
      },
    ];
    let format_id = resolve_format_id(
      Path::new("/tmp/pt27_statistics_player_statistics_-_sortable_stats_statsexport.csv"),
      &root,
      &rules,
    );
    assert_eq!(format_id, "folder-format");
  }

  #[test]
  fn resolves_filename_rule_when_no_folder_rule_exists() {
    let root = watch_root();
    let rules = vec![FormatRuleMatch {
      watch_root_id: root.id.clone(),
      match_type: String::from("filename"),
      pattern: String::from("sortable_stats"),
      format_id: String::from("filename-format"),
    }];
    let format_id = resolve_format_id(
      Path::new("/tmp/pt27_statistics_player_statistics_-_sortable_stats_statsexport.csv"),
      &root,
      &rules,
    );
    assert_eq!(format_id, "filename-format");
  }
}
