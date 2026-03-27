use sqlx::SqlitePool;

use crate::{
    error::{AppError, Result},
    models::workspace::{WorkspaceAutomationLog, WorkspaceAutomationSettings},
};

const AUTOMATION_COLUMNS: &str =
    "workspace_id, notify_on_assignee_change, notify_on_review_ready, notify_on_overdue_transition, sprint_carryover_mode";
const AUTOMATION_LOG_COLUMNS: &str =
    "l.id, l.workspace_id, l.project_id, l.issue_id, i.title as issue_title, l.rule_type, l.status, l.target_user_id, u.name as target_user_name, l.message, l.created_at";

pub async fn record_automation_execution(
    pool: &SqlitePool,
    project_id: &str,
    issue_id: Option<&str>,
    rule_type: &str,
    status: &str,
    target_user_id: Option<&str>,
    message: &str,
) -> Result<()> {
    let workspace_id: String =
        sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(pool)
            .await?
            .ok_or(AppError::NotFound)?;

    sqlx::query(
        "INSERT INTO automation_execution_logs (id, workspace_id, project_id, issue_id, rule_type, status, target_user_id, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(workspace_id)
    .bind(project_id)
    .bind(issue_id)
    .bind(rule_type)
    .bind(status)
    .bind(target_user_id)
    .bind(message)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_workspace_automation_settings(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<WorkspaceAutomationSettings> {
    sqlx::query_as::<_, WorkspaceAutomationSettings>(&format!(
        "SELECT {AUTOMATION_COLUMNS} FROM workspace_automation_settings WHERE workspace_id = ?"
    ))
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn get_project_automation_settings(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<WorkspaceAutomationSettings> {
    sqlx::query_as::<_, WorkspaceAutomationSettings>(
        r#"SELECT was.workspace_id as workspace_id,
                  was.notify_on_assignee_change as notify_on_assignee_change,
                  was.notify_on_review_ready as notify_on_review_ready,
                  was.notify_on_overdue_transition as notify_on_overdue_transition,
                  was.sprint_carryover_mode as sprint_carryover_mode
           FROM workspace_automation_settings was
           JOIN projects p ON p.workspace_id = was.workspace_id
           WHERE p.id = ?"#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn get_next_carryover_sprint_id(
    pool: &SqlitePool,
    project_id: &str,
    current_sprint_id: &str,
) -> Result<Option<String>> {
    sqlx::query_scalar::<_, String>(
        "SELECT id
         FROM sprints
         WHERE project_id = ? AND id != ? AND status != 'completed'
         ORDER BY created_at ASC
         LIMIT 1",
    )
    .bind(project_id)
    .bind(current_sprint_id)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

pub async fn list_workspace_automation_logs(
    pool: &SqlitePool,
    workspace_id: &str,
    limit: i64,
) -> Result<Vec<WorkspaceAutomationLog>> {
    let limit = limit.clamp(1, 50);
    let sql = format!(
        "SELECT {AUTOMATION_LOG_COLUMNS}
         FROM automation_execution_logs l
         LEFT JOIN issues i ON i.id = l.issue_id
         LEFT JOIN users u ON u.id = l.target_user_id
         WHERE l.workspace_id = ?
         ORDER BY l.created_at DESC
         LIMIT ?"
    );

    sqlx::query_as::<_, WorkspaceAutomationLog>(&sql)
        .bind(workspace_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(Into::into)
}
