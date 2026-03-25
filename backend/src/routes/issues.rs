use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Extension,
    Json,
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    models::issue::{
        BulkUpdateIssues, CreateIssue, CreateIssueLink, Issue, IssueFilters, IssueLink, IssueRow,
        UpdateIssue, UpdateIssueSprint, UpdateIssueStatus,
    },
};

const ISSUE_SELECT: &str =
    "SELECT i.id, i.project_id, i.sprint_id, i.parent_id, i.number, i.title, i.description, i.type, i.status, i.priority, i.points, i.assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar_url, i.labels, i.position, i.due_date, i.created_at, i.updated_at FROM issues i LEFT JOIN users u ON i.assignee_id = u.id";
const GET_ISSUE_SQL: &str =
    "SELECT i.id, i.project_id, i.sprint_id, i.parent_id, i.number, i.title, i.description, i.type, i.status, i.priority, i.points, i.assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar_url, i.labels, i.position, i.due_date, i.created_at, i.updated_at FROM issues i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.id = ?";

fn validate_status(status: &str) -> crate::error::Result<()> {
    match status {
        "todo" | "in_progress" | "in_review" | "done" => Ok(()),
        _ => Err(AppError::BadRequest(format!("Invalid status: {status}"))),
    }
}

fn validate_issue_type(t: &str) -> crate::error::Result<()> {
    match t {
        "story" | "task" | "bug" | "spike" => Ok(()),
        _ => Err(AppError::BadRequest(format!("Invalid issue type: {t}"))),
    }
}

fn validate_priority(p: &str) -> crate::error::Result<()> {
    match p {
        "critical" | "high" | "medium" | "low" => Ok(()),
        _ => Err(AppError::BadRequest(format!("Invalid priority: {p}"))),
    }
}

async fn check_project_access(pool: &SqlitePool, user_id: &str, project_id: &str) -> Result<()> {
    let has_access: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM projects p JOIN workspace_members wm ON p.workspace_id = wm.workspace_id WHERE p.id = ? AND wm.user_id = ?)"
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_access {
        // Also allow access if workspace_id is NULL (legacy data)
        let is_legacy: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ? AND workspace_id IS NULL)"
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        if !is_legacy {
            return Err(AppError::Forbidden);
        }
    }

    Ok(())
}

fn broadcast_event(ws_tx: &broadcast::Sender<String>, event_type: &str, project_id: &str) {
    let _ = ws_tx.send(
        serde_json::json!({ "type": event_type, "project_id": project_id }).to_string(),
    );
}

async fn create_notification(
    pool: &SqlitePool,
    ws_tx: &broadcast::Sender<String>,
    user_id: &str,
    issue_id: &str,
    notif_type: &str,
    message: &str,
) {
    let notif_id = Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, issue_id, type, message) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&notif_id)
    .bind(user_id)
    .bind(issue_id)
    .bind(notif_type)
    .bind(message)
    .execute(pool)
    .await;
    let _ = ws_tx.send(
        serde_json::json!({ "type": "notification.new", "user_id": user_id }).to_string(),
    );
}

async fn get_project_id_for_issue(pool: &SqlitePool, issue_id: &str) -> Result<String> {
    sqlx::query_scalar::<_, String>("SELECT project_id FROM issues WHERE id = ?")
        .bind(issue_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)
}

/// WHERE句と引数リストを構築する共通ヘルパー
fn build_issue_where(project_id: &str, filters: &IssueFilters) -> (String, Vec<String>) {
    let mut clause = "WHERE i.project_id = ?".to_string();
    let mut args: Vec<String> = vec![project_id.to_string()];

    match filters.sprint_id.as_deref() {
        Some("backlog") => clause.push_str(" AND i.sprint_id IS NULL"),
        Some(sid) => {
            clause.push_str(" AND i.sprint_id = ?");
            args.push(sid.to_string());
        }
        None => {}
    }
    if let Some(status) = &filters.status {
        clause.push_str(" AND i.status = ?");
        args.push(status.clone());
    }
    if let Some(t) = &filters.r#type {
        clause.push_str(" AND i.type = ?");
        args.push(t.clone());
    }
    if let Some(priority) = &filters.priority {
        clause.push_str(" AND i.priority = ?");
        args.push(priority.clone());
    }
    if let Some(assignee_id) = &filters.assignee_id {
        clause.push_str(" AND i.assignee_id = ?");
        args.push(assignee_id.clone());
    }
    if let Some(q) = &filters.q {
        clause.push_str(" AND (i.title LIKE ? OR i.description LIKE ? OR CAST(i.number AS TEXT) LIKE ?)");
        let pattern = format!("%{}%", q);
        args.push(pattern.clone());
        args.push(pattern.clone());
        args.push(pattern);
    }

    (clause, args)
}

pub async fn list_issues(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Query(filters): Query<IssueFilters>,
) -> Result<(HeaderMap, Json<Vec<Issue>>)> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let (where_clause, args) = build_issue_where(&project_id, &filters);

    // 総件数クエリ
    let count_sql = format!("SELECT COUNT(*) FROM issues i LEFT JOIN users u ON i.assignee_id = u.id {where_clause}");
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    for arg in &args {
        count_q = count_q.bind(arg);
    }
    let total: i64 = count_q.fetch_one(&pool).await?;

    // データクエリ（limit / offset 適用）
    let limit = filters.limit.unwrap_or(500).clamp(1, 1000);
    let offset = filters.offset.unwrap_or(0).max(0);
    let data_sql = format!(
        "{ISSUE_SELECT} {where_clause} ORDER BY i.position ASC, i.created_at DESC LIMIT {limit} OFFSET {offset}"
    );
    let mut data_q = sqlx::query_as::<_, IssueRow>(&data_sql);
    for arg in &args {
        data_q = data_q.bind(arg);
    }
    let rows = data_q.fetch_all(&pool).await?;

    let mut headers = HeaderMap::new();
    headers.insert(
        "X-Total-Count",
        axum::http::HeaderValue::from_str(&total.to_string())
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?,
    );

    Ok((headers, Json(rows.into_iter().map(Issue::from).collect())))
}

pub async fn create_issue(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateIssue>,
) -> Result<Json<Issue>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title is required".to_string()));
    }
    if body.title.len() > 500 {
        return Err(AppError::BadRequest("title must be 500 characters or fewer".to_string()));
    }
    if body.description.as_deref().map_or(false, |d| d.len() > 10000) {
        return Err(AppError::BadRequest("description must be 10000 characters or fewer".to_string()));
    }

    if body.points.map_or(false, |p| p < 0 || p > 999) {
        return Err(AppError::BadRequest("points must be between 0 and 999".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let issue_type = body.r#type.unwrap_or_else(|| "task".to_string());
    validate_issue_type(&issue_type)?;
    let priority = body.priority.unwrap_or_else(|| "medium".to_string());
    validate_priority(&priority)?;
    let labels = body.labels.unwrap_or_default();
    if labels.len() > 20 {
        return Err(AppError::BadRequest("labels must be 20 or fewer".to_string()));
    }
    let labels_json = serde_json::to_string(&labels)
        .map_err(|e| AppError::Internal(e.into()))?;

    let mut tx = pool.begin().await?;

    // Validate parent issue exists and is a story
    if let Some(ref parent_id) = body.parent_id {
        let parent_type: Option<String> =
            sqlx::query_scalar("SELECT type FROM issues WHERE id = ? AND project_id = ?")
                .bind(parent_id)
                .bind(&project_id)
                .fetch_optional(&mut *tx)
                .await?;
        match parent_type.as_deref() {
            Some("story") => {}
            Some(_) => {
                return Err(AppError::BadRequest(
                    "Parent issue must be a story".to_string(),
                ))
            }
            None => {
                return Err(AppError::BadRequest(
                    "Parent issue not found".to_string(),
                ))
            }
        }
    }

    let number: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE project_id = ?",
    )
    .bind(&project_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO issues (id, project_id, sprint_id, parent_id, number, title, description, type, priority, points, assignee_id, labels, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&body.sprint_id)
    .bind(&body.parent_id)
    .bind(number)
    .bind(&body.title)
    .bind(&body.description)
    .bind(&issue_type)
    .bind(&priority)
    .bind(body.points)
    .bind(body.assignee_id.as_deref())
    .bind(&labels_json)
    .bind(body.due_date)
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    broadcast_event(&ws_tx, "issue.created", &project_id);
    Ok(Json(Issue::from(row)))
}

pub async fn get_issue(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let row = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(Issue::from(row)))
}

pub async fn update_issue(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssue>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if let Some(ref title) = body.title {
        if title.trim().is_empty() {
            return Err(AppError::BadRequest("title must not be empty".to_string()));
        }
        if title.len() > 500 {
            return Err(AppError::BadRequest("title must be 500 characters or fewer".to_string()));
        }
    }
    if body.description.as_deref().map_or(false, |d| d.len() > 10000) {
        return Err(AppError::BadRequest("description must be 10000 characters or fewer".to_string()));
    }
    if let Some(ref s) = body.status {
        validate_status(s)?;
    }
    if let Some(ref t) = body.r#type {
        validate_issue_type(t)?;
    }
    if let Some(ref p) = body.priority {
        validate_priority(p)?;
    }
    if let Some(ref labels) = body.labels {
        if labels.len() > 20 {
            return Err(AppError::BadRequest("labels must be 20 or fewer".to_string()));
        }
    }
    if let Some(points) = body.points {
        if points < 0 || points > 999 {
            return Err(AppError::BadRequest("points must be between 0 and 999".to_string()));
        }
    }

    let current = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let title = body.title.unwrap_or(current.title.clone());
    let description = body.description.or(current.description.clone());
    let issue_type = body.r#type.unwrap_or(current.r#type.clone());
    let new_status = body.status.clone().unwrap_or(current.status.clone());
    let priority = body.priority.unwrap_or(current.priority.clone());
    let points = body.points.or(current.points);
    let new_assignee_id_from_body = body.assignee_id.clone();
    let assignee_id = body.assignee_id.or(current.assignee_id.clone());
    let labels_json = match body.labels {
        Some(l) => serde_json::to_string(&l).map_err(|e| AppError::Internal(e.into()))?,
        None => current.labels.clone().unwrap_or_else(|| "[]".to_string()),
    };
    let sprint_id = if body.sprint_id.is_some() {
        body.sprint_id.clone()
    } else {
        current.sprint_id.clone()
    };
    let parent_id = if body.parent_id.is_some() {
        body.parent_id.clone()
    } else {
        current.parent_id.clone()
    };
    let due_date = if body.due_date.is_some() {
        body.due_date
    } else {
        current.due_date
    };

    let mut tx = pool.begin().await?;

    sqlx::query(
        "UPDATE issues SET title=?, description=?, type=?, status=?, priority=?, points=?, assignee_id=?, labels=?, sprint_id=?, parent_id=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
    .bind(&title)
    .bind(&description)
    .bind(&issue_type)
    .bind(&new_status)
    .bind(&priority)
    .bind(points)
    .bind(&assignee_id)
    .bind(&labels_json)
    .bind(&sprint_id)
    .bind(&parent_id)
    .bind(due_date)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    if body.status.is_some() && body.status.as_deref() != Some(&current.status) {
        let log_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'status', ?, ?)",
        )
        .bind(&log_id)
        .bind(&id)
        .bind(&current.status)
        .bind(&new_status)
        .execute(&mut *tx)
        .await?;
    }

    let row = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    broadcast_event(&ws_tx, "issue.updated", &project_id);

    // Notify new assignee (if changed and not self-assign)
    let assignee_changed = new_assignee_id_from_body.is_some()
        && new_assignee_id_from_body.as_deref() != current.assignee_id.as_deref();
    if assignee_changed {
        if let Some(ref new_assignee) = assignee_id {
            if new_assignee != &user_id.0 {
                let assigner_name: String = sqlx::query_scalar("SELECT name FROM users WHERE id = ?")
                    .bind(&user_id.0)
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None)
                    .unwrap_or_else(|| "Unknown".to_string());
                let msg = format!("{} が「{}」にアサインしました", assigner_name, title);
                create_notification(&pool, &ws_tx, new_assignee, &id, "assigned", &msg).await;
            }
        }
    }

    Ok(Json(Issue::from(row)))
}

pub async fn delete_issue(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let mut tx = pool.begin().await?;

    // Delete subtasks first to avoid orphaned children
    sqlx::query("DELETE FROM issues WHERE parent_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    let result = sqlx::query("DELETE FROM issues WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        tx.rollback().await?;
        return Err(AppError::NotFound);
    }

    tx.commit().await?;
    broadcast_event(&ws_tx, "issue.deleted", &project_id);
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn update_issue_status(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssueStatus>,
) -> Result<Json<Issue>> {
    validate_status(&body.status)?;

    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let current = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let old_status = current.status.clone();

    let mut tx = pool.begin().await?;

    sqlx::query(
        "UPDATE issues SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
    .bind(&body.status)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    let log_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'status', ?, ?)",
    )
    .bind(&log_id)
    .bind(&id)
    .bind(&old_status)
    .bind(&body.status)
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    broadcast_event(&ws_tx, "issue.updated", &project_id);
    Ok(Json(Issue::from(row)))
}

pub async fn update_issue_sprint(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssueSprint>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let result =
        sqlx::query("UPDATE issues SET sprint_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(&body.sprint_id)
            .bind(&id)
            .execute(&pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let row = sqlx::query_as::<_, IssueRow>(GET_ISSUE_SQL)
        .bind(&id)
        .fetch_one(&pool)
        .await?;

    Ok(Json(Issue::from(row)))
}

pub async fn list_children(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Issue>>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let rows = sqlx::query_as::<_, IssueRow>(
        "SELECT i.id, i.project_id, i.sprint_id, i.parent_id, i.number, i.title, i.description, i.type, i.status, i.priority, i.points, i.assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar_url, i.labels, i.position, i.created_at, i.updated_at FROM issues i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.parent_id = ? ORDER BY i.position ASC, i.created_at ASC"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.into_iter().map(Issue::from).collect()))
}

#[derive(serde::Deserialize)]
pub struct ReorderBody {
    pub ids: Vec<String>,
}

/// Position gap between issues; large enough to allow future insertion without reordering
const POSITION_GAP: i64 = 1000;

pub async fn reorder_issues(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<ReorderBody>,
) -> Result<Json<serde_json::Value>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let mut tx = pool.begin().await?;
    for (i, id) in body.ids.iter().enumerate() {
        sqlx::query("UPDATE issues SET position=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind((i as i64) * POSITION_GAP)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    broadcast_event(&ws_tx, "issue.reordered", &project_id);
    Ok(Json(serde_json::json!({ "ok": true })))
}

// Comments

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
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<CreateComment>,
) -> Result<Json<Comment>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if body.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".to_string()));
    }
    if body.body.len() > 10000 {
        return Err(AppError::BadRequest("body must be 10000 characters or fewer".to_string()));
    }

    let comment_id = Uuid::new_v4().to_string();

    // `author` column is NOT NULL for backward compat — populate from users table
    let author_name: String = sqlx::query_scalar("SELECT name FROM users WHERE id = ?")
        .bind(&user_id.0)
        .fetch_optional(&pool)
        .await?
        .unwrap_or_else(|| "Unknown".to_string());

    sqlx::query("INSERT INTO comments (id, issue_id, user_id, author, body) VALUES (?, ?, ?, ?, ?)")
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

    let _ = ws_tx.send(
        serde_json::json!({ "type": "comment.created", "issue_id": id, "project_id": project_id }).to_string(),
    );

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
            let msg = format!("「{}」に {} がコメントしました", title, author_name);
            create_notification(&pool, &ws_tx, &assignee_uid, &id, "comment", &msg).await;
        }
        title.clone()
    } else {
        issue_row.as_ref().map(|(_, t)| t.clone()).unwrap_or_default()
    };

    // @メンション通知
    let mentioned_names: Vec<&str> = body.body
        .split_whitespace()
        .filter(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| w.trim_start_matches('@').trim_end_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-'))
        .collect();
    for name in mentioned_names {
        if let Ok(Some(mentioned_uid)) =
            sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE name = ?")
                .bind(name)
                .fetch_optional(&pool)
                .await
        {
            if mentioned_uid != user_id.0 {
                let msg = format!("「{}」で {} があなたをメンションしました", issue_title, author_name);
                create_notification(&pool, &ws_tx, &mentioned_uid, &id, "mention", &msg).await;
            }
        }
    }

    Ok(Json(comment))
}

// Activity logs

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivityLog {
    pub id: String,
    pub issue_id: String,
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: NaiveDateTime,
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

// Issue Links

pub async fn list_links(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<IssueLink>>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let links = sqlx::query_as::<_, IssueLink>(
        r#"SELECT il.id, il.source_issue_id, il.target_issue_id, il.link_type,
                  i.id as linked_issue_id, i.number as linked_issue_number,
                  i.title as linked_issue_title, i.status as linked_issue_status,
                  i.type as linked_issue_type, il.created_at as created_at
           FROM issue_links il JOIN issues i ON i.id = il.target_issue_id
           WHERE il.source_issue_id = ?
           UNION ALL
           SELECT il.id, il.source_issue_id, il.target_issue_id, il.link_type,
                  i.id as linked_issue_id, i.number as linked_issue_number,
                  i.title as linked_issue_title, i.status as linked_issue_status,
                  i.type as linked_issue_type, il.created_at as created_at
           FROM issue_links il JOIN issues i ON i.id = il.source_issue_id
           WHERE il.target_issue_id = ?
           ORDER BY created_at ASC"#,
    )
    .bind(&id)
    .bind(&id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(links))
}

fn validate_link_type(t: &str) -> Result<()> {
    match t {
        "blocks" | "is_blocked_by" | "relates_to" | "duplicates" => Ok(()),
        _ => Err(AppError::BadRequest(format!("Invalid link_type: {t}"))),
    }
}

pub async fn create_link(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<CreateIssueLink>,
) -> Result<Json<IssueLink>> {
    validate_link_type(&body.link_type)?;

    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    // Target issue must exist and belong to the same project
    let target_project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM issues WHERE id = ?")
            .bind(&body.target_issue_id)
            .fetch_optional(&pool)
            .await?;
    let target_project_id = target_project_id.ok_or(AppError::NotFound)?;
    if target_project_id != project_id {
        return Err(AppError::BadRequest(
            "Cannot link issues from different projects".to_string(),
        ));
    }
    if id == body.target_issue_id {
        return Err(AppError::BadRequest(
            "Cannot link an issue to itself".to_string(),
        ));
    }

    let link_id = Uuid::new_v4().to_string();
    let link = sqlx::query_as::<_, IssueLink>(
        r#"INSERT INTO issue_links (id, source_issue_id, target_issue_id, link_type)
           VALUES (?, ?, ?, ?)
           RETURNING id, source_issue_id, target_issue_id, link_type,
                     (SELECT id FROM issues WHERE id = target_issue_id) as linked_issue_id,
                     (SELECT number FROM issues WHERE id = target_issue_id) as linked_issue_number,
                     (SELECT title FROM issues WHERE id = target_issue_id) as linked_issue_title,
                     (SELECT status FROM issues WHERE id = target_issue_id) as linked_issue_status,
                     (SELECT type FROM issues WHERE id = target_issue_id) as linked_issue_type,
                     created_at"#,
    )
    .bind(&link_id)
    .bind(&id)
    .bind(&body.target_issue_id)
    .bind(&body.link_type)
    .fetch_one(&pool)
    .await?;

    Ok(Json(link))
}

pub async fn delete_link(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(link_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    // Get the source issue to check project access
    let source_issue_id: Option<String> =
        sqlx::query_scalar("SELECT source_issue_id FROM issue_links WHERE id = ?")
            .bind(&link_id)
            .fetch_optional(&pool)
            .await?;
    let source_issue_id = source_issue_id.ok_or(AppError::NotFound)?;

    let project_id = get_project_id_for_issue(&pool, &source_issue_id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let result = sqlx::query("DELETE FROM issue_links WHERE id = ?")
        .bind(&link_id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// Bulk update

pub async fn bulk_update_issues(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<BulkUpdateIssues>,
) -> Result<Json<Vec<Issue>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if body.issue_ids.is_empty() {
        return Ok(Json(vec![]));
    }

    let mut tx = pool.begin().await?;

    for issue_id in &body.issue_ids {
        if let Some(ref status) = body.status {
            validate_status(status)?;
            sqlx::query("UPDATE issues SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?")
                .bind(status)
                .bind(issue_id)
                .bind(&project_id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(ref sprint_id) = body.sprint_id {
            let sid: Option<&str> = if sprint_id == "backlog" { None } else { Some(sprint_id) };
            sqlx::query("UPDATE issues SET sprint_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?")
                .bind(sid)
                .bind(issue_id)
                .bind(&project_id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(ref assignee_id) = body.assignee_id {
            let aid: Option<&str> = if assignee_id.is_empty() { None } else { Some(assignee_id) };
            sqlx::query("UPDATE issues SET assignee_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?")
                .bind(aid)
                .bind(issue_id)
                .bind(&project_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    tx.commit().await?;

    broadcast_event(&ws_tx, "issue.updated", &project_id);

    let placeholders = body.issue_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!("{ISSUE_SELECT} WHERE i.id IN ({placeholders}) ORDER BY i.position ASC");
    let mut q = sqlx::query_as::<_, IssueRow>(&sql);
    for id in &body.issue_ids {
        q = q.bind(id);
    }
    let rows = q.fetch_all(&pool).await?;
    Ok(Json(rows.into_iter().map(Issue::from).collect()))
}
