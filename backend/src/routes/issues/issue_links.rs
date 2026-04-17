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
    models::issue::{CreateIssueLink, IssueLink},
};

use super::helpers::get_project_id_for_issue;

const INVALID_LINK_TYPE_ERROR: &str =
    "link_type must be one of: blocks, is_blocked_by, relates_to, duplicates";

fn validate_link_type(t: &str) -> Result<()> {
    match t {
        "blocks" | "is_blocked_by" | "relates_to" | "duplicates" => Ok(()),
        _ => Err(AppError::BadRequest(INVALID_LINK_TYPE_ERROR.to_string())),
    }
}

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
