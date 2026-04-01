use reqwest::{header, Client, Method, Response};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::models::api::{
    CardsResponse, DuplicateCheckResponse, FormatsResponse, MeResponse, MyAggResponse,
    ServiceHealth, TournamentFormat, UploadCreateResponse, UploadDetailResponse,
};

pub struct ApiResponse<T> {
    pub payload: T,
    pub request_id: String,
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: u16,
    pub code: String,
    pub request_id: String,
    pub detail: String,
}

impl ApiError {
    pub fn is_auth_error(&self) -> bool {
        self.status == 401 || self.code == "authentication_required"
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.request_id.is_empty() {
            write!(formatter, "{} ({})", self.code, self.detail)
        } else {
            write!(
                formatter,
                "{} ({}) [requestId={}]",
                self.code, self.detail, self.request_id
            )
        }
    }
}

impl std::error::Error for ApiError {}

pub async fn check_health(base_url: &str) -> Result<ServiceHealth, String> {
    let client = Client::new();
    let url = format!("{}/health", base_url.trim_end_matches('/'));
    let response = client
        .get(url)
        .header(
            header::ACCEPT,
            "application/json, text/plain;q=0.9, */*;q=0.8",
        )
        .send()
        .await
        .map_err(|error| format!("request_failed: {error}"))?;
    parse_health_response(response).await
}

pub async fn fetch_formats(base_url: &str) -> Result<Vec<TournamentFormat>, String> {
    let response = send_json::<FormatsResponse>(
        &Client::new(),
        Method::GET,
        &format!(
            "{}/api/v1/formats?gameVersion=ootp27",
            base_url.trim_end_matches('/')
        ),
        None,
        None,
    )
    .await
    .map_err(|error| error.to_string())?;
    Ok(response.payload.rows)
}

pub async fn fetch_me(
    base_url: &str,
    access_token: &str,
) -> Result<ApiResponse<MeResponse>, ApiError> {
    send_json::<MeResponse>(
        &Client::new(),
        Method::GET,
        &format!("{}/api/v1/me", base_url.trim_end_matches('/')),
        Some(access_token),
        None,
    )
    .await
}

pub async fn logout(base_url: &str, access_token: &str) -> Result<ApiResponse<Value>, ApiError> {
    send_json::<Value>(
        &Client::new(),
        Method::POST,
        &format!("{}/api/v1/auth/logout", base_url.trim_end_matches('/')),
        Some(access_token),
        Some(json!({})),
    )
    .await
}

pub async fn create_upload(
    base_url: &str,
    access_token: &str,
    source_filename: &str,
    raw_content: &str,
    file_kind: &str,
    format_id: &str,
    tournament_id: &str,
) -> Result<ApiResponse<UploadCreateResponse>, ApiError> {
    let mut body = json!({
      "sourceFilename": source_filename,
      "mode": "tournament",
      "fileKind": file_kind,
      "gameVersion": "ootp27",
      "rawContent": raw_content
    });
    if file_kind == "stats_export" {
        body["formatId"] = Value::String(format_id.to_string());
        if !tournament_id.trim().is_empty() {
            body["tournamentId"] = Value::String(tournament_id.trim().to_string());
        }
    }
    send_json::<UploadCreateResponse>(
        &Client::new(),
        Method::POST,
        &format!("{}/api/v1/my/uploads", base_url.trim_end_matches('/')),
        Some(access_token),
        Some(body),
    )
    .await
}

pub async fn check_duplicate(
    base_url: &str,
    access_token: &str,
    checksum: &str,
    file_kind: &str,
    format_id: &str,
) -> Result<ApiResponse<DuplicateCheckResponse>, ApiError> {
    let mut body = json!({
      "checksum": checksum,
      "fileKind": file_kind,
      "gameVersion": "ootp27"
    });
    if file_kind == "stats_export" {
        body["formatId"] = Value::String(format_id.to_string());
    }
    send_json::<DuplicateCheckResponse>(
        &Client::new(),
        Method::POST,
        &format!(
            "{}/api/v1/my/uploads/check-duplicate",
            base_url.trim_end_matches('/')
        ),
        Some(access_token),
        Some(body),
    )
    .await
}

pub async fn fetch_upload_detail(
    base_url: &str,
    access_token: &str,
    upload_id: &str,
) -> Result<ApiResponse<UploadDetailResponse>, ApiError> {
    send_json::<UploadDetailResponse>(
        &Client::new(),
        Method::GET,
        &format!(
            "{}/api/v1/my/uploads/{}",
            base_url.trim_end_matches('/'),
            upload_id
        ),
        Some(access_token),
        None,
    )
    .await
}

pub async fn fetch_cards(
    base_url: &str,
    access_token: &str,
    format_id: &str,
) -> Result<ApiResponse<CardsResponse>, ApiError> {
    let suffix = if format_id.is_empty() {
        String::new()
    } else {
        format!("&formatId={format_id}")
    };
    send_json::<CardsResponse>(
        &Client::new(),
        Method::GET,
        &format!(
            "{}/api/v1/cards?gameVersion=ootp27{}",
            base_url.trim_end_matches('/'),
            suffix
        ),
        Some(access_token),
        None,
    )
    .await
}

pub async fn fetch_my_agg(
    base_url: &str,
    access_token: &str,
) -> Result<ApiResponse<MyAggResponse>, ApiError> {
    send_json::<MyAggResponse>(
        &Client::new(),
        Method::GET,
        &format!("{}/api/v1/my/agg", base_url.trim_end_matches('/')),
        Some(access_token),
        None,
    )
    .await
}

fn authorized_request(
    client: &Client,
    method: Method,
    url: &str,
    access_token: Option<&str>,
) -> reqwest::RequestBuilder {
    let builder = client.request(method, url);
    if let Some(token) = access_token {
        builder.header(header::AUTHORIZATION, format!("Bearer {token}"))
    } else {
        builder
    }
}

async fn send_json<T: DeserializeOwned>(
    client: &Client,
    method: Method,
    url: &str,
    access_token: Option<&str>,
    body: Option<Value>,
) -> Result<ApiResponse<T>, ApiError> {
    let mut builder = authorized_request(client, method, url, access_token)
        .header(header::ACCEPT, "application/json");
    if let Some(payload) = body {
        builder = builder
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload);
    }
    let response = builder.send().await.map_err(|error| ApiError {
        status: 0,
        code: String::from("request_failed"),
        request_id: String::new(),
        detail: error.to_string(),
    })?;
    parse_response::<T>(response).await
}

async fn parse_response<T: DeserializeOwned>(
    response: Response,
) -> Result<ApiResponse<T>, ApiError> {
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| ApiError {
        status,
        code: String::from("response_read_failed"),
        request_id: request_id.clone(),
        detail: error.to_string(),
    })?;
    if (200..300).contains(&status) {
        let payload = serde_json::from_str::<T>(&text).map_err(|error| ApiError {
            status,
            code: String::from("invalid_json"),
            request_id: request_id.clone(),
            detail: error.to_string(),
        })?;
        return Ok(ApiResponse {
            payload,
            request_id,
        });
    }
    let parsed = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({}));
    let code = parsed
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("request_failed")
        .to_string();
    Err(ApiError {
        status,
        code,
        request_id,
        detail: text,
    })
}

async fn parse_health_response(response: Response) -> Result<ServiceHealth, String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let text = response
        .text()
        .await
        .map_err(|error| format!("response_read_failed: {error}"))?;

    if !(200..300).contains(&status) {
        let body = compact_error_detail(&text);
        return if body.is_empty() {
            Err(format!("status={status}"))
        } else {
            Err(format!("status={status},body={body}"))
        };
    }

    parse_health_payload(&text).map_err(|error| {
        let body = compact_error_detail(&text);
        let mut detail = format!("status={status},reason={error}");
        if !content_type.is_empty() {
            detail.push_str(&format!(",content_type={content_type}"));
        }
        if !body.is_empty() {
            detail.push_str(&format!(",body={body}"));
        }
        detail
    })
}

fn parse_health_payload(text: &str) -> Result<ServiceHealth, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(default_health(true));
    }

    if let Ok(payload) = serde_json::from_str::<ServiceHealth>(trimmed) {
        return Ok(payload);
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(payload) = coerce_health_value(&value) {
            return Ok(payload);
        }
    }

    if let Some(ok) = parse_status_text(trimmed) {
        return Ok(default_health(ok));
    }

    Err(String::from("unsupported_health_payload"))
}

fn coerce_health_value(value: &Value) -> Option<ServiceHealth> {
    match value {
        Value::Bool(ok) => Some(default_health(*ok)),
        Value::String(text) => parse_status_text(text).map(default_health),
        Value::Object(map) => {
            let ok = map
                .get("ok")
                .and_then(Value::as_bool)
                .or_else(|| map.get("healthy").and_then(Value::as_bool))
                .or_else(|| map.get("status").and_then(parse_status_value))
                .or_else(|| map.get("message").and_then(parse_status_value))?;
            Some(ServiceHealth {
                ok,
                service: map
                    .get("service")
                    .and_then(value_to_string)
                    .or_else(|| map.get("name").and_then(value_to_string)),
                queue_depth: map
                    .get("queueDepth")
                    .and_then(value_to_u32)
                    .or_else(|| map.get("queue_depth").and_then(value_to_u32)),
                failed_jobs: map
                    .get("failedJobs")
                    .and_then(value_to_u32)
                    .or_else(|| map.get("failed_jobs").and_then(value_to_u32)),
                timestamp: map.get("timestamp").and_then(value_to_string),
            })
        }
        _ => None,
    }
}

fn default_health(ok: bool) -> ServiceHealth {
    ServiceHealth {
        ok,
        service: None,
        queue_depth: None,
        failed_jobs: None,
        timestamp: None,
    }
}

fn parse_status_value(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(flag) => Some(*flag),
        Value::String(text) => parse_status_text(text),
        _ => None,
    }
}

fn parse_status_text(text: &str) -> Option<bool> {
    match text.trim().to_ascii_lowercase().as_str() {
        "ok" | "healthy" | "up" | "ready" | "true" => Some(true),
        "error" | "failed" | "down" | "unhealthy" | "false" => Some(false),
        _ => None,
    }
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn value_to_u32(value: &Value) -> Option<u32> {
    match value {
        Value::Number(number) => number
            .as_u64()
            .and_then(|parsed| u32::try_from(parsed).ok()),
        Value::String(text) => text.trim().parse::<u32>().ok(),
        _ => None,
    }
}

fn compact_error_detail(text: &str) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = compact.chars();
    let truncated = chars.by_ref().take(160).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

pub fn into_session_user(
    payload: &crate::models::api::ApiSessionUser,
) -> crate::models::local_state::SessionUser {
    crate::models::local_state::SessionUser {
        user_id: payload.user_id.clone(),
        discord_id: payload.discord_id.clone(),
        display_name: payload.display_name.clone(),
        role: payload.role.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_health_payload;

    #[test]
    fn parse_health_payload_accepts_stringified_counts() {
        let payload = parse_health_payload(
            r#"{"ok":true,"service":"api","queueDepth":"7","failedJobs":"2"}"#,
        )
        .expect("health payload should parse");

        assert!(payload.ok);
        assert_eq!(payload.queue_depth, Some(7));
        assert_eq!(payload.failed_jobs, Some(2));
    }

    #[test]
    fn parse_health_payload_accepts_plaintext_ok() {
        let payload = parse_health_payload("ok").expect("plain text health should parse");

        assert!(payload.ok);
        assert_eq!(payload.queue_depth, None);
        assert_eq!(payload.failed_jobs, None);
    }

    #[test]
    fn parse_health_payload_treats_empty_body_as_success() {
        let payload = parse_health_payload("   ").expect("empty body should parse");

        assert!(payload.ok);
        assert_eq!(payload.service, None);
    }
}
