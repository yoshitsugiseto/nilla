use axum::{
    extract::{Path, State},
    Extension, Json,
};
use chrono::Utc;
use sqlx::SqlitePool;

use crate::{
    auth::middleware::UserId,
    db::{check_project_access, check_project_permission, ProjectPermission},
    error::{AppError, Result},
    models::workspace::{
        AddMember, CreateWorkspace, ProjectMember, UpdateMemberRole, UpdateProjectMemberRole,
        UpdateWorkspace, UserInfo, Workspace, WorkspaceMember,
    },
};

const INVALID_WORKSPACE_ROLE_ERROR: &str = "role must be one of: owner, admin, member, viewer";
const INVALID_PROJECT_ROLE_ERROR: &str = "role must be one of: admin, editor, viewer";

async fn check_workspace_access(
    pool: &SqlitePool,
    user_id: &str,
    workspace_id: &str,
) -> Result<()> {
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn check_workspace_admin(pool: &SqlitePool, user_id: &str, workspace_id: &str) -> Result<()> {
    let is_admin: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND role IN ('owner', 'admin'))"
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !is_admin {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub async fn list_workspaces(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
) -> Result<Json<Vec<Workspace>>> {
    let workspaces = sqlx::query_as::<_, Workspace>(
        "SELECT w.id, w.name, w.created_by, w.created_at, w.updated_at FROM workspaces w JOIN workspace_members wm ON w.id = wm.workspace_id WHERE wm.user_id = ? ORDER BY w.created_at DESC"
    )
    .bind(&user_id.0)
    .fetch_all(&pool)
    .await?;
    Ok(Json(workspaces))
}

pub async fn create_workspace(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Json(body): Json<CreateWorkspace>,
) -> Result<Json<Workspace>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    if body.name.len() > 255 {
        return Err(AppError::BadRequest(
            "name must be 255 characters or less".to_string(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO workspaces (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&user_id.0)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await?;

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
    )
    .bind(&id)
    .bind(&user_id.0)
    .bind(&now)
    .execute(&pool)
    .await?;

    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT id, name, created_by, created_at, updated_at FROM workspaces WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(workspace))
}

pub async fn get_workspace(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Workspace>> {
    check_workspace_access(&pool, &user_id.0, &id).await?;

    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT id, name, created_by, created_at, updated_at FROM workspaces WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(workspace))
}

pub async fn update_workspace(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateWorkspace>,
) -> Result<Json<Workspace>> {
    check_workspace_admin(&pool, &user_id.0, &id).await?;

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

    let current = sqlx::query_as::<_, Workspace>(
        "SELECT id, name, created_by, created_at, updated_at FROM workspaces WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let name = body.name.unwrap_or(current.name);
    let now = Utc::now().to_rfc3339();

    let workspace = sqlx::query_as::<_, Workspace>(
        "UPDATE workspaces SET name=?, updated_at=? WHERE id=? RETURNING id, name, created_by, created_at, updated_at"
    )
    .bind(&name)
    .bind(&now)
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(workspace))
}

pub async fn list_members(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(workspace_id): Path<String>,
) -> Result<Json<Vec<WorkspaceMember>>> {
    check_workspace_access(&pool, &user_id.0, &workspace_id).await?;

    let members = sqlx::query_as::<_, WorkspaceMember>(
        "SELECT wm.workspace_id, wm.user_id, u.name, u.email, u.avatar_url, wm.role, wm.joined_at FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = ? ORDER BY wm.joined_at ASC"
    )
    .bind(&workspace_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(members))
}

pub async fn add_member(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(workspace_id): Path<String>,
    Json(body): Json<AddMember>,
) -> Result<Json<WorkspaceMember>> {
    check_workspace_admin(&pool, &user_id.0, &workspace_id).await?;

    let role = body.role.unwrap_or_else(|| "member".to_string());
    let valid_roles = ["owner", "admin", "member", "viewer"];
    if !valid_roles.contains(&role.as_str()) {
        return Err(AppError::BadRequest(
            INVALID_WORKSPACE_ROLE_ERROR.to_string(),
        ));
    }
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
    )
    .bind(&workspace_id)
    .bind(&body.user_id)
    .bind(&role)
    .bind(&now)
    .execute(&pool)
    .await?;

    let member = sqlx::query_as::<_, WorkspaceMember>(
        "SELECT wm.workspace_id, wm.user_id, u.name, u.email, u.avatar_url, wm.role, wm.joined_at FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = ? AND wm.user_id = ?"
    )
    .bind(&workspace_id)
    .bind(&body.user_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(member))
}

pub async fn update_member_role(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path((workspace_id, target_uid)): Path<(String, String)>,
    Json(body): Json<UpdateMemberRole>,
) -> Result<Json<WorkspaceMember>> {
    check_workspace_admin(&pool, &user_id.0, &workspace_id).await?;

    let valid_roles = ["owner", "admin", "member", "viewer"];
    if !valid_roles.contains(&body.role.as_str()) {
        return Err(AppError::BadRequest(
            INVALID_WORKSPACE_ROLE_ERROR.to_string(),
        ));
    }

    // Protect last owner: if target is currently an owner and new role is not owner,
    // ensure there will still be at least one owner remaining
    if body.role != "owner" {
        let current_role: Option<String> = sqlx::query_scalar(
            "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        )
        .bind(&workspace_id)
        .bind(&target_uid)
        .fetch_optional(&pool)
        .await?;

        if current_role.as_deref() == Some("owner") {
            let owner_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ? AND role = 'owner'",
            )
            .bind(&workspace_id)
            .fetch_one(&pool)
            .await?;

            if owner_count <= 1 {
                return Err(AppError::BadRequest(
                    "Cannot remove the last owner of a workspace".to_string(),
                ));
            }
        }
    }

    sqlx::query("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?")
        .bind(&body.role)
        .bind(&workspace_id)
        .bind(&target_uid)
        .execute(&pool)
        .await?;

    let member = sqlx::query_as::<_, WorkspaceMember>(
        "SELECT wm.workspace_id, wm.user_id, u.name, u.email, u.avatar_url, wm.role, wm.joined_at FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = ? AND wm.user_id = ?"
    )
    .bind(&workspace_id)
    .bind(&target_uid)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(member))
}

pub async fn remove_member(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path((workspace_id, target_uid)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>> {
    check_workspace_admin(&pool, &user_id.0, &workspace_id).await?;

    // Protect last owner: prevent removing the last owner
    let current_role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    )
    .bind(&workspace_id)
    .bind(&target_uid)
    .fetch_optional(&pool)
    .await?;

    if current_role.as_deref() == Some("owner") {
        let owner_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ? AND role = 'owner'",
        )
        .bind(&workspace_id)
        .fetch_one(&pool)
        .await?;

        if owner_count <= 1 {
            return Err(AppError::BadRequest(
                "Cannot remove the last owner of a workspace".to_string(),
            ));
        }
    }

    let result =
        sqlx::query("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
            .bind(&workspace_id)
            .bind(&target_uid)
            .execute(&pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_users(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
) -> Result<Json<Vec<UserInfo>>> {
    let users = sqlx::query_as::<_, UserInfo>(
        "SELECT DISTINCT u.id, u.name, u.email, u.avatar_url, u.provider FROM users u
         JOIN workspace_members wm ON u.id = wm.user_id
         WHERE wm.workspace_id IN (
             SELECT workspace_id FROM workspace_members WHERE user_id = ?
         )
         ORDER BY u.name ASC",
    )
    .bind(&user_id.0)
    .fetch_all(&pool)
    .await?;
    Ok(Json(users))
}

pub async fn get_project_members(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<ProjectMember>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;

    let members = sqlx::query_as::<_, ProjectMember>(
        r#"SELECT
                wm.workspace_id,
                p.id as project_id,
                wm.user_id,
                u.name,
                u.email,
                u.avatar_url,
                COALESCE(
                    pm.role,
                    CASE wm.role
                        WHEN 'owner' THEN 'admin'
                        WHEN 'admin' THEN 'admin'
                        WHEN 'member' THEN 'editor'
                        ELSE 'viewer'
                    END
                ) as role,
                wm.role as workspace_role,
                CASE WHEN pm.role IS NULL THEN 1 ELSE 0 END as inherited,
                wm.joined_at
           FROM projects p
           JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
           JOIN users u ON wm.user_id = u.id
           LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
           WHERE p.id = ?
           ORDER BY wm.joined_at ASC"#,
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(members))
}

pub async fn update_project_member_role(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path((project_id, target_uid)): Path<(String, String)>,
    Json(body): Json<UpdateProjectMemberRole>,
) -> Result<Json<ProjectMember>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Admin).await?;

    let valid_roles = ["admin", "editor", "viewer"];
    if !valid_roles.contains(&body.role.as_str()) {
        return Err(AppError::BadRequest(INVALID_PROJECT_ROLE_ERROR.to_string()));
    }

    let workspace_id: Option<String> = sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(&project_id)
        .fetch_optional(&pool)
        .await?;
    let workspace_id = workspace_id.ok_or(AppError::NotFound)?;

    let is_workspace_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)",
    )
    .bind(&workspace_id)
    .bind(&target_uid)
    .fetch_one(&pool)
    .await?;
    if !is_workspace_member {
        return Err(AppError::BadRequest(
            "User must belong to the workspace before assigning a project role".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"INSERT INTO project_members (project_id, user_id, role, assigned_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, user_id)
           DO UPDATE SET role = excluded.role, assigned_at = excluded.assigned_at"#,
    )
    .bind(&project_id)
    .bind(&target_uid)
    .bind(&body.role)
    .bind(&now)
    .execute(&pool)
    .await?;

    let member = sqlx::query_as::<_, ProjectMember>(
        r#"SELECT
                wm.workspace_id,
                p.id as project_id,
                wm.user_id,
                u.name,
                u.email,
                u.avatar_url,
                COALESCE(pm.role, 'viewer') as role,
                wm.role as workspace_role,
                CASE WHEN pm.role IS NULL THEN 1 ELSE 0 END as inherited,
                wm.joined_at
           FROM projects p
           JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
           JOIN users u ON wm.user_id = u.id
           LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
           WHERE p.id = ? AND wm.user_id = ?"#,
    )
    .bind(&project_id)
    .bind(&target_uid)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(member))
}

pub async fn clear_project_member_role(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path((project_id, target_uid)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>> {
    check_project_permission(&pool, &user_id.0, &project_id, ProjectPermission::Admin).await?;

    sqlx::query("DELETE FROM project_members WHERE project_id = ? AND user_id = ?")
        .bind(&project_id)
        .bind(&target_uid)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
