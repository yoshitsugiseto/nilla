use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Extension, Json,
};
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    automation::get_project_automation_settings,
    db::{check_project_access, check_project_permission, ProjectPermission},
    error::{AppError, Result},
    models::issue::{
        BulkUpdateIssues, BulkUpdateResult, CreateIssue, CreateIssueLink, Issue, IssueFilters,
        IssueLink, IssuePriority, IssueRow, IssueType, UpdateIssue, UpdateIssueSprint,
        UpdateIssueStatus,
    },
    realtime::RealtimeHub,
};

const UNASSIGNED_FILTER: &str = "__unassigned__";

const ISSUE_COLUMNS: &str =
    "i.id, i.project_id, i.sprint_id, i.parent_id, i.epic_id, e.title as epic_title, i.number, i.title, i.description, i.type, i.status, i.priority, i.points, i.assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar_url, i.labels, i.position, i.due_date, i.created_at, i.updated_at";
const ISSUE_FROM: &str =
    "FROM issues i LEFT JOIN users u ON i.assignee_id = u.id LEFT JOIN issues e ON i.epic_id = e.id";
const INVALID_LINK_TYPE_ERROR: &str =
    "link_type must be one of: blocks, is_blocked_by, relates_to, duplicates";

fn build_issue_select_sql(where_clause: &str, order_by_clause: &str) -> String {
    let where_clause = where_clause.trim();
    let order_by_clause = order_by_clause.trim();

    if where_clause.is_empty() && order_by_clause.is_empty() {
        return format!("SELECT {ISSUE_COLUMNS} {ISSUE_FROM}");
    }
    if where_clause.is_empty() {
        return format!("SELECT {ISSUE_COLUMNS} {ISSUE_FROM} {order_by_clause}");
    }
    if order_by_clause.is_empty() {
        return format!("SELECT {ISSUE_COLUMNS} {ISSUE_FROM} {where_clause}");
    }

    format!("SELECT {ISSUE_COLUMNS} {ISSUE_FROM} {where_clause} {order_by_clause}")
}

/// Look up the workspace_id for a given project_id.
async fn get_workspace_id_for_project(pool: &SqlitePool, project_id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Broadcast a WS event scoped to a workspace, so clients can filter by workspace.
async fn broadcast_project_event_scoped(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    project_id: &str,
    payload: serde_json::Value,
) {
    let Some(workspace_id) = get_workspace_id_for_project(pool, project_id).await else {
        return;
    };
    realtime
        .publish_workspace(
            &workspace_id,
            serde_json::json!({
                "project_id": project_id,
                "workspace_id": workspace_id,
            })
            .as_object()
            .map(|base| {
                let mut merged = base.clone();
                if let Some(payload_object) = payload.as_object() {
                    merged.extend(payload_object.clone());
                }
                serde_json::Value::Object(merged).to_string()
            })
            .unwrap_or_else(|| {
                serde_json::json!({
                    "project_id": project_id,
                    "workspace_id": workspace_id,
                })
                .to_string()
            }),
        )
        .await;
}

async fn broadcast_issue_event_scoped(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    event_type: &str,
    issue: &Issue,
) {
    broadcast_project_event_scoped(
        pool,
        realtime,
        &issue.project_id,
        serde_json::json!({
            "type": event_type,
            "issue_id": issue.id,
            "issue": issue,
        }),
    )
    .await;
}

async fn create_notification(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
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
    realtime
        .publish_user(
            user_id,
            serde_json::json!({ "type": "notification.new", "user_id": user_id }).to_string(),
        )
        .await;
}

async fn get_project_id_for_issue(pool: &SqlitePool, issue_id: &str) -> Result<String> {
    sqlx::query_scalar::<_, String>("SELECT project_id FROM issues WHERE id = ?")
        .bind(issue_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)
}

async fn get_user_name(pool: &SqlitePool, user_id: &str) -> String {
    sqlx::query_scalar("SELECT name FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
        .unwrap_or_else(|| "Unknown".to_string())
}

fn issue_is_overdue(due_date: Option<NaiveDate>, status: &str, today: NaiveDate) -> bool {
    status != "done" && due_date.map(|value| value < today).unwrap_or(false)
}

async fn notify_assignee_change(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    actor_user_id: &str,
    actor_name: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        return;
    }

    let Some(assignee_id) = assignee_id else {
        return;
    };
    if assignee_id == actor_user_id {
        return;
    }

    let msg = format!("{} が「{}」にアサインしました", actor_name, issue_title);
    create_notification(pool, realtime, assignee_id, issue_id, "assigned", &msg).await;
}

async fn notify_review_ready(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    actor_user_id: &str,
    actor_name: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        return;
    }

    let Some(assignee_id) = assignee_id else {
        return;
    };
    if assignee_id == actor_user_id {
        return;
    }

    let msg = format!(
        "{} が「{}」をレビュー待ちにしました",
        actor_name, issue_title
    );
    create_notification(pool, realtime, assignee_id, issue_id, "review_ready", &msg).await;
}

async fn notify_overdue(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    actor_user_id: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        return;
    }

    let Some(assignee_id) = assignee_id else {
        return;
    };
    if assignee_id == actor_user_id {
        return;
    }

    let msg = format!("「{}」が期限超過になりました", issue_title);
    create_notification(pool, realtime, assignee_id, issue_id, "overdue", &msg).await;
}

async fn ensure_sprint_belongs_to_project(
    pool: &SqlitePool,
    project_id: &str,
    sprint_id: &str,
) -> Result<()> {
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sprints WHERE id = ? AND project_id = ?)")
            .bind(sprint_id)
            .bind(project_id)
            .fetch_one(pool)
            .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "Sprint must belong to the same project".to_string(),
        ))
    }
}

async fn ensure_parent_is_story(
    pool: &SqlitePool,
    project_id: &str,
    issue_id: Option<&str>,
    parent_id: &str,
) -> Result<()> {
    if issue_id == Some(parent_id) {
        return Err(AppError::BadRequest(
            "Issue cannot be its own parent".to_string(),
        ));
    }

    let parent_type: Option<String> =
        sqlx::query_scalar("SELECT type FROM issues WHERE id = ? AND project_id = ?")
            .bind(parent_id)
            .bind(project_id)
            .fetch_optional(pool)
            .await?;

    match parent_type.as_deref() {
        Some("story") => Ok(()),
        Some(_) => Err(AppError::BadRequest(
            "Parent issue must be a story".to_string(),
        )),
        None => Err(AppError::BadRequest("Parent issue not found".to_string())),
    }
}

async fn ensure_epic_is_epic(
    pool: &SqlitePool,
    project_id: &str,
    issue_id: Option<&str>,
    epic_id: &str,
) -> Result<()> {
    if issue_id == Some(epic_id) {
        return Err(AppError::BadRequest(
            "Issue cannot be its own epic".to_string(),
        ));
    }

    let epic_type: Option<String> =
        sqlx::query_scalar("SELECT type FROM issues WHERE id = ? AND project_id = ?")
            .bind(epic_id)
            .bind(project_id)
            .fetch_optional(pool)
            .await?;

    match epic_type.as_deref() {
        Some("epic") => Ok(()),
        Some(_) => Err(AppError::BadRequest(
            "Epic issue must be of type epic".to_string(),
        )),
        None => Err(AppError::BadRequest("Epic issue not found".to_string())),
    }
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
        if assignee_id == UNASSIGNED_FILTER {
            clause.push_str(" AND i.assignee_id IS NULL");
        } else {
            clause.push_str(" AND i.assignee_id = ?");
            args.push(assignee_id.clone());
        }
    }
    if let Some(q) = &filters.q {
        clause.push_str(
            " AND (i.title LIKE ? OR i.description LIKE ? OR CAST(i.number AS TEXT) LIKE ?)",
        );
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
    let count_sql = format!(
        "SELECT COUNT(*) FROM issues i LEFT JOIN users u ON i.assignee_id = u.id {where_clause}"
    );
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    for arg in &args {
        count_q = count_q.bind(arg);
    }
    let total: i64 = count_q.fetch_one(&pool).await?;

    // データクエリ（limit / offset 適用）
    let limit = filters.limit.unwrap_or(500).clamp(1, 1000);
    let offset = filters.offset.unwrap_or(0).max(0);
    let data_sql = build_issue_select_sql(
        &where_clause,
        &format!("ORDER BY i.position ASC, i.created_at DESC LIMIT {limit} OFFSET {offset}"),
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
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateIssue>,
) -> Result<Json<Issue>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title is required".to_string()));
    }
    if body.title.len() > 500 {
        return Err(AppError::BadRequest(
            "title must be 500 characters or fewer".to_string(),
        ));
    }
    if body
        .description
        .as_deref()
        .map_or(false, |d| d.len() > 10000)
    {
        return Err(AppError::BadRequest(
            "description must be 10000 characters or fewer".to_string(),
        ));
    }

    if body.points.map_or(false, |p| p < 0 || p > 999) {
        return Err(AppError::BadRequest(
            "points must be between 0 and 999".to_string(),
        ));
    }

    let id = Uuid::new_v4().to_string();
    let issue_type = body.r#type.unwrap_or(IssueType::Task);
    let priority = body.priority.unwrap_or(IssuePriority::Medium);
    let labels = body.labels.unwrap_or_default();
    if labels.len() > 20 {
        return Err(AppError::BadRequest(
            "labels must be 20 or fewer".to_string(),
        ));
    }
    let labels_json = serde_json::to_string(&labels).map_err(|e| AppError::Internal(e.into()))?;

    if let Some(ref sprint_id) = body.sprint_id {
        ensure_sprint_belongs_to_project(&pool, &project_id, sprint_id).await?;
    }

    if let Some(ref parent_id) = body.parent_id {
        ensure_parent_is_story(&pool, &project_id, None, parent_id).await?;
    }

    if let Some(ref epic_id) = body.epic_id {
        ensure_epic_is_epic(&pool, &project_id, None, epic_id).await?;
    }

    let mut tx = pool.begin().await?;

    let number: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE project_id = ?")
            .bind(&project_id)
            .fetch_one(&mut *tx)
            .await?;

    sqlx::query(
        "INSERT INTO issues (id, project_id, sprint_id, parent_id, epic_id, number, title, description, type, priority, points, assignee_id, labels, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&body.sprint_id)
    .bind(&body.parent_id)
    .bind(&body.epic_id)
    .bind(number)
    .bind(&body.title)
    .bind(&body.description)
    .bind(issue_type.as_str())
    .bind(priority.as_str())
    .bind(body.points)
    .bind(body.assignee_id.as_deref())
    .bind(&labels_json)
    .bind(body.due_date)
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    let issue = Issue::from(row);
    broadcast_issue_event_scoped(&pool, &realtime, "issue.created", &issue).await;
    Ok(Json(issue))
}

pub async fn get_issue(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let row = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(Issue::from(row)))
}

pub async fn update_issue(
    State(pool): State<SqlitePool>,
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssue>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;
    let automation_settings = get_project_automation_settings(&pool, &project_id).await?;

    if let Some(ref title) = body.title {
        if title.trim().is_empty() {
            return Err(AppError::BadRequest("title must not be empty".to_string()));
        }
        if title.len() > 500 {
            return Err(AppError::BadRequest(
                "title must be 500 characters or fewer".to_string(),
            ));
        }
    }
    if body
        .description
        .as_deref()
        .map_or(false, |d| d.len() > 10000)
    {
        return Err(AppError::BadRequest(
            "description must be 10000 characters or fewer".to_string(),
        ));
    }
    // status, type, and priority are validated by serde deserialization (enum types)
    if let Some(ref labels) = body.labels {
        if labels.len() > 20 {
            return Err(AppError::BadRequest(
                "labels must be 20 or fewer".to_string(),
            ));
        }
    }
    if let Some(points) = body.points {
        if points < 0 || points > 999 {
            return Err(AppError::BadRequest(
                "points must be between 0 and 999".to_string(),
            ));
        }
    }
    if let Some(Some(ref sprint_id)) = body.sprint_id {
        ensure_sprint_belongs_to_project(&pool, &project_id, sprint_id).await?;
    }
    if let Some(Some(ref parent_id)) = body.parent_id {
        ensure_parent_is_story(&pool, &project_id, Some(&id), parent_id).await?;
    }
    if let Some(Some(ref epic_id)) = body.epic_id {
        ensure_epic_is_epic(&pool, &project_id, Some(&id), epic_id).await?;
    }

    let current = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let status_changed = body.status.is_some();
    let title = body.title.unwrap_or(current.title.clone());
    let description = body.description.or(current.description.clone());
    let issue_type = body
        .r#type
        .map(|t| t.to_string())
        .unwrap_or(current.r#type.clone());
    let new_status = body
        .status
        .map(|s| s.to_string())
        .unwrap_or(current.status.clone());
    let priority = body
        .priority
        .map(|p| p.to_string())
        .unwrap_or(current.priority.clone());
    let points = body.points.or(current.points);
    let new_assignee_id_from_body = body.assignee_id.clone();
    let assignee_id = match body.assignee_id.clone() {
        Some(value) => value,
        None => current.assignee_id.clone(),
    };
    let labels_json = match body.labels {
        Some(l) => serde_json::to_string(&l).map_err(|e| AppError::Internal(e.into()))?,
        None => current.labels.clone().unwrap_or_else(|| "[]".to_string()),
    };
    let sprint_id = if let Some(value) = body.sprint_id.clone() {
        value
    } else {
        current.sprint_id.clone()
    };
    let parent_id = if let Some(value) = body.parent_id.clone() {
        value
    } else {
        current.parent_id.clone()
    };
    let epic_id = if let Some(value) = body.epic_id.clone() {
        value
    } else {
        current.epic_id.clone()
    };
    let due_date = if let Some(value) = body.due_date {
        value
    } else {
        current.due_date
    };
    let today = Utc::now().date_naive();
    let became_overdue = !issue_is_overdue(current.due_date, &current.status, today)
        && issue_is_overdue(due_date, &new_status, today);

    let mut tx = pool.begin().await?;

    sqlx::query(
        "UPDATE issues SET title=?, description=?, type=?, status=?, priority=?, points=?, assignee_id=?, labels=?, sprint_id=?, parent_id=?, epic_id=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
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
    .bind(&epic_id)
    .bind(due_date)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    if status_changed && new_status != current.status {
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

    let row = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    let issue = Issue::from(row);
    broadcast_issue_event_scoped(&pool, &realtime, "issue.updated", &issue).await;

    let assignee_changed = new_assignee_id_from_body.is_some()
        && new_assignee_id_from_body
            .as_ref()
            .and_then(|value| value.as_deref())
            != current.assignee_id.as_deref();
    let status_moved_to_review = new_status == "in_review" && current.status != "in_review";
    let actor_name = get_user_name(&pool, &user_id.0).await;

    if assignee_changed {
        notify_assignee_change(
            &pool,
            &realtime,
            &user_id.0,
            &actor_name,
            automation_settings.notify_on_assignee_change,
            &id,
            &title,
            assignee_id.as_deref(),
        )
        .await;
    }
    if status_moved_to_review {
        notify_review_ready(
            &pool,
            &realtime,
            &user_id.0,
            &actor_name,
            automation_settings.notify_on_review_ready,
            &id,
            &title,
            assignee_id.as_deref(),
        )
        .await;
    }
    if became_overdue {
        notify_overdue(
            &pool,
            &realtime,
            &user_id.0,
            automation_settings.notify_on_overdue_transition,
            &id,
            &title,
            assignee_id.as_deref(),
        )
        .await;
    }

    Ok(Json(issue))
}

pub async fn delete_issue(
    State(pool): State<SqlitePool>,
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

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
    broadcast_project_event_scoped(
        &pool,
        &realtime,
        &project_id,
        serde_json::json!({
            "type": "issue.deleted",
            "issue_id": id,
        }),
    )
    .await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn update_issue_status(
    State(pool): State<SqlitePool>,
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssueStatus>,
) -> Result<Json<Issue>> {
    // Validation is handled by serde deserialization of IssueStatus enum
    let status_str = body.status.as_str();

    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;
    let automation_settings = get_project_automation_settings(&pool, &project_id).await?;

    let current = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let old_status = current.status.clone();
    let today = Utc::now().date_naive();
    let became_overdue = !issue_is_overdue(current.due_date, &old_status, today)
        && issue_is_overdue(current.due_date, status_str, today);

    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE issues SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(status_str)
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
    .bind(status_str)
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    let issue = Issue::from(row);
    broadcast_issue_event_scoped(&pool, &realtime, "issue.updated", &issue).await;
    let actor_name = get_user_name(&pool, &user_id.0).await;

    if status_str == "in_review" && old_status != "in_review" {
        notify_review_ready(
            &pool,
            &realtime,
            &user_id.0,
            &actor_name,
            automation_settings.notify_on_review_ready,
            &id,
            &issue.title,
            issue.assignee_id.as_deref(),
        )
        .await;
    }
    if became_overdue {
        notify_overdue(
            &pool,
            &realtime,
            &user_id.0,
            automation_settings.notify_on_overdue_transition,
            &id,
            &issue.title,
            issue.assignee_id.as_deref(),
        )
        .await;
    }

    Ok(Json(issue))
}

pub async fn update_issue_sprint(
    State(pool): State<SqlitePool>,
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateIssueSprint>,
) -> Result<Json<Issue>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;
    if let Some(ref sprint_id) = body.sprint_id {
        ensure_sprint_belongs_to_project(&pool, &project_id, sprint_id).await?;
    }

    let result =
        sqlx::query("UPDATE issues SET sprint_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(&body.sprint_id)
            .bind(&id)
            .execute(&pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let row = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql("WHERE i.id = ?", ""))
        .bind(&id)
        .fetch_one(&pool)
        .await?;
    let issue = Issue::from(row);
    broadcast_issue_event_scoped(&pool, &realtime, "issue.updated", &issue).await;
    Ok(Json(issue))
}

pub async fn list_children(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Issue>>> {
    let project_id = get_project_id_for_issue(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let rows = sqlx::query_as::<_, IssueRow>(&build_issue_select_sql(
        "WHERE i.parent_id = ?",
        "ORDER BY i.position ASC, i.created_at ASC",
    ))
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
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<ReorderBody>,
) -> Result<Json<serde_json::Value>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    if body.ids.is_empty() {
        return Err(AppError::BadRequest("ids cannot be empty".to_string()));
    }
    if body.ids.len() > 500 {
        return Err(AppError::BadRequest(
            "Cannot reorder more than 500 issues at once".to_string(),
        ));
    }

    // Verify all issue_ids belong to this project
    let placeholders = body.ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let ownership_sql =
        format!("SELECT COUNT(*) FROM issues WHERE id IN ({placeholders}) AND project_id = ?");
    let mut ownership_query = sqlx::query_scalar::<_, i64>(&ownership_sql);
    for id in &body.ids {
        ownership_query = ownership_query.bind(id);
    }
    ownership_query = ownership_query.bind(&project_id);
    let count: i64 = ownership_query.fetch_one(&pool).await?;
    if count != body.ids.len() as i64 {
        return Err(AppError::BadRequest(
            "Some issue IDs do not belong to this project".to_string(),
        ));
    }

    let mut tx = pool.begin().await?;
    for (i, id) in body.ids.iter().enumerate() {
        sqlx::query("UPDATE issues SET position=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind((i as i64) * POSITION_GAP)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    broadcast_project_event_scoped(
        &pool,
        &realtime,
        &project_id,
        serde_json::json!({ "type": "issue.reordered" }),
    )
    .await;
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

    // `author` column is NOT NULL for backward compat — populate from users table
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
            let msg = format!("「{}」に {} がコメントしました", title, author_name);
            create_notification(&pool, &realtime, &assignee_uid, &id, "comment", &msg).await;
        }
        title.clone()
    } else {
        issue_row
            .as_ref()
            .map(|(_, t)| t.clone())
            .unwrap_or_default()
    };

    // @メンション通知
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
                    "「{}」で {} があなたをメンションしました",
                    issue_title, author_name
                );
                create_notification(&pool, &realtime, &mentioned_uid, &id, "mention", &msg).await;
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
        _ => Err(AppError::BadRequest(INVALID_LINK_TYPE_ERROR.to_string())),
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
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

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
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

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
    State(realtime): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<BulkUpdateIssues>,
) -> Result<Json<BulkUpdateResult>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;
    let automation_settings = get_project_automation_settings(&pool, &project_id).await?;

    let mut seen = HashSet::new();
    let issue_ids = body
        .issue_ids
        .iter()
        .filter(|issue_id| seen.insert((*issue_id).clone()))
        .cloned()
        .collect::<Vec<_>>();

    if issue_ids.is_empty() {
        return Err(AppError::BadRequest(
            "issue_ids cannot be empty".to_string(),
        ));
    }
    if issue_ids.len() > 100 {
        return Err(AppError::BadRequest(
            "Cannot update more than 100 issues at once".to_string(),
        ));
    }
    if body.status.is_none()
        && body.sprint_id.is_none()
        && body.assignee_id.is_none()
        && body.priority.is_none()
        && body.labels.is_none()
        && body.due_date.is_none()
    {
        return Err(AppError::BadRequest(
            "At least one field must be provided".to_string(),
        ));
    }
    if body
        .labels
        .as_ref()
        .map_or(false, |labels| labels.len() > 20)
    {
        return Err(AppError::BadRequest(
            "labels must be 20 or fewer".to_string(),
        ));
    }
    if let Some(ref sprint_id) = body.sprint_id {
        if sprint_id != "backlog" {
            ensure_sprint_belongs_to_project(&pool, &project_id, sprint_id).await?;
        }
    }

    let placeholders = issue_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let existing_sql = build_issue_select_sql(
        &format!("WHERE i.id IN ({placeholders}) AND i.project_id = ?"),
        "",
    );
    let mut existing_query = sqlx::query_as::<_, IssueRow>(&existing_sql);
    for issue_id in &issue_ids {
        existing_query = existing_query.bind(issue_id);
    }
    existing_query = existing_query.bind(&project_id);
    let current_rows = existing_query.fetch_all(&pool).await?;
    let current_by_id = current_rows
        .into_iter()
        .map(|row| (row.id.clone(), row))
        .collect::<HashMap<_, _>>();

    let mut tx = pool.begin().await?;
    let mut updated_ids = Vec::new();
    let mut skipped_ids = Vec::new();
    let today = Utc::now().date_naive();

    for issue_id in &issue_ids {
        let Some(current) = current_by_id.get(issue_id) else {
            skipped_ids.push(issue_id.clone());
            continue;
        };

        let next_status = body
            .status
            .map(|status| status.as_str().to_string())
            .unwrap_or_else(|| current.status.clone());
        let next_sprint_id = match body.sprint_id.as_deref() {
            Some("backlog") => None,
            Some(value) => Some(value.to_string()),
            None => current.sprint_id.clone(),
        };
        let next_assignee_id = match body.assignee_id.as_deref() {
            Some("") => None,
            Some(value) => Some(value.to_string()),
            None => current.assignee_id.clone(),
        };
        let next_priority = body
            .priority
            .map(|priority| priority.as_str().to_string())
            .unwrap_or_else(|| current.priority.clone());
        let next_labels_json = match body.labels.as_ref() {
            Some(labels) => {
                serde_json::to_string(labels).map_err(|e| AppError::Internal(e.into()))?
            }
            None => current.labels.clone().unwrap_or_else(|| "[]".to_string()),
        };
        let next_due_date = match body.due_date {
            Some(value) => value,
            None => current.due_date,
        };

        let update_result = sqlx::query(
            "UPDATE issues SET status=?, sprint_id=?, assignee_id=?, priority=?, labels=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?",
        )
        .bind(&next_status)
        .bind(&next_sprint_id)
        .bind(&next_assignee_id)
        .bind(&next_priority)
        .bind(&next_labels_json)
        .bind(next_due_date)
        .bind(issue_id)
        .bind(&project_id)
        .execute(&mut *tx)
        .await?;

        if update_result.rows_affected() == 0 {
            skipped_ids.push(issue_id.clone());
            continue;
        }

        updated_ids.push(issue_id.clone());

        if body.status.is_some() && next_status != current.status {
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'status', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(&current.status)
            .bind(&next_status)
            .execute(&mut *tx)
            .await?;
        }
        if body.sprint_id.is_some() && next_sprint_id != current.sprint_id {
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'sprint_id', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(&current.sprint_id)
            .bind(&next_sprint_id)
            .execute(&mut *tx)
            .await?;
        }
        if body.assignee_id.is_some() && next_assignee_id != current.assignee_id {
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'assignee_id', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(&current.assignee_id)
            .bind(&next_assignee_id)
            .execute(&mut *tx)
            .await?;
        }
        if body.priority.is_some() && next_priority != current.priority {
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'priority', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(&current.priority)
            .bind(&next_priority)
            .execute(&mut *tx)
            .await?;
        }
        if body.labels.is_some()
            && current.labels.clone().unwrap_or_else(|| "[]".to_string()) != next_labels_json
        {
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'labels', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(current.labels.clone().unwrap_or_else(|| "[]".to_string()))
            .bind(&next_labels_json)
            .execute(&mut *tx)
            .await?;
        }
        if body.due_date.is_some() && next_due_date != current.due_date {
            let old_due_date = current.due_date.map(|value| value.to_string());
            let new_due_date = next_due_date.map(|value| value.to_string());
            sqlx::query(
                "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, 'due_date', ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(issue_id)
            .bind(old_due_date)
            .bind(new_due_date)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    broadcast_project_event_scoped(
        &pool,
        &realtime,
        &project_id,
        serde_json::json!({ "type": "issue.updated" }),
    )
    .await;

    let items = if updated_ids.is_empty() {
        Vec::new()
    } else {
        let placeholders = updated_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = build_issue_select_sql(
            &format!("WHERE i.id IN ({placeholders})"),
            "ORDER BY i.position ASC",
        );
        let mut q = sqlx::query_as::<_, IssueRow>(&sql);
        for id in &updated_ids {
            q = q.bind(id);
        }
        q.fetch_all(&pool)
            .await?
            .into_iter()
            .map(Issue::from)
            .collect()
    };

    let actor_name = get_user_name(&pool, &user_id.0).await;
    for item in &items {
        let Some(current) = current_by_id.get(&item.id) else {
            continue;
        };

        if body.assignee_id.is_some() && item.assignee_id != current.assignee_id {
            notify_assignee_change(
                &pool,
                &realtime,
                &user_id.0,
                &actor_name,
                automation_settings.notify_on_assignee_change,
                &item.id,
                &item.title,
                item.assignee_id.as_deref(),
            )
            .await;
        }

        if body.status.is_some()
            && item.status.as_str() == "in_review"
            && current.status != "in_review"
        {
            notify_review_ready(
                &pool,
                &realtime,
                &user_id.0,
                &actor_name,
                automation_settings.notify_on_review_ready,
                &item.id,
                &item.title,
                item.assignee_id.as_deref(),
            )
            .await;
        }

        let became_overdue = !issue_is_overdue(current.due_date, &current.status, today)
            && issue_is_overdue(item.due_date, item.status.as_str(), today);
        if became_overdue {
            notify_overdue(
                &pool,
                &realtime,
                &user_id.0,
                automation_settings.notify_on_overdue_transition,
                &item.id,
                &item.title,
                item.assignee_id.as_deref(),
            )
            .await;
        }
    }

    Ok(Json(BulkUpdateResult {
        items,
        updated_count: updated_ids.len(),
        skipped_ids,
    }))
}
