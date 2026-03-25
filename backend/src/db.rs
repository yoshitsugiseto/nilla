use sqlx::{sqlite::SqliteConnectOptions, SqlitePool, sqlite::SqlitePoolOptions};
use std::str::FromStr;

use crate::error::{AppError, Result};

/// プロジェクトへのアクセス権を確認する共通関数。
/// workspace_members 経由でメンバーシップを検証し、
/// workspace_id が NULL のレガシープロジェクトはフォールバックで許可する。
pub async fn check_project_access(pool: &SqlitePool, user_id: &str, project_id: &str) -> Result<()> {
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

    Ok(pool)
}
