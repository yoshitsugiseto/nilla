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
use nilla::storage::Storage;
use nilla::{AppState, Config, create_app};

pub const TEST_JWT_SECRET: &str = "test-secret";
pub const TEST_USER_ID: &str = "test-user-001";

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

    pool
}

pub async fn setup_app() -> Router {
    let pool = setup_pool().await;
    let (ws_tx, _) = tokio::sync::broadcast::channel::<String>(16);
    let storage = Storage::local(
        &std::env::temp_dir()
            .join("nilla-test-uploads")
            .to_string_lossy(),
    )
    .unwrap();

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
        }),
        ws_tx,
        storage,
    };

    create_app(state, None)
}

pub fn test_token() -> String {
    jwt::encode_access_token(TEST_USER_ID, TEST_JWT_SECRET).unwrap()
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
// Domain helpers
// ---------------------------------------------------------------

pub async fn create_workspace(app: &Router) -> String {
    let (status, json) = send(
        app,
        post("/api/workspaces", serde_json::json!({ "name": "Test Workspace" })),
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
