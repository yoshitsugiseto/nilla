use reqwest::Client;
use sqlx::SqlitePool;

use crate::automation::get_project_automation_settings;

/// Send a message to a Slack Incoming Webhook URL.
/// Logs a warning on failure but never propagates the error so that
/// application logic is not blocked by Slack delivery issues.
pub async fn send_slack_message(
    client: &Client,
    webhook_url: &str,
    text: &str,
) -> Result<(), anyhow::Error> {
    let payload = serde_json::json!({ "text": text });
    let resp = client.post(webhook_url).json(&payload).send().await?;
    if !resp.status().is_success() {
        tracing::warn!(
            "Slack webhook returned {}: {}",
            resp.status(),
            webhook_url
        );
    }
    Ok(())
}

/// If the workspace that owns `project_id` has a Slack webhook URL configured,
/// fire a message. Errors are silently logged -- Slack delivery must never
/// block the main request.
pub async fn notify_slack_for_project(
    pool: &SqlitePool,
    http_client: &Client,
    project_id: &str,
    text: &str,
) {
    let settings = match get_project_automation_settings(pool, project_id).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to fetch automation settings for Slack notification: {e}");
            return;
        }
    };

    if let Some(ref webhook_url) = settings.slack_webhook_url {
        if let Err(e) = send_slack_message(http_client, webhook_url, text).await {
            tracing::warn!("Slack notification failed: {e}");
        }
    }
}
