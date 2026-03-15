use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealth {
  pub ok: bool,
  pub service: Option<String>,
  pub queue_depth: Option<u32>,
  pub failed_jobs: Option<u32>,
  pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentFormat {
  pub id: String,
  pub name: String,
  pub game_version: String,
  pub format_type: String,
  pub run_environment: String,
  pub park_key: String,
  pub mode: String,
  pub cap_value: String,
  pub variant_limit_value: String,
  pub ovr_restrictions: Vec<String>,
  pub era_restrictions: Vec<String>,
  pub card_type_restrictions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatsResponse {
  pub ok: bool,
  pub rows: Vec<TournamentFormat>,
}
