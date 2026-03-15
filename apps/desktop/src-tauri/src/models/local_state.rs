use serde::{Deserialize, Serialize};

use crate::models::api::TournamentFormat;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUser {
  #[serde(rename = "userId")]
  pub user_id: String,
  #[serde(rename = "discordId")]
  pub discord_id: String,
  #[serde(rename = "displayName")]
  pub display_name: String,
  pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServerProfile {
  pub id: String,
  pub name: String,
  #[serde(rename = "baseUrl")]
  pub base_url: String,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalWatchRoot {
  pub id: String,
  #[serde(rename = "profileId")]
  pub profile_id: String,
  pub path: String,
  pub recursive: bool,
  pub paused: bool,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFormatRule {
  pub id: String,
  #[serde(rename = "profileId")]
  pub profile_id: String,
  #[serde(rename = "watchRootId")]
  pub watch_root_id: String,
  #[serde(rename = "matchType")]
  pub match_type: String,
  pub pattern: String,
  #[serde(rename = "formatId")]
  pub format_id: String,
  #[serde(rename = "formatName")]
  pub format_name: String,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDetectedFile {
  pub id: String,
  #[serde(rename = "profileId")]
  pub profile_id: String,
  #[serde(rename = "watchRootId")]
  pub watch_root_id: String,
  pub path: String,
  pub filename: String,
  #[serde(rename = "fileKind")]
  pub file_kind: String,
  pub checksum: String,
  #[serde(rename = "localState")]
  pub local_state: String,
  #[serde(rename = "formatId")]
  pub format_id: String,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDiagnosticEvent {
  pub id: String,
  pub level: String,
  pub category: String,
  pub message: String,
  pub detail: String,
  #[serde(rename = "createdAt")]
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalUploadJob {
  pub id: String,
  #[serde(rename = "profileId")]
  pub profile_id: String,
  pub filename: String,
  pub path: String,
  #[serde(rename = "fileKind")]
  pub file_kind: String,
  #[serde(rename = "localState")]
  pub local_state: String,
  #[serde(rename = "lifecyclePhase")]
  pub lifecycle_phase: Option<String>,
  pub checksum: String,
  #[serde(rename = "formatId")]
  pub format_id: String,
  #[serde(rename = "uploadId")]
  pub upload_id: String,
  #[serde(rename = "serverStatus")]
  pub server_status: String,
  #[serde(rename = "remoteChecksum")]
  pub remote_checksum: String,
  #[serde(rename = "lastRequestId")]
  pub last_request_id: String,
  #[serde(rename = "duplicateReason")]
  pub duplicate_reason: String,
  #[serde(rename = "nextRetryAfter")]
  pub next_retry_after: String,
  #[serde(rename = "queuedAt")]
  pub queued_at: String,
  #[serde(rename = "processingAt")]
  pub processing_at: String,
  #[serde(rename = "parsedAt")]
  pub parsed_at: String,
  #[serde(rename = "refreshingAt")]
  pub refreshing_at: String,
  #[serde(rename = "completedAt")]
  pub completed_at: String,
  #[serde(rename = "failedAt")]
  pub failed_at: String,
  pub error: String,
  pub retries: u32,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalUploadAttempt {
  pub id: String,
  #[serde(rename = "uploadJobId")]
  pub upload_job_id: String,
  #[serde(rename = "attemptNumber")]
  pub attempt_number: u32,
  pub status: String,
  pub detail: String,
  #[serde(rename = "createdAt")]
  pub created_at: String,
  #[serde(rename = "updatedAt")]
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopPreferences {
  #[serde(rename = "launchAtLogin")]
  pub launch_at_login: bool,
  #[serde(rename = "closeToTray")]
  pub close_to_tray: bool,
  #[serde(rename = "pollingIntervalSeconds")]
  pub polling_interval_seconds: u32,
  #[serde(rename = "diagnosticsRetentionDays")]
  pub diagnostics_retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSnapshot {
  pub profiles: Vec<LocalServerProfile>,
  #[serde(rename = "selectedProfileId")]
  pub selected_profile_id: String,
  #[serde(rename = "authProfileId")]
  pub auth_profile_id: String,
  #[serde(rename = "authUser")]
  pub auth_user: Option<SessionUser>,
  #[serde(rename = "tokenExpiresAt")]
  pub token_expires_at: String,
  #[serde(rename = "watchRoots")]
  pub watch_roots: Vec<LocalWatchRoot>,
  #[serde(rename = "formatRules")]
  pub format_rules: Vec<LocalFormatRule>,
  #[serde(rename = "detectedFiles")]
  pub detected_files: Vec<LocalDetectedFile>,
  #[serde(rename = "uploadJobs")]
  pub upload_jobs: Vec<LocalUploadJob>,
  #[serde(rename = "uploadAttempts")]
  pub upload_attempts: Vec<LocalUploadAttempt>,
  pub preferences: DesktopPreferences,
  pub diagnostics: Vec<LocalDiagnosticEvent>,
  #[serde(rename = "cachedFormats")]
  pub cached_formats: Vec<TournamentFormat>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveServerProfileInput {
  pub id: Option<String>,
  pub name: String,
  #[serde(rename = "baseUrl")]
  pub base_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddWatchRootInput {
  #[serde(rename = "profileId")]
  pub profile_id: String,
  pub path: String,
  pub recursive: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveFormatRuleInput {
  #[serde(rename = "profileId")]
  pub profile_id: String,
  #[serde(rename = "watchRootId")]
  pub watch_root_id: String,
  #[serde(rename = "matchType")]
  pub match_type: String,
  pub pattern: String,
  #[serde(rename = "formatId")]
  pub format_id: String,
  #[serde(rename = "formatName")]
  pub format_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePreferencesInput {
  #[serde(rename = "launchAtLogin")]
  pub launch_at_login: bool,
  #[serde(rename = "closeToTray")]
  pub close_to_tray: bool,
  #[serde(rename = "pollingIntervalSeconds")]
  pub polling_interval_seconds: u32,
  #[serde(rename = "diagnosticsRetentionDays")]
  pub diagnostics_retention_days: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignDetectedFileFormatInput {
  #[serde(rename = "detectedFileId")]
  pub detected_file_id: String,
  #[serde(rename = "formatId")]
  pub format_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddDiagnosticEventInput {
  pub level: String,
  pub category: String,
  pub message: String,
  pub detail: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompleteAuthExchangeInput {
  #[serde(rename = "profileId")]
  pub profile_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FinishAuthExchangeInput {
  #[serde(rename = "profileId")]
  pub profile_id: String,
  pub payload: crate::models::api::DesktopExchangeResponse,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FailAuthExchangeInput {
  #[serde(rename = "profileId")]
  pub profile_id: String,
  pub message: String,
  pub detail: String,
}
