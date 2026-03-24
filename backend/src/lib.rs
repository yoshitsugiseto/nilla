pub mod auth;
pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod storage;

use std::sync::Arc;

use axum::{Router, middleware, routing::get};
use sqlx::SqlitePool;
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};

use crate::storage::Storage;

#[derive(Clone)]
pub struct Config {
    pub jwt_secret: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub app_url: String,
    pub frontend_url: String,
    pub http_client: reqwest::Client,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub config: Arc<Config>,
    pub ws_tx: broadcast::Sender<String>,
    pub storage: Storage,
}

/// 既存のルートハンドラが State<SqlitePool> で動き続けられるよう FromRef を実装
impl axum::extract::FromRef<AppState> for SqlitePool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

impl axum::extract::FromRef<AppState> for broadcast::Sender<String> {
    fn from_ref(state: &AppState) -> Self {
        state.ws_tx.clone()
    }
}

impl axum::extract::FromRef<AppState> for Storage {
    fn from_ref(state: &AppState) -> Self {
        state.storage.clone()
    }
}

async fn health() -> &'static str {
    "ok"
}

pub fn create_app(state: AppState, static_dir: Option<String>) -> Router {
    let mut app = Router::new()
        .route("/api/health", get(health))
        .merge(auth::router())
        .merge(routes::router(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state);

    if let Some(dir) = static_dir {
        let index = format!("{dir}/index.html");
        app = app.fallback_service(
            ServeDir::new(&dir).not_found_service(ServeFile::new(index)),
        );
    }

    app
}
