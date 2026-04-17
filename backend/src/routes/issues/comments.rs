use axum::{
    extract::{Path, State},
    Extension, Json,
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashSet;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    db::{check_project_access, check_project_permission, ProjectPermission},
    error::{AppError, Result},
    realtime::RealtimeHub,
};

use super::helpers::{create_notification, get_project_id_for_issue, get_workspace_id_for_project};

// ─── Types ─────────────────────────────────────────────��─────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Comment {
    pub id: String,
    pub issue_id: String,
    pub user_id: Option<String>,
    pub author_name: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateComment {
    pub body: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivityLog {
    pub id: String,
    pub issue_id: String,
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: NaiveDateTime,
}

// ─── Handlers ─────────────────────────────────────────────────��──────────────

pub async fn list_comments(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Comment>>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let comments = sqlx::query_as::<_, Comment>(
        "SELECT c.id, c.issue_id, c.user_id, COALESCE(u.name, c.author, 'Unknown') as author_name, u.avatar_url as author_avatar_url, c.body, c.created_at, c.updated_at FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.issue_id = ? ORDER BY c.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(comments))
}

pub async fn create_comment(
    State(pool): State<SqlitePool>,
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<CreateComment>,
) -> Result<Json<Comment>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    if body.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".to_string()));
    }
    if body.body.len() > 10000 {
        return Err(AppError::BadRequest(
            "body must be 10000 characters or fewer".to_string(),
        ));
    }

    let comment_id = Uuid::new_v4().to_string();

    // `author` column is NOT NULL for backward compat -- populate from users table
    let author_name: String = sqlx::query_scalar("SELECT name FROM users WHERE id = ?")
        .bind(&user_id.0)
        .fetch_optional(&pool)
        .await?
        .unwrap_or_else(|| "Unknown".to_string());

    sqlx::query(
        "INSERT INTO comments (id, issue_id, user_id, author, body) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&comment_id)
    .bind(&id)
    .bind(&user_id.0)
    .bind(&author_name)
    .bind(&body.body)
    .execute(&pool)
    .await?;

    let comment = sqlx::query_as::<_, Comment>(
        "SELECT c.id, c.issue_id, c.user_id, COALESCE(u.name, 'Unknown') as author_name, u.avatar_url as author_avatar_url, c.body, c.created_at, c.updated_at FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?",
    )
    .bind(&comment_id)
    .fetch_one(&pool)
    .await?;

    if let Some(workspace_id) = get_workspace_id_for_project(&pool, &project_id).await {
        realtime
            .publish_workspace(
                &workspace_id,
                serde_json::json!({
                    "type": "comment.created",
                    "issue_id": id,
                    "project_id": project_id,
                    "workspace_id": workspace_id,
                })
                .to_string(),
            )
            .await;
    }

    // Notify issue assignee (if not the commenter)
    let issue_row: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT assignee_id, title FROM issues WHERE id = ?")
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
    let issue_title = if let Some((Some(assignee_uid), ref title)) = issue_row {
        if assignee_uid != user_id.0 {
            let msg = format!("「{}」�� {} がコメントしました", title, author_name);
            create_notification(&pool, &realtime, &assignee_uid, &id, "comment", &msg).await;
        }
        title.clone()
    } else {
        issue_row
            .as_ref()
            .map(|(_, t)| t.clone())
            .unwrap_or_default()
    };

    // @mention notifications
    let mentioned_names: HashSet<&str> = body
        .body
        .split_whitespace()
        .filter(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| {
            w.trim_start_matches('@')
                .trim_end_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        })
        .collect();
    for name in mentioned_names {
        let mentioned_user_ids = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT wm.user_id
             FROM workspace_members wm
             JOIN projects p ON p.workspace_id = wm.workspace_id
             JOIN users u ON u.id = wm.user_id
             WHERE p.id = ? AND u.name = ?",
        )
        .bind(&project_id)
        .bind(name)
        .fetch_all(&pool)
        .await?;

        for mentioned_uid in mentioned_user_ids {
            if mentioned_uid != user_id.0 {
                let msg = format!(
                    "「{}」で {} があなたをメンショ���しました",
                    issue_title, author_name
                );
                create_notification(&pool, &realtime, &mentioned_uid, &id, "mention", &msg).await;
            }
        }
    }

    Ok(Json(comment))
}

pub async fn list_activity(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ActivityLog>>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let logs = sqlx::query_as::<_, ActivityLog>(
        "SELECT id, issue_id, field, old_value, new_value, created_at FROM activity_logs WHERE issue_id = ? ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(logs))
}
