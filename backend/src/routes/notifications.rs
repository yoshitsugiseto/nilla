use axum::{
    extract::{Path, Query, State},
    Extension, Json,
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    models::notification::Notification,
};

const DEFAULT_NOTIFICATION_LIMIT: i64 = 50;
const MAX_NOTIFICATION_LIMIT: i64 = 100;

#[derive(Deserialize)]
pub struct NotificationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_notifications(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Query(query): Query<NotificationQuery>,
) -> Result<Json<Vec<Notification>>> {
    let limit = query
        .limit
        .unwrap_or(DEFAULT_NOTIFICATION_LIMIT)
        .clamp(1, MAX_NOTIFICATION_LIMIT);
    let offset = query.offset.unwrap_or(0).max(0);

    let notifications = sqlx::query_as::<_, Notification>(
        "SELECT id, user_id, issue_id, type, message, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(&user_id.0)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await?;

    Ok(Json(notifications))
}

pub async fn mark_read(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let rows = sqlx::query("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user_id.0)
        .execute(&pool)
        .await?;

    if rows.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn mark_all_read(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query("UPDATE notifications SET read = 1 WHERE user_id = ?")
        .bind(&user_id.0)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_notification(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM notifications WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user_id.0)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
