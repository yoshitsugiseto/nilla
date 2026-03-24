use sqlx::{sqlite::SqliteConnectOptions, SqlitePool, sqlite::SqlitePoolOptions};
use std::str::FromStr;

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
