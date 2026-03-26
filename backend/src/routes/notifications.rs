use axum::{
    extract::{Path, State},
    Extension, Json,
};
use sqlx::SqlitePool;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    models::notification::Notification,
};

pub async fn list_notifications(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
) -> Result<Json<Vec<Notification>>> {
    let notifications = sqlx::query_as::<_, Notification>(
        "SELECT id, user_id, issue_id, type, message, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&user_id.0)
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
