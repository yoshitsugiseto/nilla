pub mod auth;
pub mod automation;
pub mod csp;
pub mod db;
pub mod error;
pub mod models;
pub mod realtime;
pub mod routes;
pub mod storage;

use std::sync::Arc;

use axum::http::HeaderValue;
use axum::{middleware, routing::get, Router};
use sqlx::SqlitePool;
use tower_http::services::ServeDir;

use crate::csp::{serve_index_with_nonce, IndexTemplate};
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
    pub realtime: RealtimeHub,
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
        state.realtime.clone()
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
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    // Static assets and API responses get a strict CSP without any nonce.
    // The index.html handler (serve_index_with_nonce) sets its own
    // per-request nonce-based CSP, so this default is only reached for
    // non-HTML responses where inline styles/scripts are irrelevant.
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' wss:",
        ),
    );
    response
}

pub fn create_app(state: AppState, static_dir: Option<String>) -> Router {
    let public_router = Router::new()
        .route("/api/health", get(health))
        .merge(auth::public_router());

    let private_router =
        auth::protected_router()
            .merge(routes::router())
            .layer(middleware::from_fn_with_state(
                state.clone(),
                auth::middleware::auth_middleware,
            ));

    let mut app = Router::new()
        .merge(public_router)
        .merge(private_router)
        .layer(middleware::from_fn(add_security_headers))
        .with_state(state);

    if let Some(dir) = static_dir {
        let template = IndexTemplate::load(&dir)
            .expect("Failed to read index.html from static dir");
        // Serve static assets (JS, CSS, images) directly.
        // For any path not matched by ServeDir (i.e. SPA routes),
        // fall back to index.html with a per-request CSP nonce.
        let index_template = Arc::new(template);
        app = app.fallback_service(
            ServeDir::new(&dir).not_found_service(axum::routing::get(
                move || {
                    let tpl = Arc::clone(&index_template);
                    async move { serve_index_with_nonce(&tpl) }
                },
            )),
        );
    }

    app
}
