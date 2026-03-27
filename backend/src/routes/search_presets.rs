use axum::{
    extract::{Path, State},
    Extension, Json,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    db::{check_project_access, check_project_permission, ProjectPermission},
    error::{AppError, Result},
    models::search_preset::{
        CreateSearchPreset, SearchPreset, SearchPresetRow, UpdateSearchPreset,
    },
};

const LIST_SEARCH_PRESETS_SQL: &str =
    "SELECT id, project_id, name, query, filters, created_at, updated_at
     FROM search_presets
     WHERE project_id = ?
     ORDER BY updated_at DESC, created_at DESC";

pub async fn list_search_presets(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<SearchPreset>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let rows = sqlx::query_as::<_, SearchPresetRow>(LIST_SEARCH_PRESETS_SQL)
        .bind(&project_id)
        .fetch_all(&pool)
        .await?;

    Ok(Json(rows.into_iter().map(SearchPreset::from).collect()))
}

pub async fn create_search_preset(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateSearchPreset>,
) -> Result<Json<SearchPreset>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }

    let filters_json =
        serde_json::to_string(&body.filters).map_err(|e| AppError::Internal(e.into()))?;

    let row = sqlx::query_as::<_, SearchPresetRow>(
        "INSERT INTO search_presets (id, project_id, name, query, filters, created_by)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, project_id, name, query, filters, created_at, updated_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&project_id)
    .bind(body.name.trim())
    .bind(body.query.trim())
    .bind(filters_json)
    .bind(&user_id.0)
    .fetch_one(&pool)
    .await?;

    Ok(Json(SearchPreset::from(row)))
}

pub async fn update_search_preset(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(preset_id): Path<String>,
    Json(body): Json<UpdateSearchPreset>,
) -> Result<Json<SearchPreset>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM search_presets WHERE id = ?")
            .bind(&preset_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    if body.name.is_none() && body.query.is_none() && body.filters.is_none() {
        return Err(AppError::BadRequest(
            "At least one field must be provided".to_string(),
        ));
    }
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name is required".to_string()));
        }
    }

    let filters_json = body
        .filters
        .as_ref()
        .map(|filters| serde_json::to_string(filters).map_err(|e| AppError::Internal(e.into())))
        .transpose()?;

    let row = sqlx::query_as::<_, SearchPresetRow>(
        "UPDATE search_presets
         SET name = COALESCE(?, name),
             query = COALESCE(?, query),
             filters = COALESCE(?, filters),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING id, project_id, name, query, filters, created_at, updated_at",
    )
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.query.as_deref().map(str::trim))
    .bind(filters_json)
    .bind(&preset_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(SearchPreset::from(row)))
}

pub async fn delete_search_preset(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(preset_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM search_presets WHERE id = ?")
            .bind(&preset_id)
            .fetch_optional(&pool)
            .await?;
    let project_id = project_id.ok_or(AppError::NotFound)?;
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Editor).await?;

    sqlx::query("DELETE FROM search_presets WHERE id = ?")
        .bind(&preset_id)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
