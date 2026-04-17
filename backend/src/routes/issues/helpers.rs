use chrono::NaiveDate;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    automation::record_automation_execution,
    error::{AppError, Result},
    realtime::RealtimeHub,
};

pub const UNASSIGNED_FILTER: &str = "__unassigned__";

// Automation log messages for notification events
const MSG_ASSIGNEE_CHANGE_DISABLED: &str = "担当変更通知はワークスペース設定で無効です";
const MSG_ASSIGNEE_CHANGE_NO_ASSIGNEE: &str = "担当者がいないため担当変更通知を送信しませんでした";
const MSG_ASSIGNEE_CHANGE_SELF: &str = "担当者本人への担当変更通知はスキップしました";
const MSG_REVIEW_READY_DISABLED: &str = "レビュー待ち通知はワークスペース設定で無効です";
const MSG_REVIEW_READY_NO_ASSIGNEE: &str = "担当者がいないためレビュー待ち通知を送信しませんでした";
const MSG_REVIEW_READY_SELF: &str = "担当者本人へのレビュー待ち通知はスキップしました";
const MSG_OVERDUE_DISABLED: &str = "期限超過通知はワークスペース設定で無効です";
const MSG_OVERDUE_NO_ASSIGNEE: &str = "担当者がいないため期限超過通知を送信しませんでした";
const MSG_OVERDUE_SELF: &str = "担当者本人への期限超過通知はスキップしました";

pub const ISSUE_COLUMNS: &str =
    "i.id, i.project_id, i.sprint_id, i.parent_id, i.epic_id, e.title as epic_title, i.number, i.title, i.description, i.type, i.status, i.priority, i.points, i.assignee_id, u.name as assignee_name, u.avatar_url as assignee_avatar_url, i.labels, i.position, i.due_date, i.created_at, i.updated_at";
pub const ISSUE_FROM: &str =
    "FROM issues i LEFT JOIN users u ON i.assignee_id = u.id LEFT JOIN issues e ON i.epic_id = e.id";

pub fn build_issue_select_sql(where_clause: &str, order_by_clause: &str) -> String {
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
pub async fn get_workspace_id_for_project(pool: &SqlitePool, project_id: &str) -> Option<String> {
    crate::db::get_workspace_id_for_project(pool, project_id).await
}

/// Broadcast a WS event scoped to a workspace, so clients can filter by workspace.
pub async fn broadcast_project_event_scoped(
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

pub async fn broadcast_issue_event_scoped(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    event_type: &str,
    issue: &crate::models::issue::Issue,
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

pub async fn create_notification(
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

pub async fn get_project_id_for_issue(pool: &SqlitePool, issue_id: &str) -> Result<String> {
    sqlx::query_scalar::<_, String>("SELECT project_id FROM issues WHERE id = ?")
        .bind(issue_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn get_user_name(pool: &SqlitePool, user_id: &str) -> String {
    match sqlx::query_scalar("SELECT name FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(name)) => name,
        Ok(None) => {
            tracing::warn!("User not found for id={user_id}, returning fallback name");
            "Unknown".to_string()
        }
        Err(e) => {
            tracing::warn!("Failed to fetch user name for id={user_id}: {e}");
            "Unknown".to_string()
        }
    }
}

pub fn issue_is_overdue(due_date: Option<NaiveDate>, status: &str, today: NaiveDate) -> bool {
    status != "done" && due_date.map(|value| value < today).unwrap_or(false)
}

pub async fn insert_activity_log(
    pool: &SqlitePool,
    issue_id: &str,
    field: &str,
    old_value: Option<&str>,
    new_value: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO activity_logs (id, issue_id, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(issue_id)
    .bind(field)
    .bind(old_value)
    .bind(new_value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn notify_assignee_change(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    project_id: &str,
    actor_user_id: &str,
    actor_name: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "assignee_change",
            "disabled",
            assignee_id,
            MSG_ASSIGNEE_CHANGE_DISABLED,
        )
        .await;
        return;
    }

    let Some(assignee_id) = assignee_id else {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "assignee_change",
            "skipped",
            None,
            MSG_ASSIGNEE_CHANGE_NO_ASSIGNEE,
        )
        .await;
        return;
    };
    if assignee_id == actor_user_id {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "assignee_change",
            "skipped",
            Some(assignee_id),
            MSG_ASSIGNEE_CHANGE_SELF,
        )
        .await;
        return;
    }

    let msg = format!("{} が「{}」にアサインしました", actor_name, issue_title);
    create_notification(pool, realtime, assignee_id, issue_id, "assigned", &msg).await;
    let _ = insert_activity_log(
        pool,
        issue_id,
        "assignee_notification",
        Some(actor_name),
        Some(assignee_id),
    )
    .await;
    let _ = record_automation_execution(
        pool,
        project_id,
        Some(issue_id),
        "assignee_change",
        "sent",
        Some(assignee_id),
        &msg,
    )
    .await;
}

pub async fn notify_review_ready(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    project_id: &str,
    actor_user_id: &str,
    actor_name: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "review_ready",
            "disabled",
            assignee_id,
            MSG_REVIEW_READY_DISABLED,
        )
        .await;
        return;
    }

    let Some(assignee_id) = assignee_id else {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "review_ready",
            "skipped",
            None,
            MSG_REVIEW_READY_NO_ASSIGNEE,
        )
        .await;
        return;
    };
    if assignee_id == actor_user_id {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "review_ready",
            "skipped",
            Some(assignee_id),
            MSG_REVIEW_READY_SELF,
        )
        .await;
        return;
    }

    let msg = format!(
        "{} が「{}」をレビュー待ちにしました",
        actor_name, issue_title
    );
    create_notification(pool, realtime, assignee_id, issue_id, "review_ready", &msg).await;
    let _ = insert_activity_log(
        pool,
        issue_id,
        "review_ready",
        Some(actor_name),
        Some(assignee_id),
    )
    .await;
    let _ = record_automation_execution(
        pool,
        project_id,
        Some(issue_id),
        "review_ready",
        "sent",
        Some(assignee_id),
        &msg,
    )
    .await;
}

pub async fn notify_overdue(
    pool: &SqlitePool,
    realtime: &RealtimeHub,
    project_id: &str,
    actor_user_id: &str,
    enabled: bool,
    issue_id: &str,
    issue_title: &str,
    assignee_id: Option<&str>,
) {
    if !enabled {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "overdue",
            "disabled",
            assignee_id,
            MSG_OVERDUE_DISABLED,
        )
        .await;
        return;
    }

    let Some(assignee_id) = assignee_id else {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "overdue",
            "skipped",
            None,
            MSG_OVERDUE_NO_ASSIGNEE,
        )
        .await;
        return;
    };
    if assignee_id == actor_user_id {
        let _ = record_automation_execution(
            pool,
            project_id,
            Some(issue_id),
            "overdue",
            "skipped",
            Some(assignee_id),
            MSG_OVERDUE_SELF,
        )
        .await;
        return;
    }

    let msg = format!("「{}」が期限超過になりました", issue_title);
    create_notification(pool, realtime, assignee_id, issue_id, "overdue", &msg).await;
    let _ = insert_activity_log(pool, issue_id, "overdue", None, Some(assignee_id)).await;
    let _ = record_automation_execution(
        pool,
        project_id,
        Some(issue_id),
        "overdue",
        "sent",
        Some(assignee_id),
        &msg,
    )
    .await;
}

pub async fn ensure_sprint_belongs_to_project(
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

pub async fn ensure_parent_is_story(
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

pub async fn ensure_epic_is_epic(
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

/// Build WHERE clause and arguments list for issue filtering.
pub fn build_issue_where(project_id: &str, filters: &crate::models::issue::IssueFilters) -> (String, Vec<String>) {
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
    if filters.due_state.as_deref() == Some("overdue") {
        clause.push_str(" AND i.status != 'done' AND i.due_date IS NOT NULL AND i.due_date < date('now')");
    }
    if let Some(q) = &filters.q {
        clause.push_str(
            " AND (i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\' OR CAST(i.number AS TEXT) LIKE ? ESCAPE '\\')",
        );
        let escaped = escape_like_pattern(q);
        let pattern = format!("%{}%", escaped);
        args.push(pattern.clone());
        args.push(pattern.clone());
        args.push(pattern);
    }

    (clause, args)
}

/// Escape LIKE metacharacters (`%`, `_`, `\`) in a search query.
pub fn escape_like_pattern(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' | '%' | '_' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}
