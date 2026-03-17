use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, Result as SqlResult};
use uuid::Uuid;

use crate::db::INITIAL_MIGRATION_SQL;
use crate::models::api::TournamentFormat;
use crate::models::local_state::{
    AddDiagnosticEventInput, AddWatchRootInput, DesktopPreferences, DesktopSnapshot,
    LocalDetectedFile, LocalDiagnosticEvent, LocalFormatRule, LocalServerProfile,
    LocalUploadAttempt, LocalUploadJob, LocalWatchRoot, SaveFormatRuleInput,
    SaveServerProfileInput, SessionUser, UpdatePreferencesInput,
};
use crate::services::scanner::{self, FormatRuleMatch, ScanResult};

fn now_iso() -> String {
    let now = std::time::SystemTime::now();
    let datetime = chrono_like::to_iso_string(now);
    datetime
}

pub fn ensure_db(db_path: &Path) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    migrate(&connection).map_err(|error| error.to_string())
}

pub fn open_db(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path).map_err(|error| error.to_string())
}

fn migrate(connection: &Connection) -> SqlResult<()> {
    connection.execute_batch(INITIAL_MIGRATION_SQL)?;
    ensure_table_column(
        connection,
        "detected_files",
        "tournament_id",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_table_column(
        connection,
        "detected_files",
        "local_presence",
        "TEXT NOT NULL DEFAULT 'present'",
    )?;
    ensure_table_column(
        connection,
        "upload_jobs",
        "tournament_id",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_table_column(
        connection,
        "upload_jobs",
        "local_presence",
        "TEXT NOT NULL DEFAULT 'present'",
    )?;
    ensure_table_column(
        connection,
        "detected_files",
        "staged_path",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_table_column(
        connection,
        "upload_jobs",
        "staged_path",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_upload_job_column(connection, "server_status", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "remote_checksum", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "last_request_id", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "duplicate_reason", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "next_retry_after", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "queued_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "processing_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "parsed_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "refreshing_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "completed_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_upload_job_column(connection, "failed_at", "TEXT NOT NULL DEFAULT ''")?;
    repair_cached_format_payloads(connection)?;
    Ok(())
}

pub fn load_snapshot(db_path: &Path) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let profiles = load_profiles(&connection)?;
    let selected_profile_id = load_setting(&connection, "selected_profile_id")?;
    let auth_profile_id = load_setting(&connection, "auth_profile_id")?;
    let auth_user = load_auth_user(&connection)?;
    let token_expires_at = auth_user
        .as_ref()
        .map(|_| load_setting(&connection, "token_expires_at"))
        .transpose()?
        .unwrap_or_default();
    let watch_roots = load_watch_roots(&connection)?;
    let format_rules = load_format_rules(&connection)?;
    let detected_files = load_detected_files(&connection)?;
    let upload_jobs = load_upload_jobs(&connection)?;
    let upload_attempts = load_upload_attempts(&connection)?;
    let preferences = load_preferences(&connection)?;
    let diagnostics = load_diagnostics(&connection)?;
    let cached_formats = load_cached_formats(&connection)?;

    Ok(DesktopSnapshot {
        profiles,
        selected_profile_id,
        auth_profile_id,
        auth_user,
        token_expires_at,
        watch_roots,
        format_rules,
        detected_files,
        upload_jobs,
        upload_attempts,
        preferences,
        diagnostics,
        cached_formats,
    })
}

pub fn save_server_profile(
    db_path: &Path,
    input: SaveServerProfileInput,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let profile_id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = now_iso();
    let existing_created_at = connection
        .query_row(
            "SELECT created_at FROM server_profiles WHERE profile_id = ?1",
            params![profile_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let created_at = existing_created_at.unwrap_or_else(|| now.clone());
    connection
        .execute(
            "
      INSERT INTO server_profiles (profile_id, profile_name, base_url, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(profile_id) DO UPDATE SET
        profile_name = excluded.profile_name,
        base_url = excluded.base_url,
        updated_at = excluded.updated_at
      ",
            params![
                profile_id,
                input.name.trim(),
                normalize_base_url(&input.base_url),
                created_at,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    save_setting(&connection, "selected_profile_id", &profile_id)
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn delete_server_profile(db_path: &Path, profile_id: &str) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "DELETE FROM server_profiles WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM watch_roots WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|error| error.to_string())?;
    let selected_profile_id =
        load_setting(&connection, "selected_profile_id").map_err(|error| error.to_string())?;
    if selected_profile_id == profile_id {
        save_setting(&connection, "selected_profile_id", "").map_err(|error| error.to_string())?;
    }
    load_snapshot(db_path)
}

pub fn select_server_profile(db_path: &Path, profile_id: &str) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    save_setting(&connection, "selected_profile_id", profile_id)
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn add_watch_root(db_path: &Path, input: AddWatchRootInput) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let watch_root_id = Uuid::new_v4().to_string();
    let now = now_iso();
    connection
    .execute(
      "
      INSERT INTO watch_roots (watch_root_id, profile_id, path, recursive, paused, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)
      ",
      params![
        watch_root_id,
        input.profile_id,
        input.path.trim(),
        if input.recursive { 1 } else { 0 },
        now,
        now
      ],
    )
    .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn save_format_rule(
    db_path: &Path,
    input: SaveFormatRuleInput,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let format_rule_id = Uuid::new_v4().to_string();
    let now = now_iso();
    connection
        .execute(
            "
      INSERT INTO format_rules (
        format_rule_id,
        profile_id,
        watch_root_id,
        match_type,
        pattern,
        format_id,
        format_name,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ",
            params![
                format_rule_id,
                input.profile_id,
                input.watch_root_id,
                input.match_type,
                input.pattern.trim(),
                input.format_id,
                input.format_name,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn delete_format_rule(db_path: &Path, format_rule_id: &str) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "DELETE FROM format_rules WHERE format_rule_id = ?1",
            params![format_rule_id],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn delete_watch_root(db_path: &Path, watch_root_id: &str) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "DELETE FROM watch_roots WHERE watch_root_id = ?1",
            params![watch_root_id],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn toggle_watch_root(
    db_path: &Path,
    watch_root_id: &str,
    paused: bool,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "UPDATE watch_roots SET paused = ?2, updated_at = ?3 WHERE watch_root_id = ?1",
            params![watch_root_id, if paused { 1 } else { 0 }, now_iso()],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn update_preferences(
    db_path: &Path,
    input: UpdatePreferencesInput,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    save_setting(
        &connection,
        "preferences_json",
        &serde_json::to_string(&DesktopPreferences {
            launch_at_login: input.launch_at_login,
            close_to_tray: input.close_to_tray,
            polling_interval_seconds: input.polling_interval_seconds,
            diagnostics_retention_days: input.diagnostics_retention_days,
        })
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn assign_detected_file_format(
    db_path: &Path,
    detected_file_id: &str,
    format_id: &str,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "
      UPDATE detected_files
      SET format_id = ?2,
          tournament_id = '',
          local_state = 'queued_local',
          updated_at = ?3
      WHERE detected_file_id = ?1
      ",
            params![detected_file_id, format_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;

    let row = connection
        .query_row(
            "SELECT profile_id, path FROM detected_files WHERE detected_file_id = ?1 LIMIT 1",
            params![detected_file_id],
            |result| Ok((result.get::<_, String>(0)?, result.get::<_, String>(1)?)),
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "
      UPDATE upload_jobs
      SET format_id = ?3,
          tournament_id = '',
          local_state = 'queued_local',
          updated_at = ?4
      WHERE profile_id = ?1
        AND path = ?2
      ",
            params![row.0, row.1, format_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;

    load_snapshot(db_path)
}

pub fn assign_detected_file_tournament(
    db_path: &Path,
    detected_file_id: &str,
    tournament_id: &str,
) -> Result<DesktopSnapshot, String> {
    let normalized_tournament_id = tournament_id.trim();
    if normalized_tournament_id.len() < 5 || normalized_tournament_id.len() > 7 {
        return Err(String::from("tournament_id_invalid"));
    }
    if !normalized_tournament_id
        .chars()
        .all(|value| value.is_ascii_digit())
    {
        return Err(String::from("tournament_id_invalid"));
    }

    let connection = open_db(db_path)?;
    let cached_formats = load_cached_formats(&connection)?;
    let matched_format = match_format_for_tournament_id(&cached_formats, normalized_tournament_id)?;

    connection
        .execute(
            "
      UPDATE detected_files
      SET format_id = ?2,
          tournament_id = ?3,
          local_state = 'queued_local',
          updated_at = ?4
      WHERE detected_file_id = ?1
      ",
            params![
                detected_file_id,
                matched_format.id,
                normalized_tournament_id,
                now_iso()
            ],
        )
        .map_err(|error| error.to_string())?;

    let row = connection
        .query_row(
            "SELECT profile_id, path FROM detected_files WHERE detected_file_id = ?1 LIMIT 1",
            params![detected_file_id],
            |result| Ok((result.get::<_, String>(0)?, result.get::<_, String>(1)?)),
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "
      UPDATE upload_jobs
      SET format_id = ?3,
          tournament_id = ?4,
          local_state = 'queued_local',
          updated_at = ?5
      WHERE profile_id = ?1
        AND path = ?2
      ",
            params![
                row.0,
                row.1,
                matched_format.id,
                normalized_tournament_id,
                now_iso()
            ],
        )
        .map_err(|error| error.to_string())?;

    load_snapshot(db_path)
}

fn match_format_for_tournament_id(
    formats: &[TournamentFormat],
    tournament_id: &str,
) -> Result<TournamentFormat, String> {
    let matched_formats = formats
        .iter()
        .filter(|format| {
            !format.tournament_id_prefix.is_empty()
                && tournament_id.len() == format.tournament_id_prefix.len() + 4
                && tournament_id.starts_with(&format.tournament_id_prefix)
        })
        .cloned()
        .collect::<Vec<TournamentFormat>>();

    if matched_formats.is_empty() {
        return Err(String::from("tournament_id_format_not_found"));
    }
    if matched_formats.len() > 1 {
        return Err(String::from("tournament_id_prefix_ambiguous"));
    }
    Ok(matched_formats[0].clone())
}

pub fn list_watch_roots_for_profile(
    db_path: &Path,
    profile_id: &str,
) -> Result<Vec<LocalWatchRoot>, String> {
    let connection = open_db(db_path)?;
    let watch_roots = load_watch_roots(&connection)?;
    Ok(watch_roots
        .into_iter()
        .filter(|root| root.profile_id == profile_id)
        .collect())
}

pub fn rescan_active_watch_roots(db_path: &Path) -> Result<usize, String> {
    let connection = open_db(db_path)?;
    let watch_roots = load_watch_roots(&connection)?;
    let active_profile_ids = watch_roots
        .iter()
        .filter(|root| !root.paused)
        .map(|root| root.profile_id.clone())
        .collect::<std::collections::BTreeSet<String>>();
    drop(connection);

    let mut total_detected = 0usize;
    for profile_id in active_profile_ids {
        let watch_roots = list_watch_roots_for_profile(db_path, &profile_id)?;
        let format_rules = list_format_rule_matches_for_profile(db_path, &profile_id)?;
        let scanned = scanner::scan_watch_roots(&watch_roots, &format_rules)?;
        total_detected += scanned.len();
        save_scan_results(db_path, &profile_id, &scanned)?;
    }
    Ok(total_detected)
}

pub fn list_format_rule_matches_for_profile(
    db_path: &Path,
    profile_id: &str,
) -> Result<Vec<FormatRuleMatch>, String> {
    let connection = open_db(db_path)?;
    let rules = load_format_rules(&connection)?;
    Ok(rules
        .into_iter()
        .filter(|rule| rule.profile_id == profile_id)
        .map(|rule| FormatRuleMatch {
            watch_root_id: rule.watch_root_id,
            match_type: rule.match_type,
            pattern: rule.pattern,
            format_id: rule.format_id,
        })
        .collect())
}

pub fn save_scan_results(
    db_path: &Path,
    profile_id: &str,
    rows: &[ScanResult],
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let cached_formats = load_cached_formats(&connection)?;
    connection
        .execute(
            "UPDATE detected_files SET local_presence = 'missing' WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE upload_jobs SET local_presence = 'missing' WHERE profile_id = ?1",
            params![profile_id],
        )
        .map_err(|error| error.to_string())?;

    for row in rows {
        let now = now_iso();
        let staged_path = stage_scan_file(db_path, profile_id, row)?;
        let existing_detected =
            load_detected_file_by_path_and_profile(&connection, profile_id, &row.path)?;
        let existing_upload_job = load_upload_job_by_content(
            &connection,
            profile_id,
            &row.path,
            &row.file_kind,
            &row.checksum,
        )?;

        let inferred_tournament_assignment = if row.file_kind == "stats_export" {
            infer_tournament_assignment_from_filename(&cached_formats, &row.filename)
                .filter(|(format_id, _)| row.format_id.is_empty() || row.format_id == *format_id)
        } else {
            None
        };
        let effective_format_id = if !row.format_id.is_empty() {
            row.format_id.clone()
        } else if let Some((format_id, _)) = &inferred_tournament_assignment {
            format_id.clone()
        } else if let Some(job) = &existing_upload_job {
            job.format_id.clone()
        } else if let Some(detected) = &existing_detected {
            detected.format_id.clone()
        } else {
            String::new()
        };
        let effective_tournament_id =
            if let Some((_, tournament_id)) = &inferred_tournament_assignment {
                tournament_id.clone()
            } else if let Some(job) = &existing_upload_job {
                job.tournament_id.clone()
            } else if let Some(detected) = &existing_detected {
                detected.tournament_id.clone()
            } else {
                String::new()
            };
        let detected_state = derive_detected_file_state(
            &row.file_kind,
            &effective_format_id,
            existing_upload_job.as_ref(),
        );

        if let Some(detected) = existing_detected {
            connection
                .execute(
                    "
          UPDATE detected_files
          SET watch_root_id = ?2,
              path = ?3,
              staged_path = ?4,
              filename = ?5,
              file_kind = ?6,
              checksum = ?7,
              local_state = ?8,
              local_presence = 'present',
              format_id = ?9,
              tournament_id = ?10,
              updated_at = ?11
          WHERE detected_file_id = ?1
          ",
                    params![
                        detected.id,
                        row.watch_root_id,
                        row.path,
                        staged_path,
                        row.filename,
                        row.file_kind,
                        row.checksum,
                        detected_state,
                        effective_format_id,
                        effective_tournament_id,
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        } else {
            let detected_file_id = Uuid::new_v4().to_string();
            connection
                .execute(
                    "
          INSERT INTO detected_files (
            detected_file_id,
            profile_id,
            watch_root_id,
            path,
            staged_path,
            filename,
            file_kind,
            checksum,
            local_state,
            local_presence,
            format_id,
            tournament_id,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'present', ?9, ?10, ?11, ?12, ?13)
          ",
                    params![
                        detected_file_id,
                        profile_id,
                        row.watch_root_id,
                        row.path,
                        staged_path,
                        row.filename,
                        row.file_kind,
                        row.checksum,
                        detected_state,
                        effective_format_id,
                        effective_tournament_id,
                        now,
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        if row.file_kind == "unknown" {
            continue;
        }

        if let Some(job) = existing_upload_job {
            let next_local_state = derive_existing_upload_local_state(
                &job.local_state,
                &row.file_kind,
                &effective_format_id,
                &job.upload_id,
            );
            let next_format_id = if !effective_format_id.is_empty() {
                effective_format_id.clone()
            } else {
                job.format_id.clone()
            };
            let next_tournament_id = if !effective_tournament_id.is_empty() {
                effective_tournament_id.clone()
            } else {
                job.tournament_id.clone()
            };
            connection
                .execute(
                    "
          UPDATE upload_jobs
          SET filename = ?2,
              path = ?3,
              staged_path = ?4,
              file_kind = ?5,
              local_presence = 'present',
              local_state = ?6,
              format_id = ?7,
              tournament_id = ?8,
              updated_at = CASE WHEN ?9 = 1 THEN ?10 ELSE updated_at END
          WHERE upload_job_id = ?1
          ",
                    params![
                        job.id,
                        row.filename,
                        row.path,
                        staged_path,
                        row.file_kind,
                        next_local_state,
                        next_format_id,
                        next_tournament_id,
                        if next_local_state != job.local_state
                            || job.local_presence != "present"
                            || job.staged_path != staged_path
                        {
                            1
                        } else {
                            0
                        },
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
            continue;
        }

        let upload_job_id = Uuid::new_v4().to_string();
        connection
            .execute(
                "
          INSERT INTO upload_jobs (
            upload_job_id,
            profile_id,
            filename,
            path,
            staged_path,
            file_kind,
            local_presence,
            local_state,
            lifecycle_phase,
            checksum,
            format_id,
            tournament_id,
            upload_id,
            server_status,
            remote_checksum,
            last_request_id,
            duplicate_reason,
            next_retry_after,
            queued_at,
            processing_at,
            parsed_at,
            refreshing_at,
            completed_at,
            failed_at,
            error,
            retries,
            created_at,
            updated_at
          )
          VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, 'present', ?7, NULL, ?8, ?9, ?10, '',
            '', '', '', '', '', '', '', '', '', '', '',
            '', 0, ?11, ?12
          )
          ",
                params![
                    upload_job_id,
                    profile_id,
                    row.filename,
                    row.path,
                    staged_path,
                    row.file_kind,
                    derive_new_upload_local_state(&row.file_kind, &effective_format_id),
                    row.checksum,
                    effective_format_id,
                    effective_tournament_id,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    load_snapshot(db_path)
}

pub fn add_diagnostic_event(
    db_path: &Path,
    event: AddDiagnosticEventInput,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    insert_diagnostic_event(
        &connection,
        &event.level,
        &event.category,
        &event.message,
        &event.detail,
    )
    .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn cache_formats(db_path: &Path, formats: &[TournamentFormat]) -> Result<(), String> {
    let connection = open_db(db_path)?;
    connection
        .execute("DELETE FROM cached_formats", [])
        .map_err(|error| error.to_string())?;
    let cached_at = now_iso();
    for format in formats {
        let payload_json = serde_json::to_string(format).map_err(|error| error.to_string())?;
        connection
      .execute(
        "INSERT INTO cached_formats (format_id, payload_json, cached_at) VALUES (?1, ?2, ?3)",
        params![format.id, payload_json, cached_at],
      )
      .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn write_diagnostic_event(
    db_path: &Path,
    level: &str,
    category: &str,
    message: &str,
    detail: &str,
) -> Result<(), String> {
    let connection = open_db(db_path)?;
    insert_diagnostic_event(&connection, level, category, message, detail)
        .map_err(|error| error.to_string())
}

pub fn save_auth_session(
    db_path: &Path,
    profile_id: &str,
    user: &SessionUser,
    access_token: &str,
    expires_at: &str,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    let now = now_iso();
    connection
        .execute("DELETE FROM auth_state", [])
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "
      INSERT INTO auth_state (
        auth_state_id,
        user_id,
        discord_id,
        display_name,
        role,
        token_expires_at,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ",
            params![
                Uuid::new_v4().to_string(),
                user.user_id,
                user.discord_id,
                user.display_name,
                user.role,
                expires_at,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    save_setting(&connection, "auth_profile_id", profile_id).map_err(|error| error.to_string())?;
    save_setting(&connection, "auth_bearer_token", access_token)
        .map_err(|error| error.to_string())?;
    save_setting(&connection, "token_expires_at", expires_at).map_err(|error| error.to_string())?;
    connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = 'queued_local',
          error = '',
          next_retry_after = '',
          updated_at = ?2
      WHERE profile_id = ?1
        AND local_state = 'auth_blocked'
      ",
            params![profile_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn clear_auth_session(db_path: &Path) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute("DELETE FROM auth_state", [])
        .map_err(|error| error.to_string())?;
    save_setting(&connection, "auth_profile_id", "").map_err(|error| error.to_string())?;
    save_setting(&connection, "auth_bearer_token", "").map_err(|error| error.to_string())?;
    save_setting(&connection, "token_expires_at", "").map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn load_access_token_for_profile(db_path: &Path, profile_id: &str) -> Result<String, String> {
    let connection = open_db(db_path)?;
    let auth_profile_id = load_setting(&connection, "auth_profile_id")?;
    if auth_profile_id != profile_id {
        return Err(String::from("authentication_required"));
    }
    let access_token = load_setting(&connection, "auth_bearer_token")?;
    if access_token.is_empty() {
        return Err(String::from("authentication_required"));
    }
    Ok(access_token)
}

pub fn mark_all_profile_jobs_auth_blocked(
    db_path: &Path,
    profile_id: &str,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = 'auth_blocked',
          updated_at = ?2
      WHERE profile_id = ?1
        AND local_state NOT IN ('complete', 'duplicate_skipped_local', 'failed_terminal')
      ",
            params![profile_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn load_profile_base_url(db_path: &Path, profile_id: &str) -> Result<PathBuf, String> {
    let connection = open_db(db_path)?;
    let base_url = connection
        .query_row(
            "SELECT base_url FROM server_profiles WHERE profile_id = ?1",
            params![profile_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    Ok(PathBuf::from(base_url))
}

fn derive_new_upload_local_state(file_kind: &str, format_id: &str) -> String {
    if file_kind == "stats_export" && format_id.is_empty() {
        String::from("awaiting_format_assignment")
    } else {
        String::from("queued_local")
    }
}

fn stage_scan_file(db_path: &Path, profile_id: &str, row: &ScanResult) -> Result<String, String> {
    let stage_root = db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("staged_uploads")
        .join(profile_id);
    fs::create_dir_all(&stage_root).map_err(|error| error.to_string())?;
    let staged_filename = format!("{}_{}", row.checksum, sanitize_filename(&row.filename));
    let staged_path = stage_root.join(staged_filename);
    let source_path = PathBuf::from(&row.path);
    let should_copy = if staged_path.exists() {
        let staged_metadata = staged_path.metadata().map_err(|error| error.to_string())?;
        let source_metadata = source_path.metadata().map_err(|error| error.to_string())?;
        staged_metadata.len() != source_metadata.len()
    } else {
        true
    };
    if should_copy {
        fs::copy(&source_path, &staged_path).map_err(|error| error.to_string())?;
    }
    Ok(staged_path.to_string_lossy().into_owned())
}

fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '.' | '_' | '-') {
                value
            } else {
                '_'
            }
        })
        .collect()
}

fn infer_tournament_assignment_from_filename(
    formats: &[TournamentFormat],
    filename: &str,
) -> Option<(String, String)> {
    let candidates = extract_bounded_digit_runs(filename)
        .into_iter()
        .filter(|value| (5..=7).contains(&value.len()))
        .collect::<Vec<String>>();
    for candidate in candidates {
        if let Ok(format) = match_format_for_tournament_id(formats, &candidate) {
            return Some((format.id, candidate));
        }
    }
    None
}

fn extract_bounded_digit_runs(value: &str) -> Vec<String> {
    let mut runs = Vec::new();
    let mut current = String::new();
    for ch in value.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
        } else if !current.is_empty() {
            runs.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        runs.push(current);
    }
    runs
}

fn derive_existing_upload_local_state(
    current_state: &str,
    file_kind: &str,
    format_id: &str,
    upload_id: &str,
) -> String {
    if !upload_id.is_empty() {
        return current_state.to_string();
    }
    match current_state {
        "complete" | "duplicate_skipped_local" | "failed_terminal" => current_state.to_string(),
        _ => derive_new_upload_local_state(file_kind, format_id),
    }
}

fn derive_detected_file_state(
    file_kind: &str,
    format_id: &str,
    existing_upload_job: Option<&LocalUploadJob>,
) -> String {
    if file_kind == "unknown" {
        return String::from("ignored");
    }
    if let Some(job) = existing_upload_job {
        if !job.upload_id.is_empty()
            || matches!(
                job.local_state.as_str(),
                "complete" | "duplicate_skipped_local" | "failed_terminal"
            )
        {
            return String::from("ignored");
        }
    }
    derive_new_upload_local_state(file_kind, format_id)
}

pub fn list_pending_upload_jobs_for_profile(
    db_path: &Path,
    profile_id: &str,
) -> Result<Vec<LocalUploadJob>, String> {
    let connection = open_db(db_path)?;
    let jobs = load_upload_jobs(&connection)?;
    let now = now_iso();
    Ok(jobs
        .into_iter()
        .filter(|job| {
            job.profile_id == profile_id
                && job.local_presence == "present"
                && matches!(
                    job.local_state.as_str(),
                    "queued_local" | "failed_retryable"
                )
                && (job.next_retry_after.is_empty() || job.next_retry_after <= now)
        })
        .collect())
}

pub fn list_active_upload_jobs_for_profile(
    db_path: &Path,
    profile_id: &str,
) -> Result<Vec<LocalUploadJob>, String> {
    let connection = open_db(db_path)?;
    let jobs = load_upload_jobs(&connection)?;
    Ok(jobs
        .into_iter()
        .filter(|job| {
            job.profile_id == profile_id
                && !job.upload_id.is_empty()
                && !matches!(
                    job.local_state.as_str(),
                    "complete" | "duplicate_skipped_local" | "failed_terminal"
                )
        })
        .collect())
}

pub fn load_upload_job_by_id(
    db_path: &Path,
    upload_job_id: &str,
) -> Result<LocalUploadJob, String> {
    let connection = open_db(db_path)?;
    let jobs = load_upload_jobs(&connection)?;
    jobs.into_iter()
        .find(|job| job.id == upload_job_id)
        .ok_or_else(|| String::from("upload_job_not_found"))
}

pub fn retry_upload_job(db_path: &Path, upload_job_id: &str) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = 'queued_local',
          error = '',
          next_retry_after = '',
          updated_at = ?2
      WHERE upload_job_id = ?1
      ",
            params![upload_job_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

pub fn dismiss_duplicate_upload_job(
    db_path: &Path,
    upload_job_id: &str,
) -> Result<DesktopSnapshot, String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = 'complete',
          updated_at = ?2
      WHERE upload_job_id = ?1
      ",
            params![upload_job_id, now_iso()],
        )
        .map_err(|error| error.to_string())?;
    load_snapshot(db_path)
}

#[allow(clippy::too_many_arguments)]
pub fn update_upload_job_metadata(
    db_path: &Path,
    upload_job_id: &str,
    local_state: &str,
    lifecycle_phase: Option<&str>,
    upload_id: Option<&str>,
    server_status: &str,
    remote_checksum: &str,
    last_request_id: &str,
    duplicate_reason: &str,
    next_retry_after: &str,
    queued_at: &str,
    processing_at: &str,
    parsed_at: &str,
    refreshing_at: &str,
    completed_at: &str,
    failed_at: &str,
    error: &str,
    retries: u32,
) -> Result<(), String> {
    let connection = open_db(db_path)?;
    connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = ?2,
          lifecycle_phase = ?3,
          upload_id = COALESCE(?4, upload_id),
          server_status = CASE WHEN ?5 = '' THEN server_status ELSE ?5 END,
          remote_checksum = CASE WHEN ?6 = '' THEN remote_checksum ELSE ?6 END,
          last_request_id = CASE WHEN ?7 = '' THEN last_request_id ELSE ?7 END,
          duplicate_reason = CASE WHEN ?8 = '' THEN duplicate_reason ELSE ?8 END,
          next_retry_after = ?9,
          queued_at = CASE WHEN ?10 = '' THEN queued_at ELSE ?10 END,
          processing_at = CASE WHEN ?11 = '' THEN processing_at ELSE ?11 END,
          parsed_at = CASE WHEN ?12 = '' THEN parsed_at ELSE ?12 END,
          refreshing_at = CASE WHEN ?13 = '' THEN refreshing_at ELSE ?13 END,
          completed_at = CASE WHEN ?14 = '' THEN completed_at ELSE ?14 END,
          failed_at = CASE WHEN ?15 = '' THEN failed_at ELSE ?15 END,
          error = ?16,
          retries = ?17,
          updated_at = ?18
      WHERE upload_job_id = ?1
      ",
            params![
                upload_job_id,
                local_state,
                lifecycle_phase,
                upload_id,
                server_status,
                remote_checksum,
                last_request_id,
                duplicate_reason,
                next_retry_after,
                queued_at,
                processing_at,
                parsed_at,
                refreshing_at,
                completed_at,
                failed_at,
                error,
                retries,
                now_iso()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn append_upload_attempt(
    db_path: &Path,
    upload_job_id: &str,
    attempt_number: u32,
    status: &str,
    detail: &str,
) -> Result<(), String> {
    let connection = open_db(db_path)?;
    let now = now_iso();
    connection
        .execute(
            "
      INSERT INTO upload_attempts (
        upload_attempt_id,
        upload_job_id,
        attempt_number,
        status,
        detail,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ",
            params![
                Uuid::new_v4().to_string(),
                upload_job_id,
                attempt_number,
                status,
                detail,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn repair_stale_upload_jobs(db_path: &Path) -> Result<usize, String> {
    let connection = open_db(db_path)?;
    let repaired_uploading = connection
    .execute(
      "
      UPDATE upload_jobs
      SET local_state = 'queued_local',
          error = '',
          next_retry_after = '',
          updated_at = ?1
      WHERE upload_id = ''
        AND local_state IN ('uploading', 'uploaded_waiting_server', 'server_queued', 'server_processing', 'server_refresh_pending', 'server_refreshing')
      ",
      params![now_iso()],
    )
    .map_err(|error| error.to_string())?;
    let repaired_auth_blocked = connection
        .execute(
            "
      UPDATE upload_jobs
      SET local_state = 'queued_local',
          updated_at = ?1
      WHERE local_state = 'auth_blocked'
        AND profile_id = (
          SELECT setting_value
          FROM app_settings
          WHERE setting_key = 'auth_profile_id'
        )
      ",
            params![now_iso()],
        )
        .map_err(|error| error.to_string())?;
    Ok(repaired_uploading + repaired_auth_blocked)
}

fn load_profiles(connection: &Connection) -> Result<Vec<LocalServerProfile>, String> {
    let mut statement = connection
        .prepare(
            "
      SELECT profile_id, profile_name, base_url, created_at, updated_at
      FROM server_profiles
      ORDER BY updated_at DESC, profile_name ASC
      ",
        )
        .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalServerProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalServerProfile>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_watch_roots(connection: &Connection) -> Result<Vec<LocalWatchRoot>, String> {
    let mut statement = connection
        .prepare(
            "
      SELECT watch_root_id, profile_id, path, recursive, paused, created_at, updated_at
      FROM watch_roots
      ORDER BY updated_at DESC
      ",
        )
        .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalWatchRoot {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                path: row.get(2)?,
                recursive: row.get::<_, i64>(3)? == 1,
                paused: row.get::<_, i64>(4)? == 1,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalWatchRoot>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_format_rules(connection: &Connection) -> Result<Vec<LocalFormatRule>, String> {
    let mut statement = connection
    .prepare(
      "
      SELECT format_rule_id, profile_id, watch_root_id, match_type, pattern, format_id, format_name, created_at, updated_at
      FROM format_rules
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalFormatRule {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                watch_root_id: row.get(2)?,
                match_type: row.get(3)?,
                pattern: row.get(4)?,
                format_id: row.get(5)?,
                format_name: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalFormatRule>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_detected_file_by_path_and_profile(
    connection: &Connection,
    profile_id: &str,
    path: &str,
) -> Result<Option<LocalDetectedFile>, String> {
    let mut rows = load_detected_files(connection)?
        .into_iter()
        .filter(|row| row.profile_id == profile_id && row.path == path)
        .collect::<Vec<LocalDetectedFile>>();
    rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(rows.into_iter().next())
}

fn load_upload_job_by_content(
    connection: &Connection,
    profile_id: &str,
    path: &str,
    file_kind: &str,
    checksum: &str,
) -> Result<Option<LocalUploadJob>, String> {
    let mut rows = load_upload_jobs(connection)?
        .into_iter()
        .filter(|row| {
            row.profile_id == profile_id
                && row.path == path
                && row.file_kind == file_kind
                && row.checksum == checksum
        })
        .collect::<Vec<LocalUploadJob>>();
    rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(rows.into_iter().next())
}

fn load_detected_files(connection: &Connection) -> Result<Vec<LocalDetectedFile>, String> {
    let mut statement = connection
    .prepare(
      "
      SELECT detected_file_id, profile_id, watch_root_id, path, staged_path, filename, file_kind, checksum, local_state, local_presence, format_id, tournament_id, created_at, updated_at
      FROM detected_files
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalDetectedFile {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                watch_root_id: row.get(2)?,
                path: row.get(3)?,
                staged_path: row.get(4)?,
                filename: row.get(5)?,
                file_kind: row.get(6)?,
                checksum: row.get(7)?,
                local_state: row.get(8)?,
                local_presence: row.get(9)?,
                format_id: row.get(10)?,
                tournament_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalDetectedFile>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_upload_jobs(connection: &Connection) -> Result<Vec<LocalUploadJob>, String> {
    let mut statement = connection
    .prepare(
      "
      SELECT upload_job_id, profile_id, filename, path, staged_path, file_kind, local_presence, local_state, lifecycle_phase, checksum, format_id, tournament_id, upload_id,
             error, retries, created_at, updated_at, server_status, remote_checksum, last_request_id, duplicate_reason,
             next_retry_after, queued_at, processing_at, parsed_at, refreshing_at, completed_at, failed_at
      FROM upload_jobs
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalUploadJob {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                filename: row.get(2)?,
                path: row.get(3)?,
                staged_path: row.get(4)?,
                file_kind: row.get(5)?,
                local_presence: row.get(6)?,
                local_state: row.get(7)?,
                lifecycle_phase: row.get(8)?,
                checksum: row.get(9)?,
                format_id: row.get(10)?,
                tournament_id: row.get(11)?,
                upload_id: row.get(12)?,
                error: row.get(13)?,
                retries: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                server_status: row.get(17)?,
                remote_checksum: row.get(18)?,
                last_request_id: row.get(19)?,
                duplicate_reason: row.get(20)?,
                next_retry_after: row.get(21)?,
                queued_at: row.get(22)?,
                processing_at: row.get(23)?,
                parsed_at: row.get(24)?,
                refreshing_at: row.get(25)?,
                completed_at: row.get(26)?,
                failed_at: row.get(27)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalUploadJob>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_upload_attempts(connection: &Connection) -> Result<Vec<LocalUploadAttempt>, String> {
    let mut statement = connection
    .prepare(
      "
      SELECT upload_attempt_id, upload_job_id, attempt_number, status, detail, created_at, updated_at
      FROM upload_attempts
      ORDER BY updated_at DESC
      ",
    )
    .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalUploadAttempt {
                id: row.get(0)?,
                upload_job_id: row.get(1)?,
                attempt_number: row.get(2)?,
                status: row.get(3)?,
                detail: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalUploadAttempt>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_diagnostics(connection: &Connection) -> Result<Vec<LocalDiagnosticEvent>, String> {
    let mut statement = connection
        .prepare(
            "
      SELECT event_id, level, category, message, detail, created_at
      FROM diagnostic_events
      ORDER BY created_at DESC
      LIMIT 100
      ",
        )
        .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            Ok(LocalDiagnosticEvent {
                id: row.get(0)?,
                level: row.get(1)?,
                category: row.get(2)?,
                message: row.get(3)?,
                detail: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<LocalDiagnosticEvent>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn load_auth_user(connection: &Connection) -> Result<Option<SessionUser>, String> {
    let row = connection
        .query_row(
            "
      SELECT user_id, discord_id, display_name, role
      FROM auth_state
      ORDER BY updated_at DESC
      LIMIT 1
      ",
            [],
            |row| {
                Ok(SessionUser {
                    user_id: row.get(0)?,
                    discord_id: row.get(1)?,
                    display_name: row.get(2)?,
                    role: row.get(3)?,
                })
            },
        )
        .ok();
    Ok(row)
}

fn load_cached_formats(connection: &Connection) -> Result<Vec<TournamentFormat>, String> {
    let mut statement = connection
        .prepare("SELECT payload_json FROM cached_formats ORDER BY format_id ASC")
        .map_err(|error| error.to_string())?;
    let mapped = statement
        .query_map([], |row| {
            let payload_json: String = row.get(0)?;
            let parsed =
                serde_json::from_str::<TournamentFormat>(&payload_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        payload_json.len(),
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
            Ok(parsed)
        })
        .map_err(|error| error.to_string())?;
    let rows = mapped
        .collect::<SqlResult<Vec<TournamentFormat>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn repair_cached_format_payloads(connection: &Connection) -> SqlResult<()> {
    let mut statement = connection
        .prepare("SELECT format_id, payload_json FROM cached_formats ORDER BY format_id ASC")?;
    let mapped = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let rows = mapped.collect::<SqlResult<Vec<(String, String)>>>()?;

    for (format_id, payload_json) in rows {
        let Ok(mut parsed) = serde_json::from_str::<serde_json::Value>(&payload_json) else {
            continue;
        };
        let Some(object) = parsed.as_object_mut() else {
            continue;
        };
        if object.contains_key("tournamentIdPrefix") {
            continue;
        }
        object.insert(
            String::from("tournamentIdPrefix"),
            serde_json::Value::String(String::new()),
        );
        let next_payload = serde_json::to_string(&parsed)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        connection.execute(
            "UPDATE cached_formats SET payload_json = ?2 WHERE format_id = ?1",
            params![format_id, next_payload],
        )?;
    }

    Ok(())
}

fn load_setting(connection: &Connection, key: &str) -> Result<String, String> {
    let value = connection
        .query_row(
            "SELECT setting_value FROM app_settings WHERE setting_key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
    Ok(value)
}

fn load_preferences(connection: &Connection) -> Result<DesktopPreferences, String> {
    let raw = load_setting(connection, "preferences_json")?;
    if raw.is_empty() {
        return Ok(DesktopPreferences {
            launch_at_login: false,
            close_to_tray: true,
            polling_interval_seconds: 5,
            diagnostics_retention_days: 14,
        });
    }
    serde_json::from_str::<DesktopPreferences>(&raw).map_err(|error| error.to_string())
}

fn save_setting(connection: &Connection, key: &str, value: &str) -> SqlResult<()> {
    connection.execute(
        "
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES (?1, ?2)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    ",
        params![key, value],
    )?;
    Ok(())
}

fn normalize_base_url(value: &str) -> String {
    value.trim_end_matches('/').trim().to_string()
}

fn insert_diagnostic_event(
    connection: &Connection,
    level: &str,
    category: &str,
    message: &str,
    detail: &str,
) -> SqlResult<()> {
    connection.execute(
        "
    INSERT INTO diagnostic_events (event_id, level, category, message, detail, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ",
        params![
            Uuid::new_v4().to_string(),
            level,
            category,
            message,
            detail,
            now_iso()
        ],
    )?;
    Ok(())
}

fn ensure_table_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    column_sql: &str,
) -> SqlResult<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let mapped = statement.query_map([], |row| row.get::<_, String>(1))?;
    let columns = mapped.collect::<SqlResult<Vec<String>>>()?;
    if columns.iter().any(|column| column == column_name) {
        return Ok(());
    }
    connection.execute(
        &format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"),
        [],
    )?;
    Ok(())
}

fn ensure_upload_job_column(
    connection: &Connection,
    column_name: &str,
    column_sql: &str,
) -> SqlResult<()> {
    ensure_table_column(connection, "upload_jobs", column_name, column_sql)
}

#[cfg(test)]
mod tests {
    use super::match_format_for_tournament_id;
    use crate::models::api::TournamentFormat;

    fn format(id: &str, prefix: &str) -> TournamentFormat {
        TournamentFormat {
            id: String::from(id),
            name: String::from(id),
            game_version: String::from("ootp27"),
            format_type: String::from("Quick"),
            tournament_id_prefix: String::from(prefix),
            run_environment: String::from("2026"),
            park_key: String::from("Test Park"),
            mode: String::from("Best of 5"),
            cap_value: String::new(),
            variant_limit_value: String::new(),
            ovr_restrictions: Vec::new(),
            era_restrictions: Vec::new(),
            card_type_restrictions: Vec::new(),
        }
    }

    #[test]
    fn matches_format_using_prefix_and_fixed_suffix_length() {
        let formats = vec![format("fmt-1", "12"), format("fmt-2", "345")];
        let matched =
            match_format_for_tournament_id(&formats, "3456789").expect("format should match");
        assert_eq!(matched.id, "fmt-2");
    }

    #[test]
    fn rejects_when_no_prefix_matches_tournament_id() {
        let formats = vec![format("fmt-1", "12")];
        let error =
            match_format_for_tournament_id(&formats, "99999").expect_err("match should fail");
        assert_eq!(error, "tournament_id_format_not_found");
    }

    #[test]
    fn rejects_when_multiple_formats_share_same_prefix() {
        let formats = vec![format("fmt-1", "12"), format("fmt-2", "12")];
        let error = match_format_for_tournament_id(&formats, "120001")
            .expect_err("match should be ambiguous");
        assert_eq!(error, "tournament_id_prefix_ambiguous");
    }
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
            pub fn from_unix(secs: i64, nanos: u32) -> Self {
                let days = secs.div_euclid(86_400);
                let seconds_of_day = secs.rem_euclid(86_400) as u32;
                let (year, month, day) = civil_from_days(days);
                Self {
                    year,
                    month,
                    day,
                    hour: seconds_of_day / 3_600,
                    minute: (seconds_of_day % 3_600) / 60,
                    second: seconds_of_day % 60,
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

        fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
            let z = days_since_epoch + 719_468;
            let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
            let doe = z - era * 146_097;
            let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
            let year = yoe as i32 + era as i32 * 400;
            let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            let mp = (5 * doy + 2) / 153;
            let day = doy - (153 * mp + 2) / 5 + 1;
            let month = mp + if mp < 10 { 3 } else { -9 };
            let year = year + if month <= 2 { 1 } else { 0 };
            (year, month as u32, day as u32)
        }
    }
}
