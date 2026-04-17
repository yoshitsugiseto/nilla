use axum::{
    extract::{Path, State},
    Extension, Json,
};
use chrono::Utc;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    automation::get_project_automation_settings,
    db::{check_project_permission, ProjectPermission},
    error::{AppError, Result},
    models::issue::{
        BulkUpdateIssues, BulkUpdateResult, BulkUpdateSkippedItem, Issue, IssueRow,
    },
    realtime::RealtimeHub,
};

use super::helpers::{
    broadcast_project_event_scoped, build_issue_select_sql, ensure_sprint_belongs_to_project,
    issue_is_overdue, notify_assignee_change, notify_overdue, notify_review_ready,
};

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
    let mut skipped = Vec::new();
    let today = Utc::now().date_naive();

    for issue_id in &issue_ids {
        let Some(current) = current_by_id.get(issue_id) else {
            skipped_ids.push(issue_id.clone());
            skipped.push(BulkUpdateSkippedItem {
                issue_id: issue_id.clone(),
                reason: "見つからないか対象外".to_string(),
            });
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
            skipped.push(BulkUpdateSkippedItem {
                issue_id: issue_id.clone(),
                reason: "更新できませんでした".to_string(),
            });
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

    let actor_name = super::helpers::get_user_name(&pool, &user_id.0).await;
    for item in &items {
        let Some(current) = current_by_id.get(&item.id) else {
            continue;
        };

        if body.assignee_id.is_some() && item.assignee_id != current.assignee_id {
            notify_assignee_change(
                &pool,
                &realtime,
                &project_id,
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
                &project_id,
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
                &project_id,
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
        skipped,
    }))
}
