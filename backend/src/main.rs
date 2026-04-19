use std::sync::Arc;

use axum::http::{header, HeaderValue, Method};
use std::net::SocketAddr;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

use nilla::realtime::RealtimeHub;
use nilla::{AppState, Config, SessionCache};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:./nilla.db".to_string());

    let pool = nilla::db::create_pool(&database_url).await?;
    tracing::info!("Database connection established");

    let cors_origin =
        std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    if jwt_secret.len() < 32 {
        panic!("JWT_SECRET must be at least 32 characters long");
    }

    let config = Config {
        jwt_secret,
        google_client_id: std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
        google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
        github_client_id: std::env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
        github_client_secret: std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
        app_url: std::env::var("APP_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
        frontend_url: std::env::var("FRONTEND_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        http_client: reqwest::Client::new(),
    };

    let realtime = RealtimeHub::new();

    let storage_path = std::env::var("STORAGE_PATH").unwrap_or_else(|_| "./uploads".to_string());
    let storage =
        nilla::storage::Storage::local(&storage_path).expect("Failed to initialize local storage");

    let session_cache: SessionCache = moka::future::Cache::builder()
        .max_capacity(10_000)
        .time_to_live(std::time::Duration::from_secs(30))
        .build();

    let state = AppState {
        pool,
        config: Arc::new(config),
        realtime,
        storage,
        session_cache,
    };

    let cors = CorsLayer::new()
        .allow_origin(cors_origin.parse::<HeaderValue>()?)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT])
        .allow_credentials(true)
        .expose_headers(["x-total-count".parse::<axum::http::HeaderName>()?]);

    // Serve frontend static files if dist/ exists (production mode)
    let static_dir = std::env::var("STATIC_DIR").ok().or_else(|| {
        if std::path::Path::new("./dist/index.html").exists() {
            Some("./dist".to_string())
        } else {
            None
        }
    });
    if let Some(static_dir) = static_dir.as_deref() {
        tracing::info!("Serving static files from: {}", static_dir);
    }

    // API 全体のレート制限: 100ms に 1 トークン補充、バースト 200
    // → 定常 10 req/s、最大バースト 200 req (per IP)
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .period(std::time::Duration::from_millis(100))
            .burst_size(200)
            .finish()
            .expect("building API rate limiter should not fail"),
    );

    let app = nilla::create_app(state, static_dir)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(1024 * 1024)) // 1 MB (multipart は別途制限済み)
        .layer(TraceLayer::new_for_http())
        .layer(GovernorLayer::new(governor_conf))
        .layer(axum::middleware::from_fn(nilla::auth::rate_limit_response));

    let addr = "0.0.0.0:8080";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("Listening on http://{addr}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
