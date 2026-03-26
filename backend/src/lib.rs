pub mod auth;
pub mod db;
pub mod error;
pub mod models;
pub mod realtime;
pub mod routes;
pub mod storage;

use std::sync::Arc;

use axum::{Router, middleware, routing::get};
use axum::http::HeaderValue;
use sqlx::SqlitePool;
use tower_http::services::{ServeDir, ServeFile};

use crate::realtime::RealtimeHub;
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
    pub ws_tx: RealtimeHub,
    pub storage: Storage,
}

/// 既存のルートハンドラが State<SqlitePool> で動き続けられるよう FromRef を実装
impl axum::extract::FromRef<AppState> for SqlitePool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

impl axum::extract::FromRef<AppState> for RealtimeHub {
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

async fn add_security_headers(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss:",
        ),
    );
    response
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
        .layer(middleware::from_fn(add_security_headers))
        .with_state(state);

    if let Some(dir) = static_dir {
        let index = format!("{dir}/index.html");
        app = app.fallback_service(
            ServeDir::new(&dir).not_found_service(ServeFile::new(index)),
        );
    }

    app
}
