use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{IntoResponse, Json},
};
use chrono::Utc;
use serde::Deserialize;
use tokio::time::{interval, Duration};

use crate::{auth::middleware::UserId, error::AppError, AppState};

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
    sqlx::query_scalar(
        "DELETE FROM ws_tickets WHERE ticket = ? AND expires_at > ? RETURNING user_id",
    )
    .bind(ticket)
    .bind(&now)
    .fetch_optional(pool)
    .await
}

async fn consume_ws_ticket(
    pool: &sqlx::SqlitePool,
    ticket: Option<&str>,
) -> Result<Option<String>, sqlx::Error> {
    let Some(ticket) = ticket.filter(|ticket| !ticket.is_empty()) else {
        return Ok(None);
    };

    validate_ws_ticket(pool, ticket).await
}

async fn validate_workspace_subscription(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    workspace_id: Option<&str>,
) -> Result<Option<String>, AppError> {
    let Some(workspace_id) = workspace_id.filter(|workspace_id| !workspace_id.is_empty()) else {
        return Ok(None);
    };

    let has_access: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if has_access {
        Ok(Some(workspace_id.to_string()))
    } else {
        Err(AppError::Forbidden)
    }
}

// ─── WebSocket handler ──────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WsParams {
    ticket: Option<String>,
    workspace_id: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let user_id = match consume_ws_ticket(&state.pool, params.ticket.as_deref()).await {
        Ok(Some(user_id)) => user_id,
        _ => return axum::http::StatusCode::UNAUTHORIZED.into_response(),
    };

    let workspace_id = match validate_workspace_subscription(
        &state.pool,
        &user_id,
        params.workspace_id.as_deref(),
    )
    .await
    {
        Ok(workspace_id) => workspace_id,
        Err(error) => return error.into_response(),
    };

    ws.on_upgrade(move |socket| handle_socket(socket, state.realtime, user_id, workspace_id))
        .into_response()
}

async fn handle_socket(
    mut socket: WebSocket,
    realtime: crate::realtime::RealtimeHub,
    user_id: String,
    workspace_id: Option<String>,
) {
    let cleanup_workspace_id = workspace_id.clone();
    let mut user_rx = realtime.subscribe_user(&user_id).await;
    let mut workspace_rx = match workspace_id {
        Some(workspace_id) => Some(realtime.subscribe_workspace(&workspace_id).await),
        None => None,
    };
    let mut ping_interval = interval(Duration::from_secs(30));
    ping_interval.tick().await; // 最初の即時 tick をスキップ

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            result = user_rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            result = async {
                match workspace_rx.as_mut() {
                    Some(rx) => Some(rx.recv().await),
                    None => std::future::pending::<Option<Result<String, tokio::sync::broadcast::error::RecvError>>>().await,
                }
            } => {
                match result {
                    Some(Ok(msg)) => {
                        if socket.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(tokio::sync::broadcast::error::RecvError::Lagged(_))) => continue,
                    Some(Err(_)) => break,
                    None => continue,
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

    drop(workspace_rx);
    drop(user_rx);
    realtime.cleanup_user_if_idle(&user_id).await;
    if let Some(workspace_id) = cleanup_workspace_id {
        realtime.cleanup_workspace_if_idle(&workspace_id).await;
    }
}

#[cfg(test)]
mod tests {
    use super::{consume_ws_ticket, generate_random_hex, validate_workspace_subscription};
    use crate::error::AppError;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    const TEST_USER_ID: &str = "test-user-001";
    const TEST_USER_B_ID: &str = "test-user-002";

    async fn setup_pool() -> sqlx::SqlitePool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();

        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(TEST_USER_ID)
        .bind("test")
        .bind("test-provider-001")
        .bind("test@example.com")
        .bind("Test User")
        .bind("2026-01-01T00:00:00")
        .bind("2026-01-01T00:00:00")
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(TEST_USER_B_ID)
        .bind("test")
        .bind("test-provider-002")
        .bind("testb@example.com")
        .bind("Test User B")
        .bind("2026-01-01T00:00:00")
        .bind("2026-01-01T00:00:00")
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    async fn insert_ticket(
        pool: &sqlx::SqlitePool,
        ticket: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) {
        sqlx::query("INSERT INTO ws_tickets (ticket, user_id, expires_at) VALUES (?, ?, ?)")
            .bind(ticket)
            .bind(TEST_USER_ID)
            .bind(expires_at.to_rfc3339())
            .execute(pool)
            .await
            .unwrap();
    }

    async fn create_workspace_with_member(pool: &sqlx::SqlitePool, user_id: &str) -> String {
        let workspace_id = generate_random_hex(16);

        sqlx::query(
            "INSERT INTO workspaces (id, name, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&workspace_id)
        .bind("Workspace")
        .bind(TEST_USER_ID)
        .bind("2026-01-01T00:00:00")
        .bind("2026-01-01T00:00:00")
        .execute(pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
             VALUES (?, ?, 'member', ?)",
        )
        .bind(&workspace_id)
        .bind(user_id)
        .bind("2026-01-01T00:00:00")
        .execute(pool)
        .await
        .unwrap();

        workspace_id
    }

    #[tokio::test]
    async fn test_consume_ws_ticket_with_valid_ticket_returns_user_id() {
        let pool = setup_pool().await;
        let ticket = generate_random_hex(32);
        insert_ticket(
            &pool,
            &ticket,
            chrono::Utc::now() + chrono::Duration::seconds(10),
        )
        .await;

        let user_id = consume_ws_ticket(&pool, Some(&ticket)).await.unwrap();

        assert_eq!(user_id.as_deref(), Some(TEST_USER_ID));
    }

    #[tokio::test]
    async fn test_consume_ws_ticket_without_ticket_returns_none() {
        let pool = setup_pool().await;

        let user_id = consume_ws_ticket(&pool, None).await.unwrap();

        assert_eq!(user_id, None);
    }

    #[tokio::test]
    async fn test_consume_ws_ticket_with_expired_ticket_returns_none() {
        let pool = setup_pool().await;
        let ticket = generate_random_hex(32);
        insert_ticket(
            &pool,
            &ticket,
            chrono::Utc::now() - chrono::Duration::seconds(1),
        )
        .await;

        let user_id = consume_ws_ticket(&pool, Some(&ticket)).await.unwrap();

        assert_eq!(user_id, None);
    }

    #[tokio::test]
    async fn test_consume_ws_ticket_with_reused_ticket_returns_none() {
        let pool = setup_pool().await;
        let ticket = generate_random_hex(32);
        insert_ticket(
            &pool,
            &ticket,
            chrono::Utc::now() + chrono::Duration::seconds(10),
        )
        .await;

        let first_use = consume_ws_ticket(&pool, Some(&ticket)).await.unwrap();
        let second_use = consume_ws_ticket(&pool, Some(&ticket)).await.unwrap();

        assert_eq!(first_use.as_deref(), Some(TEST_USER_ID));
        assert_eq!(second_use, None);
    }

    #[tokio::test]
    async fn test_validate_workspace_subscription_with_member_returns_workspace_id() {
        let pool = setup_pool().await;
        let workspace_id = create_workspace_with_member(&pool, TEST_USER_ID).await;

        let resolved = validate_workspace_subscription(&pool, TEST_USER_ID, Some(&workspace_id))
            .await
            .unwrap();

        assert_eq!(resolved.as_deref(), Some(workspace_id.as_str()));
    }

    #[tokio::test]
    async fn test_validate_workspace_subscription_without_scope_returns_none() {
        let pool = setup_pool().await;

        let resolved = validate_workspace_subscription(&pool, TEST_USER_ID, None)
            .await
            .unwrap();

        assert_eq!(resolved, None);
    }

    #[tokio::test]
    async fn test_validate_workspace_subscription_for_non_member_returns_forbidden() {
        let pool = setup_pool().await;
        let workspace_id = create_workspace_with_member(&pool, TEST_USER_B_ID).await;

        let error = validate_workspace_subscription(&pool, TEST_USER_ID, Some(&workspace_id))
            .await
            .unwrap_err();

        assert!(matches!(error, AppError::Forbidden));
    }
}
