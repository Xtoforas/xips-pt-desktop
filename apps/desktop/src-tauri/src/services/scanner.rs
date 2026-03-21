use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};

use crate::models::local_state::LocalWatchRoot;

#[derive(Clone)]
pub struct ScanResult {
    pub watch_root_id: String,
    pub path: String,
    pub filename: String,
    pub file_kind: String,
    pub checksum: String,
    pub team_count: u32,
    pub source_modified_at: String,
    pub format_id: String,
    pub validation_error: String,
}

#[derive(Clone)]
pub struct FormatRuleMatch {
    pub watch_root_id: String,
    pub match_type: String,
    pub pattern: String,
    pub format_id: String,
}

pub fn scan_watch_roots(
    watch_roots: &[LocalWatchRoot],
    format_rules: &[FormatRuleMatch],
) -> Result<Vec<ScanResult>, String> {
    let mut results: Vec<ScanResult> = Vec::new();
    for watch_root in watch_roots.iter().filter(|root| !root.paused) {
        let root_path = PathBuf::from(&watch_root.path);
        if !root_path.exists() {
            continue;
        }
        collect_files(&root_path, watch_root.recursive, &mut |path| {
            if path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_lowercase()
                != "csv"
            {
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
            let validation_error = if file_kind == "stats_export" {
                validate_stats_export(&bytes, &header).unwrap_or_default()
            } else {
                String::new()
            };
            let checksum = checksum_hex(&bytes);
            let team_count = if file_kind == "stats_export" {
                read_team_count(&bytes, &header)
            } else {
                0
            };
            let source_modified_at = read_source_modified_at(path);
            let format_id = resolve_format_id(path, watch_root, format_rules);
            results.push(ScanResult {
                watch_root_id: watch_root.id.clone(),
                path: path.to_string_lossy().to_string(),
                filename: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_string(),
                file_kind,
                checksum,
                team_count,
                source_modified_at,
                format_id,
                validation_error,
            });
            Ok(())
        })?;
    }
    Ok(results)
}

fn should_ignore_path(path: &Path) -> bool {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    filename.starts_with('.')
        || filename.starts_with("~$")
        || filename.ends_with(".tmp")
        || filename.ends_with(".part")
        || filename.ends_with(".crdownload")
}

fn collect_files(
    path: &Path,
    recursive: bool,
    visit: &mut dyn FnMut(&Path) -> Result<(), String>,
) -> Result<(), String> {
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
    parse_csv_line(header_line)
}

fn detect_kind(header: &[String]) -> &'static str {
    let normalized = header
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<Vec<String>>();
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
        &["pos", "cid", "vlvl", "pa", "ip", "era+", "frm", "arm"],
    ) {
        return "stats_export";
    }
    "unknown"
}

fn contains_columns(header: &[String], columns: &[&str]) -> bool {
    columns
        .iter()
        .all(|column| header.iter().any(|value| value == &column.to_lowercase()))
}

fn checksum_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn read_source_modified_at(path: &Path) -> String {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_default()
}

fn read_team_count(bytes: &[u8], header: &[String]) -> u32 {
    let team_index = header
        .iter()
        .map(|value| value.trim().to_lowercase())
        .position(|value| value == "tm");
    let Some(team_index) = team_index else {
        return 0;
    };

    let mut teams = HashSet::<String>::new();
    for line in String::from_utf8_lossy(bytes).lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }
        let row = parse_csv_line(line);
        let Some(team) = row.get(team_index) else {
            continue;
        };
        let normalized = team.trim();
        if normalized.is_empty() {
            continue;
        }
        teams.insert(normalized.to_string());
    }
    teams.len() as u32
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                if in_quotes && matches!(chars.peek(), Some('"')) {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    values.push(current.trim().to_string());
    values
}

fn validate_stats_export(bytes: &[u8], header: &[String]) -> Option<String> {
    let normalized_header = header
        .iter()
        .map(|value| value.trim().to_lowercase())
        .collect::<Vec<String>>();

    let batter_indexes = column_indexes(
        &normalized_header,
        &["pa", "ab", "h", "hr", "rbi", "bb", "sb"],
    );
    let pitcher_indexes = column_indexes(
        &normalized_header,
        &["ip", "bf", "ha", "er", "bb_1", "k_1", "ra"],
    );
    let key_stat_indexes = column_indexes(
        &normalized_header,
        &[
            "g", "gs", "pa", "ab", "h", "hr", "rbi", "r", "bb", "sb", "ip", "bf", "ha", "er",
            "k_1", "ra",
        ],
    );

    let mut has_batting_activity = false;
    let mut has_pitching_activity = false;
    let mut has_any_key_stat_activity = false;
    let mut saw_data_row = false;

    for line in String::from_utf8_lossy(bytes).lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }
        let row = parse_csv_line(line);
        if row.iter().all(|value| value.trim().is_empty()) {
            continue;
        }
        saw_data_row = true;
        has_batting_activity |= row_has_non_zero_value(&row, &batter_indexes);
        has_pitching_activity |= row_has_non_zero_value(&row, &pitcher_indexes);
        has_any_key_stat_activity |= row_has_non_zero_value(&row, &key_stat_indexes);
    }

    if !saw_data_row {
        return None;
    }
    if !has_any_key_stat_activity {
        return Some(String::from(
            "Blocked export: stats are zero for every row.",
        ));
    }
    if has_pitching_activity && !has_batting_activity {
        return Some(String::from(
            "Blocked export: all rows look like pitchers and no batting stats were found.",
        ));
    }
    if has_batting_activity && !has_pitching_activity {
        return Some(String::from(
            "Blocked export: all rows look like batters and no pitching stats were found.",
        ));
    }
    None
}

fn column_indexes(header: &[String], columns: &[&str]) -> Vec<usize> {
    columns
        .iter()
        .filter_map(|column| {
            header
                .iter()
                .position(|value| value == &column.to_lowercase())
        })
        .collect()
}

fn row_has_non_zero_value(row: &[String], indexes: &[usize]) -> bool {
    indexes.iter().any(|index| {
        row.get(*index)
            .map(|value| parse_numeric_value(value) != 0.0)
            .unwrap_or(false)
    })
}

fn parse_numeric_value(value: &str) -> f64 {
    value.trim().parse::<f64>().unwrap_or(0.0)
}

fn resolve_format_id(
    path: &Path,
    watch_root: &LocalWatchRoot,
    format_rules: &[FormatRuleMatch],
) -> String {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    for rule in format_rules
        .iter()
        .filter(|rule| rule.watch_root_id == watch_root.id)
    {
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
    use super::{
        detect_kind, resolve_format_id, should_ignore_path, split_header, validate_stats_export,
    };
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
        let header = [
            "Card ID",
            "Card Type",
            "Throws",
            "Position",
            "Tier",
            "Packs",
        ]
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

    #[test]
    fn blocks_all_pitcher_exports() {
        let header = split_header("POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM");
        let csv = "POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM\nSP,1,Pitcher,70,R,R,TM,1,10,10,0,0,0,0,0,0,0,0,25.0,100,20,5,5,30,4,0,0\nRP,2,Pitcher Two,68,R,R,TM,1,8,0,0,0,0,0,0,0,0,0,12.0,50,10,2,2,12,2,0,0";
        assert_eq!(
            validate_stats_export(csv.as_bytes(), &header).as_deref(),
            Some("Blocked export: all rows look like pitchers and no batting stats were found.")
        );
    }

    #[test]
    fn blocks_all_batter_exports() {
        let header = split_header("POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM");
        let csv = "POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM\nCF,1,Batter,70,R,R,TM,1,10,10,40,35,12,2,8,9,4,1,0,0,0,0,0,0,0,0,0\n1B,2,Batter Two,68,R,R,TM,1,8,8,30,28,9,1,6,5,2,0,0,0,0,0,0,0,0,0,0";
        assert_eq!(
            validate_stats_export(csv.as_bytes(), &header).as_deref(),
            Some("Blocked export: all rows look like batters and no pitching stats were found.")
        );
    }

    #[test]
    fn blocks_zeroed_exports() {
        let header = split_header("POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM");
        let csv = "POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,HR,RBI,R,BB,SB,IP,BF,HA,ER,RA,K_1,BB_1,FRM,ARM\nSP,1,Zero,70,R,R,TM,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0\nCF,2,Zero Two,68,R,R,TM,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
        assert_eq!(
            validate_stats_export(csv.as_bytes(), &header).as_deref(),
            Some("Blocked export: stats are zero for every row.")
        );
    }
}
