use axum::{
    extract::{Path, State},
    Extension, Json,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    models::template::{CreateTemplate, IssueTemplate, IssueTemplateRow, UpdateTemplate},
};

async fn check_project_access(pool: &SqlitePool, user_id: &str, project_id: &str) -> Result<()> {
    let has_access: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM projects p JOIN workspace_members wm ON p.workspace_id = wm.workspace_id WHERE p.id = ? AND wm.user_id = ?)"
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_access {
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

pub async fn list_templates(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<IssueTemplate>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let rows = sqlx::query_as::<_, IssueTemplateRow>(
        "SELECT id, project_id, name, description, type, priority, labels, points, created_at FROM issue_templates WHERE project_id = ? ORDER BY name ASC",
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.into_iter().map(IssueTemplate::from).collect()))
}

pub async fn create_template(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateTemplate>,
) -> Result<Json<IssueTemplate>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let issue_type = body.r#type.unwrap_or_else(|| "task".to_string());
    let priority = body.priority.unwrap_or_else(|| "medium".to_string());
    let labels_json = serde_json::to_string(&body.labels.unwrap_or_default())
        .map_err(|e| AppError::Internal(e.into()))?;

    let row = sqlx::query_as::<_, IssueTemplateRow>(
        "INSERT INTO issue_templates (id, project_id, name, description, type, priority, labels, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, project_id, name, description, type, priority, labels, points, created_at",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(body.name.trim())
    .bind(&body.description)
    .bind(&issue_type)
    .bind(&priority)
    .bind(&labels_json)
    .bind(body.points)
    .fetch_one(&pool)
    .await?;

    Ok(Json(IssueTemplate::from(row)))
}

pub async fn update_template(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(template_id): Path<String>,
    Json(body): Json<UpdateTemplate>,
) -> Result<Json<IssueTemplate>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM issue_templates WHERE id = ?")
            .bind(&template_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name is required".to_string()));
        }
    }

    let labels_json = body.labels.as_ref().map(|l| serde_json::to_string(l).ok()).flatten();

    let row = sqlx::query_as::<_, IssueTemplateRow>(
        "UPDATE issue_templates SET
            name        = COALESCE(?, name),
            description = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
            type        = COALESCE(?, type),
            priority    = COALESCE(?, priority),
            labels      = CASE WHEN ? IS NOT NULL THEN ? ELSE labels END,
            points      = CASE WHEN ? IS NOT NULL THEN ? ELSE points END
         WHERE id = ?
         RETURNING id, project_id, name, description, type, priority, labels, points, created_at",
    )
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.description.as_ref().map(|_| 1i32))
    .bind(&body.description)
    .bind(&body.r#type)
    .bind(&body.priority)
    .bind(labels_json.as_ref().map(|_| 1i32))
    .bind(&labels_json)
    .bind(body.points.map(|_| 1i32))
    .bind(body.points)
    .bind(&template_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(IssueTemplate::from(row)))
}

pub async fn delete_template(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(template_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM issue_templates WHERE id = ?")
            .bind(&template_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    sqlx::query("DELETE FROM issue_templates WHERE id = ?")
        .bind(&template_id)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
