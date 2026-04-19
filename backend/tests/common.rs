#![allow(dead_code)]

use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::sync::Arc;
use tower::ServiceExt;

use nilla::auth::jwt;
use nilla::email::EmailSender;
use nilla::realtime::RealtimeHub;
use nilla::storage::Storage;
use nilla::{create_app, AppState, Config, SessionCache};

pub const TEST_JWT_SECRET: &str = "test-secret";
pub const TEST_USER_ID: &str = "test-user-001";
pub const TEST_USER_B_ID: &str = "test-user-002";
pub const TEST_SESSION_ID: &str = "test-session-001";
pub const TEST_USER_B_SESSION_ID: &str = "test-session-002";

async fn insert_session(pool: &SqlitePool, session_id: &str, user_id: &str) {
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(session_id)
    .bind(user_id)
    .bind(format!("hash-{session_id}"))
    .bind(&expires_at)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();
}

pub async fn setup_pool() -> SqlitePool {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // Insert test user so JWT lookups and foreign keys work
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(TEST_USER_ID)
    .bind("test")
    .bind("test-provider-001")
    .bind("test@example.com")
    .bind("Test User")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    insert_session(&pool, TEST_SESSION_ID, TEST_USER_ID).await;

    pool
}

pub async fn setup_app() -> Router {
    let pool = setup_pool().await;
    build_app(pool)
}

/// Return both the Router and the underlying pool so tests can insert
/// additional rows (e.g. extra users) directly via SQL.
pub async fn setup_app_with_pool() -> (Router, SqlitePool) {
    let pool = setup_pool().await;
    let app = build_app(pool.clone());
    (app, pool)
}

fn build_app(pool: SqlitePool) -> Router {
    let realtime = RealtimeHub::new();
    let storage = Storage::local(
        &std::env::temp_dir()
            .join("nilla-test-uploads")
            .to_string_lossy(),
    )
    .unwrap();

    let session_cache: SessionCache = moka::future::Cache::builder()
        .max_capacity(10_000)
        .time_to_live(std::time::Duration::from_secs(30))
        .build();

    let state = AppState {
        pool,
        config: Arc::new(Config {
            jwt_secret: TEST_JWT_SECRET.to_string(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            app_url: "http://localhost:8080".to_string(),
            frontend_url: "http://localhost:3000".to_string(),
            http_client: reqwest::Client::new(),
            smtp_host: None,
            smtp_port: 587,
            smtp_username: None,
            smtp_password: None,
            smtp_from: None,
        }),
        realtime,
        storage,
        session_cache,
        email_sender: EmailSender::from_config(&Config {
            jwt_secret: TEST_JWT_SECRET.to_string(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            app_url: "http://localhost:8080".to_string(),
            frontend_url: "http://localhost:3000".to_string(),
            http_client: reqwest::Client::new(),
            smtp_host: None,
            smtp_port: 587,
            smtp_username: None,
            smtp_password: None,
            smtp_from: None,
        }),
    };

    create_app(state, None)
}

pub fn test_token() -> String {
    jwt::encode_access_token(TEST_USER_ID, TEST_SESSION_ID, TEST_JWT_SECRET).unwrap()
}

pub fn token_for(user_id: &str) -> String {
    let session_id = match user_id {
        TEST_USER_ID => TEST_SESSION_ID,
        TEST_USER_B_ID => TEST_USER_B_SESSION_ID,
        _ => panic!("No test session defined for user_id={user_id}"),
    };
    jwt::encode_access_token(user_id, session_id, TEST_JWT_SECRET).unwrap()
}

/// Insert a second test user (user B) into the pool.
pub async fn insert_user_b(pool: &SqlitePool) {
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(TEST_USER_B_ID)
    .bind("test")
    .bind("test-provider-002")
    .bind("testb@example.com")
    .bind("Test User B")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(pool)
    .await
    .unwrap();

    insert_session(pool, TEST_USER_B_SESSION_ID, TEST_USER_B_ID).await;
}

// ---------------------------------------------------------------
// Request helpers — all include the test auth header
// ---------------------------------------------------------------

pub async fn send(app: &Router, req: Request<Body>) -> (StatusCode, serde_json::Value) {
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}

pub async fn send_with_headers(
    app: &Router,
    req: Request<Body>,
) -> (StatusCode, HeaderMap, serde_json::Value) {
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let headers = resp.headers().clone();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, headers, json)
}

pub fn get(uri: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header("Authorization", format!("Bearer {}", test_token()))
        .body(Body::empty())
        .unwrap()
}

pub fn post(uri: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", test_token()))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn put(uri: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", test_token()))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn patch(uri: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", test_token()))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn delete(uri: &str) -> Request<Body> {
    Request::builder()
        .method("DELETE")
        .uri(uri)
        .header("Authorization", format!("Bearer {}", test_token()))
        .body(Body::empty())
        .unwrap()
}

// ---------------------------------------------------------------
// Request helpers with custom token (for multi-user tests)
// ---------------------------------------------------------------

pub fn get_as(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap()
}

pub fn post_as(uri: &str, body: serde_json::Value, token: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn put_as(uri: &str, body: serde_json::Value, token: &str) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn patch_as(uri: &str, body: serde_json::Value, token: &str) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(uri)
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

pub fn delete_as(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method("DELETE")
        .uri(uri)
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap()
}

// ---------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------

pub async fn create_workspace(app: &Router) -> String {
    let (status, json) = send(
        app,
        post(
            "/api/workspaces",
            serde_json::json!({ "name": "Test Workspace" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_workspace failed: {json}");
    json["id"].as_str().unwrap().to_string()
}

pub async fn create_project(app: &Router, name: &str, key: &str) -> String {
    let ws_id = create_workspace(app).await;
    create_project_in(app, name, key, &ws_id).await
}

pub async fn create_project_in(app: &Router, name: &str, key: &str, workspace_id: &str) -> String {
    let (status, json) = send(
        app,
        post(
            "/api/projects",
            serde_json::json!({ "name": name, "key": key, "workspace_id": workspace_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_project failed: {json}");
    json["id"].as_str().unwrap().to_string()
}

pub async fn create_issue(app: &Router, project_id: &str, title: &str) -> String {
    let (status, json) = send(
        app,
        post(
            &format!("/api/projects/{project_id}/issues"),
            serde_json::json!({ "title": title }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_issue failed: {json}");
    json["id"].as_str().unwrap().to_string()
}

pub async fn create_sprint(app: &Router, project_id: &str, name: &str) -> String {
    let (status, json) = send(
        app,
        post(
            &format!("/api/projects/{project_id}/sprints"),
            serde_json::json!({ "name": name }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_sprint failed: {json}");
    json["id"].as_str().unwrap().to_string()
}

pub async fn create_label(app: &Router, project_id: &str, name: &str) -> String {
    let (status, json) = send(
        app,
        post(
            &format!("/api/projects/{project_id}/labels"),
            serde_json::json!({ "name": name }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_label failed: {json}");
    json["id"].as_str().unwrap().to_string()
}

pub async fn create_template(app: &Router, project_id: &str, name: &str) -> String {
    let (status, json) = send(
        app,
        post(
            &format!("/api/projects/{project_id}/templates"),
            serde_json::json!({ "name": name }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create_template failed: {json}");
    json["id"].as_str().unwrap().to_string()
}
