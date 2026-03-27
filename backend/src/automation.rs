use sqlx::SqlitePool;

use crate::{
    error::{AppError, Result},
    models::workspace::WorkspaceAutomationSettings,
};

const AUTOMATION_COLUMNS: &str =
    "workspace_id, notify_on_assignee_change, notify_on_review_ready, notify_on_overdue_transition, sprint_carryover_mode";

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
