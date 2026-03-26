use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{IntoResponse, Json},
};
use chrono::Utc;
use serde::Deserialize;
use tokio::sync::broadcast;
use tokio::time::{Duration, interval};

use crate::{AppState, auth::middleware::UserId, error::AppError};

// ─── One-time WebSocket ticket ───────────────────────────────────────────────

fn generate_random_hex(len: usize) -> String {
    use rand::Rng;
    let bytes: Vec<u8> = (0..len).map(|_| rand::thread_rng().gen::<u8>()).collect();
    hex::encode(bytes)
}

/// POST /auth/ws-ticket — issues a short-lived, single-use ticket for WS auth.
/// Requires a valid JWT Bearer token (goes through auth middleware).
pub async fn create_ws_ticket(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<UserId>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ticket = generate_random_hex(32);
    let expires_at = (Utc::now() + chrono::Duration::seconds(10)).to_rfc3339();

    sqlx::query("INSERT INTO ws_tickets (ticket, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(&ticket)
        .bind(&user_id.0)
        .bind(&expires_at)
        .execute(&state.pool)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(serde_json::json!({ "ticket": ticket })))
}

/// Validate and consume a one-time WS ticket. Returns the user_id if valid.
async fn validate_ws_ticket(
    pool: &sqlx::SqlitePool,
    ticket: &str,
) -> Result<Option<String>, sqlx::Error> {
    let now = Utc::now().to_rfc3339();
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT user_id FROM ws_tickets WHERE ticket = ? AND expires_at > ?",
    )
    .bind(ticket)
    .bind(&now)
    .fetch_optional(pool)
    .await?;

    if row.is_some() {
        // Delete the ticket after retrieval (single-use)
        sqlx::query("DELETE FROM ws_tickets WHERE ticket = ?")
            .bind(ticket)
            .execute(pool)
            .await?;
    }

    Ok(row.map(|r| r.0))
}

// ─── WebSocket handler ──────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WsParams {
    ticket: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    match validate_ws_ticket(&state.pool, &params.ticket).await {
        Ok(Some(_user_id)) => ws
            .on_upgrade(move |socket| handle_socket(socket, state.ws_tx.subscribe()))
            .into_response(),
        _ => axum::http::StatusCode::UNAUTHORIZED.into_response(),
    }
}

async fn handle_socket(mut socket: WebSocket, mut rx: broadcast::Receiver<String>) {
    let mut ping_interval = interval(Duration::from_secs(30));
    ping_interval.tick().await; // 最初の即時 tick をスキップ

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            result = rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            result = socket.recv() => {
                match result {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
