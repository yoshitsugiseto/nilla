pub mod bulk_operations;
pub mod comments;
pub mod helpers;
pub mod issue_links;

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Extension, Json,
};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    automation::get_project_automation_settings,
    db::{check_project_access, check_project_permission, ProjectPermission},
    error::{AppError, Result},
    models::issue::{
        CreateIssue, Issue, IssueFilters, IssuePriority, IssueRow, IssueType,
        UpdateIssue, UpdateIssueSprint, UpdateIssueStatus,
    },
    realtime::RealtimeHub,
};

use helpers::{
    broadcast_issue_event_scoped, broadcast_project_event_scoped, build_issue_select_sql,
    build_issue_where, ensure_epic_is_epic, ensure_parent_is_story,
    ensure_sprint_belongs_to_project, get_project_id_for_issue, get_user_name,
    issue_is_overdue, notify_assignee_change, notify_overdue, notify_review_ready,
};

// Re-export all public handler functions for route registration
pub use bulk_operations::bulk_update_issues;
pub use comments::{create_comment, list_activity, list_comments};
pub use issue_links::{create_link, delete_link, list_links};

// ─── Issues CRUD ─────────────────────────────────────────────────────────────

pub async fn list_issues(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Query(filters): Query<IssueFilters>,
) -> Result<(HeaderMap, Json<Vec<Issue>>)> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let (where_clause, args) = build_issue_where(&project_id, &filters);

    // Total count query
    let count_sql = format!(
        "SELECT COUNT(*) FROM issues i LEFT JOIN users u ON i.assignee_id = u.id {where_clause}"
    );
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    for arg in &args {
        count_q = count_q.bind(arg);
    }
    let total: i64 = count_q.fetch_one(&pool).await?;

    // Data query (with limit / offset)
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

    // M2: Validate assignee is a workspace member
    if let Some(ref assignee_id) = body.assignee_id {
        validate_assignee_membership(&pool, &project_id, assignee_id).await?;
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

    // M2: Validate assignee is a workspace member
    if let Some(Some(ref assignee_id)) = body.assignee_id {
        validate_assignee_membership(&pool, &project_id, assignee_id).await?;
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
            &project_id,
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
            &project_id,
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
            &project_id,
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
            &project_id,
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
            &project_id,
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

// ─── M2: Validate assignee membership ─────────────────────────────────────

async fn validate_assignee_membership(
    pool: &SqlitePool,
    project_id: &str,
    assignee_id: &str,
) -> Result<()> {
    let workspace_id: Option<String> =
        sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(pool)
            .await?;
    let workspace_id = workspace_id.ok_or(AppError::NotFound)?;

    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)",
    )
    .bind(&workspace_id)
    .bind(assignee_id)
    .fetch_one(pool)
    .await?;

    if !is_member {
        return Err(AppError::BadRequest(
            "Assignee must be a member of the workspace".to_string(),
        ));
    }

    Ok(())
}
