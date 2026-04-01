use std::collections::HashMap;

use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Value;

fn deserialize_stringish<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    match Option::<Value>::deserialize(deserializer)? {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(value)) => Ok(value),
        Some(Value::Number(value)) => Ok(value.to_string()),
        Some(Value::Bool(value)) => Ok(value.to_string()),
        Some(value) => Err(de::Error::custom(format!(
            "unsupported scalar value: {value}"
        ))),
    }
}

fn deserialize_optional_u32ish<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    match Option::<Value>::deserialize(deserializer)? {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_u64()
            .and_then(|parsed| u32::try_from(parsed).ok())
            .map(Some)
            .ok_or_else(|| de::Error::custom(format!("unsupported numeric value: {value}"))),
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            trimmed
                .parse::<u32>()
                .map(Some)
                .map_err(|error| de::Error::custom(format!("invalid numeric string: {error}")))
        }
        Some(value) => Err(de::Error::custom(format!(
            "unsupported optional numeric value: {value}"
        ))),
    }
}

fn deserialize_u32ish<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(deserialize_optional_u32ish(deserializer)?.unwrap_or(0))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealth {
    pub ok: bool,
    pub service: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u32ish")]
    pub queue_depth: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_optional_u32ish")]
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
    #[serde(default)]
    pub tournament_id_prefix: String,
    pub run_environment: String,
    pub park_key: String,
    pub mode: String,
    #[serde(deserialize_with = "deserialize_stringish")]
    pub cap_value: String,
    #[serde(deserialize_with = "deserialize_stringish")]
    pub variant_limit_value: String,
    #[serde(default, deserialize_with = "deserialize_optional_u32ish")]
    pub ovr_min: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_optional_u32ish")]
    pub ovr_max: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_u32ish")]
    pub teams_per_tournament: u32,
    #[serde(default)]
    pub is_slots_tournament: bool,
    #[serde(default)]
    pub slot_counts: SlotCounts,
    pub era_restrictions: Vec<String>,
    pub card_type_restrictions: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SlotCounts {
    #[serde(rename = "P")]
    pub p: u32,
    #[serde(rename = "D")]
    pub d: u32,
    #[serde(rename = "G")]
    pub g: u32,
    #[serde(rename = "S")]
    pub s: u32,
    #[serde(rename = "B")]
    pub b: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatsResponse {
    pub ok: bool,
    pub rows: Vec<TournamentFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSessionUser {
    pub user_id: String,
    pub discord_id: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub ok: bool,
    pub user: ApiSessionUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopExchangeResponse {
    pub ok: bool,
    pub access_token: String,
    pub token_type: String,
    pub expires_at: String,
    pub user: ApiSessionUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCheckResponse {
    pub ok: bool,
    pub duplicate: bool,
    pub upload_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCreateResponse {
    pub ok: bool,
    pub upload_id: String,
    pub status: String,
    pub skipped: bool,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRecord {
    pub id: String,
    pub file_kind: String,
    pub game_version: String,
    pub status: String,
    pub error: String,
    pub imported_at: String,
    pub row_count: u32,
    pub queued_at: Option<String>,
    pub processing_at: Option<String>,
    pub parsed_at: Option<String>,
    pub refreshing_at: Option<String>,
    pub completed_at: Option<String>,
    pub failed_at: Option<String>,
    pub lifecycle_phase: Option<String>,
    pub duplicate_of_upload_id: Option<String>,
    pub context_json: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadDetailResponse {
    pub ok: bool,
    pub row: UploadRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardRow {
    pub card_id: u32,
    pub player_name: String,
    pub overall: u32,
    pub tier: u32,
    pub updated_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::TournamentFormat;

    #[test]
    fn parses_live_format_scalars() {
        let parsed = serde_json::from_str::<TournamentFormat>(
            r#"{
        "id":"6145900f-ff18-45eb-b309-2515320eb7c5",
        "mode":"Best of 5",
        "name":"Q-Bronze-Bo5-T16",
        "parkKey":"Heinsohn Ballpark 2026",
        "capValue":null,
        "formatType":"Quick",
        "tournamentIdPrefix":"123",
        "gameVersion":"ootp27",
        "runEnvironment":"2026",
        "eraRestrictions":[],
        "ovrMin":40,
        "ovrMax":"69",
        "teamsPerTournament":"16",
        "isSlotsTournament":true,
        "slotCounts":{"P":2,"D":3,"G":4,"S":5,"B":6},
        "variantLimitValue":10,
        "cardTypeRestrictions":[]
      }"#,
        )
        .expect("format should deserialize");

        assert_eq!(parsed.cap_value, "");
        assert_eq!(parsed.variant_limit_value, "10");
        assert_eq!(parsed.tournament_id_prefix, "123");
        assert_eq!(parsed.ovr_min, Some(40));
        assert_eq!(parsed.ovr_max, Some(69));
        assert_eq!(parsed.teams_per_tournament, 16);
        assert!(parsed.is_slots_tournament);
        assert_eq!(parsed.slot_counts.p, 2);
        assert_eq!(parsed.slot_counts.b, 6);
    }

    #[test]
    fn defaults_missing_tournament_id_prefix_for_cached_rows() {
        let parsed = serde_json::from_str::<TournamentFormat>(
            r#"{
        "id":"legacy-format",
        "mode":"Best of 5",
        "name":"Legacy Format",
        "parkKey":"Heinsohn Ballpark 2026",
        "capValue":null,
        "formatType":"Quick",
        "gameVersion":"ootp27",
        "runEnvironment":"2026",
        "eraRestrictions":[],
        "variantLimitValue":10,
        "cardTypeRestrictions":[]
      }"#,
        )
        .expect("legacy format should deserialize");

        assert_eq!(parsed.tournament_id_prefix, "");
        assert_eq!(parsed.ovr_min, None);
        assert_eq!(parsed.ovr_max, None);
        assert_eq!(parsed.teams_per_tournament, 0);
        assert!(!parsed.is_slots_tournament);
        assert_eq!(parsed.slot_counts.p, 0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsResponse {
    pub ok: bool,
    pub source: Option<String>,
    pub rows: Vec<CardRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyAggResponse {
    pub ok: bool,
    pub cards: Vec<HashMap<String, Value>>,
    pub teams: Vec<HashMap<String, Value>>,
}
