use reqwest::Client;

use crate::models::api::{FormatsResponse, ServiceHealth, TournamentFormat};

pub async fn check_health(base_url: &str) -> Result<ServiceHealth, String> {
  let client = Client::new();
  let url = format!("{}/health", base_url.trim_end_matches('/'));
  let response = client.get(url).send().await.map_err(|error| error.to_string())?;
  response.json::<ServiceHealth>().await.map_err(|error| error.to_string())
}

pub async fn fetch_formats(base_url: &str) -> Result<Vec<TournamentFormat>, String> {
  let client = Client::new();
  let url = format!(
    "{}/api/v1/formats?gameVersion=ootp27",
    base_url.trim_end_matches('/')
  );
  let response = client.get(url).send().await.map_err(|error| error.to_string())?;
  let payload = response
    .json::<FormatsResponse>()
    .await
    .map_err(|error| error.to_string())?;
  Ok(payload.rows)
}
