use chrono;
use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, SqlitePool};
use std::str::FromStr;

use crate::error::{AppError, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectPermission {
    Viewer,
    Editor,
    Admin,
}

impl ProjectPermission {
    fn rank(self) -> i32 {
        match self {
            ProjectPermission::Viewer => 1,
            ProjectPermission::Editor => 2,
            ProjectPermission::Admin => 3,
        }
    }
}

fn default_project_role_for_workspace_role(role: &str) -> &'static str {
    match role {
        "owner" | "admin" => "admin",
        "member" => "editor",
        _ => "viewer",
    }
}

fn project_role_rank(role: &str) -> i32 {
    match role {
        "admin" => 3,
        "editor" => 2,
        "viewer" => 1,
        _ => 0,
    }
}

pub async fn effective_project_role(
    pool: &SqlitePool,
    user_id: &str,
    project_id: &str,
) -> Result<Option<String>> {
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        r#"SELECT wm.role, pm.role
           FROM projects p
           JOIN workspace_members wm
             ON p.workspace_id = wm.workspace_id
           LEFT JOIN project_members pm
             ON pm.project_id = p.id AND pm.user_id = wm.user_id
           WHERE p.id = ? AND wm.user_id = ?"#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(workspace_role, project_role_override)| {
        project_role_override
            .unwrap_or_else(|| default_project_role_for_workspace_role(&workspace_role).to_string())
    }))
}

pub async fn check_project_permission(
    pool: &SqlitePool,
    user_id: &str,
    project_id: &str,
    required: ProjectPermission,
) -> Result<()> {
    let Some(role) = effective_project_role(pool, user_id, project_id).await? else {
        return Err(AppError::Forbidden);
    };

    if project_role_rank(&role) < required.rank() {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

/// Check project access via workspace membership.
/// Only projects with a valid workspace_id and matching membership are allowed.
/// The legacy fallback for workspace_id IS NULL has been removed (2026-03-26)
/// because all projects are now created with a workspace_id. Any orphaned
/// legacy rows must be migrated before they can be accessed.
pub async fn check_project_access(
    pool: &SqlitePool,
    user_id: &str,
    project_id: &str,
) -> Result<()> {
    check_project_permission(pool, user_id, project_id, ProjectPermission::Viewer).await
}

pub async fn create_pool(database_url: &str) -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(database_url)?
        .foreign_keys(true)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(opts)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    // 起動時に期限切れのセッションと OAuth state / code / WS ticket を削除
    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query("DELETE FROM sessions WHERE expires_at < ?")
        .bind(&now)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM oauth_states WHERE expires_at < ?")
        .bind(&now)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM oauth_codes WHERE expires_at < ?")
        .bind(&now)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM ws_tickets WHERE expires_at < ?")
        .bind(&now)
        .execute(&pool)
        .await;

    Ok(pool)
}
