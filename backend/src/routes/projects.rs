use axum::{
    extract::{Path, Query, State},
    Extension,
    Json,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    db::check_project_access,
    error::{AppError, Result},
    models::project::{CreateProject, Project, UpdateProject},
};

#[derive(Debug, Deserialize)]
pub struct ListProjectsQuery {
    workspace_id: Option<String>,
}

const GET_PROJECT_SQL: &str =
    "SELECT id, name, key, description, workspace_id, created_at, updated_at FROM projects WHERE id = ?";

pub async fn list_projects(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Query(query): Query<ListProjectsQuery>,
) -> Result<Json<Vec<Project>>> {
    let projects = if let Some(ws_id) = &query.workspace_id {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, key, description, workspace_id, created_at, updated_at FROM projects WHERE workspace_id = ? AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?) ORDER BY created_at DESC"
        )
        .bind(ws_id)
        .bind(&user_id.0)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, key, description, workspace_id, created_at, updated_at FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?) ORDER BY created_at DESC"
        )
        .bind(&user_id.0)
        .fetch_all(&pool)
        .await?
    };
    Ok(Json(projects))
}

pub async fn create_project(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Json(body): Json<CreateProject>,
) -> Result<Json<Project>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    if body.name.len() > 255 {
        return Err(AppError::BadRequest(
            "name must be 255 characters or less".to_string(),
        ));
    }
    if body.key.trim().is_empty() {
        return Err(AppError::BadRequest("key is required".to_string()));
    }
    if body.key.len() > 20 {
        return Err(AppError::BadRequest(
            "key must be 20 characters or less".to_string(),
        ));
    }
    if !body.key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::BadRequest(
            "key must be alphanumeric".to_string(),
        ));
    }
    if body.description.as_deref().map_or(false, |d| d.len() > 10000) {
        return Err(AppError::BadRequest(
            "description must be 10000 characters or less".to_string(),
        ));
    }

    // Verify user is a member of the workspace
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)"
    )
    .bind(&body.workspace_id)
    .bind(&user_id.0)
    .fetch_one(&pool)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden);
    }

    let id = Uuid::new_v4().to_string();
    let key = body.key.to_uppercase();

    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (id, name, key, description, workspace_id) VALUES (?, ?, ?, ?, ?) RETURNING id, name, key, description, workspace_id, created_at, updated_at",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&key)
    .bind(&body.description)
    .bind(&body.workspace_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(project))
}

pub async fn get_project(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Project>> {
    check_project_access(&pool, &user_id.0, &id).await?;
    let project = sqlx::query_as::<_, Project>(GET_PROJECT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(project))
}

pub async fn update_project(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProject>,
) -> Result<Json<Project>> {
    check_project_access(&pool, &user_id.0, &id).await?;

    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name must not be empty".to_string()));
        }
        if name.len() > 255 {
            return Err(AppError::BadRequest(
                "name must be 255 characters or less".to_string(),
            ));
        }
    }
    if body.description.as_deref().map_or(false, |d| d.len() > 10000) {
        return Err(AppError::BadRequest(
            "description must be 10000 characters or less".to_string(),
        ));
    }

    let current = sqlx::query_as::<_, Project>(GET_PROJECT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let name = body.name.unwrap_or(current.name);
    let description = body.description.or(current.description);

    let updated = sqlx::query_as::<_, Project>(
        "UPDATE projects SET name=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, name, key, description, workspace_id, created_at, updated_at",
    )
    .bind(&name)
    .bind(&description)
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(updated))
}

pub async fn delete_project(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    check_project_access(&pool, &user_id.0, &id).await?;

    // Verify the project exists before starting the transaction
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)")
            .bind(&id)
            .fetch_one(&pool)
            .await?;
    if !exists {
        return Err(AppError::NotFound);
    }

    let mut tx = pool.begin().await?;

    // Delete in dependency order: activity_logs and comments are CASCADE-deleted
    // with issues, but issues must be deleted before sprints and projects.
    sqlx::query("DELETE FROM issues WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sprints WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
