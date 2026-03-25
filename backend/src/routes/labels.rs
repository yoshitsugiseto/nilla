use axum::{
    extract::{Path, State},
    Extension, Json,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    models::label::{CreateLabel, ProjectLabel, UpdateLabel},
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

pub async fn list_labels(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<ProjectLabel>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let labels = sqlx::query_as::<_, ProjectLabel>(
        "SELECT id, project_id, name, color, created_at FROM project_labels WHERE project_id = ? ORDER BY name ASC",
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(labels))
}

pub async fn create_label(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateLabel>,
) -> Result<Json<ProjectLabel>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let color = body.color.unwrap_or_else(|| "#6366f1".to_string());

    let label = sqlx::query_as::<_, ProjectLabel>(
        "INSERT INTO project_labels (id, project_id, name, color) VALUES (?, ?, ?, ?) RETURNING id, project_id, name, color, created_at",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(body.name.trim())
    .bind(&color)
    .fetch_one(&pool)
    .await?;

    Ok(Json(label))
}

pub async fn update_label(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(label_id): Path<String>,
    Json(body): Json<UpdateLabel>,
) -> Result<Json<ProjectLabel>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM project_labels WHERE id = ?")
            .bind(&label_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name is required".to_string()));
        }
    }

    let label = sqlx::query_as::<_, ProjectLabel>(
        "UPDATE project_labels SET
            name  = COALESCE(?, name),
            color = COALESCE(?, color)
         WHERE id = ?
         RETURNING id, project_id, name, color, created_at",
    )
    .bind(body.name.as_deref().map(str::trim))
    .bind(&body.color)
    .bind(&label_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(label))
}

pub async fn delete_label(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(label_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM project_labels WHERE id = ?")
            .bind(&label_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_access(&pool, &user_id.0, &project_id).await?;

    sqlx::query("DELETE FROM project_labels WHERE id = ?")
        .bind(&label_id)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
