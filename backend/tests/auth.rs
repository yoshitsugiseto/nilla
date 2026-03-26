mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use nilla::auth::jwt;

// ---------------------------------------------------------------
// Access with valid token
// ---------------------------------------------------------------

#[tokio::test]
async fn test_access_with_valid_token_returns_200() {
    let app = common::setup_app().await;
    let (status, json) = common::send(&app, common::get("/api/projects")).await;
    assert_eq!(status, StatusCode::OK);
    // Should return an empty list, not an error
    assert!(json.is_array());
}

#[tokio::test]
async fn test_get_me_with_valid_token_returns_user() {
    let app = common::setup_app().await;
    let (status, json) = common::send(&app, common::get("/api/auth/me")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], common::TEST_USER_ID);
    assert_eq!(json["name"], "Test User");
    assert_eq!(json["email"], "test@example.com");
}

// ---------------------------------------------------------------
// Access with missing token
// ---------------------------------------------------------------

#[tokio::test]
async fn test_access_with_missing_token_returns_401() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_get_me_with_missing_token_returns_401() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------
// Access with invalid token
// ---------------------------------------------------------------

#[tokio::test]
async fn test_access_with_malformed_jwt_returns_401() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .header("Authorization", "Bearer not-a-valid-jwt")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_access_with_wrong_secret_jwt_returns_401() {
    let app = common::setup_app().await;
    // Create a token with a different secret
    let bad_token = jwt::encode_access_token(
        common::TEST_USER_ID,
        common::TEST_SESSION_ID,
        "wrong-secret",
    )
    .unwrap();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .header("Authorization", format!("Bearer {}", bad_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_access_with_bearer_prefix_missing_returns_401() {
    let app = common::setup_app().await;
    let token = common::test_token();
    // Send token without "Bearer " prefix
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .header("Authorization", token)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_access_with_empty_bearer_returns_401() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .header("Authorization", "Bearer ")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------
// Expired token
// ---------------------------------------------------------------

#[tokio::test]
async fn test_access_with_expired_token_returns_401() {
    let app = common::setup_app().await;

    // Manually create an expired token
    use jsonwebtoken::{encode, EncodingKey, Header};
    let claims = serde_json::json!({
        "sub": common::TEST_USER_ID,
        "sid": common::TEST_SESSION_ID,
        "exp": 1000000000 // Unix timestamp well in the past
    });
    let expired_token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(common::TEST_JWT_SECRET.as_bytes()),
    )
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/projects")
                .header("Authorization", format!("Bearer {}", expired_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------
// Public paths do not require auth
// ---------------------------------------------------------------

#[tokio::test]
async fn test_health_does_not_require_auth() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ---------------------------------------------------------------
// Refresh token flow
// ---------------------------------------------------------------

/// Helper: create a session in the DB and return the raw refresh token plus session_id.
async fn create_test_session(pool: &sqlx::SqlitePool, user_id: &str) -> (String, String) {
    use sha2::{Digest, Sha256};

    let refresh_token = "test-refresh-token-abc123";
    let mut hasher = Sha256::new();
    hasher.update(refresh_token.as_bytes());
    let hash = hex::encode(hasher.finalize());

    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(&hash)
    .bind(&expires_at)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();

    (refresh_token.to_string(), session_id)
}

/// Helper: create an expired session in the DB and return the raw refresh token.
async fn create_expired_session(pool: &sqlx::SqlitePool, user_id: &str) -> String {
    use sha2::{Digest, Sha256};

    let refresh_token = "expired-refresh-token-xyz";
    let mut hasher = Sha256::new();
    hasher.update(refresh_token.as_bytes());
    let hash = hex::encode(hasher.finalize());

    let session_id = uuid::Uuid::new_v4().to_string();
    // Already expired
    let expires_at = (chrono::Utc::now() - chrono::Duration::days(1)).to_rfc3339();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(&hash)
    .bind(&expires_at)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();

    refresh_token.to_string()
}

#[tokio::test]
async fn test_refresh_with_valid_cookie_returns_new_access_token() {
    let (app, pool) = common::setup_app_with_pool().await;
    let (refresh_token, session_id) = create_test_session(&pool, common::TEST_USER_ID).await;

    let (status, json) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["access_token"].is_string());
    assert!(!json["access_token"].as_str().unwrap().is_empty());
    let claims = jwt::decode_access_token(
        json["access_token"].as_str().unwrap(),
        common::TEST_JWT_SECRET,
    )
    .unwrap();
    assert_eq!(claims.sub, common::TEST_USER_ID);
    assert_eq!(claims.sid, session_id);
}

#[tokio::test]
async fn test_refresh_without_cookie_returns_401() {
    let app = common::setup_app().await;
    let (status, _) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_refresh_with_invalid_token_returns_401() {
    let app = common::setup_app().await;
    let (status, _) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .header("Cookie", "refresh_token=nonexistent-token")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_refresh_with_expired_session_returns_401() {
    let (app, pool) = common::setup_app_with_pool().await;
    let refresh_token = create_expired_session(&pool, common::TEST_USER_ID).await;

    let (status, _) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_refreshed_token_grants_access() {
    let (app, pool) = common::setup_app_with_pool().await;
    let (refresh_token, _) = create_test_session(&pool, common::TEST_USER_ID).await;

    // Get new access token via refresh
    let (status, json) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let new_access_token = json["access_token"].as_str().unwrap();

    // Use the new token to access a protected endpoint
    let (status, json) =
        common::send(&app, common::get_as("/api/projects", new_access_token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(json.is_array());
}

// ---------------------------------------------------------------
// Logout flow
// ---------------------------------------------------------------

#[tokio::test]
async fn test_logout_returns_204_and_clears_cookie() {
    let (app, pool) = common::setup_app_with_pool().await;
    let (refresh_token, _) = create_test_session(&pool, common::TEST_USER_ID).await;

    let (status, headers, _) = common::send_with_headers(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/logout")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Check that the Set-Cookie header clears the refresh token
    let cookie = headers.get("set-cookie").unwrap().to_str().unwrap();
    assert!(cookie.contains("refresh_token="));
    assert!(cookie.contains("Max-Age=0"));
}

#[tokio::test]
async fn test_after_logout_refresh_returns_401() {
    let (app, pool) = common::setup_app_with_pool().await;
    let (refresh_token, session_id) = create_test_session(&pool, common::TEST_USER_ID).await;
    let access_token =
        jwt::encode_access_token(common::TEST_USER_ID, &session_id, common::TEST_JWT_SECRET)
            .unwrap();

    // Logout
    common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/logout")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    // Try to refresh — should fail because session was deleted
    let (status, _) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/refresh")
            .header("Cookie", format!("refresh_token={}", refresh_token))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = common::send(&app, common::get_as("/api/projects", &access_token)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_logout_without_cookie_still_returns_204() {
    let app = common::setup_app().await;
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/logout")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

// ---------------------------------------------------------------
// WebSocket ticket auth flow
// ---------------------------------------------------------------

#[tokio::test]
async fn test_create_ws_ticket_with_valid_token_returns_ticket() {
    let app = common::setup_app().await;

    let (status, json) = common::send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/api/auth/ws-ticket")
            .header("Authorization", format!("Bearer {}", common::test_token()))
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(json["ticket"].is_string());
    assert!(!json["ticket"].as_str().unwrap().is_empty());
}

#[tokio::test]
async fn test_create_ws_ticket_without_auth_returns_401() {
    let app = common::setup_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/ws-ticket")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------
// JWT unit-level tests
// ---------------------------------------------------------------

#[tokio::test]
async fn test_jwt_encode_decode_roundtrip() {
    let token = jwt::encode_access_token("user-123", "session-123", "my-secret").unwrap();
    let claims = jwt::decode_access_token(&token, "my-secret").unwrap();
    assert_eq!(claims.sub, "user-123");
    assert_eq!(claims.sid, "session-123");
}

#[tokio::test]
async fn test_jwt_decode_with_wrong_secret_fails() {
    let token = jwt::encode_access_token("user-123", "session-123", "secret-a").unwrap();
    let result = jwt::decode_access_token(&token, "secret-b");
    assert!(result.is_err());
}

#[tokio::test]
async fn test_jwt_decode_garbage_fails() {
    let result = jwt::decode_access_token("not.a.jwt", "my-secret");
    assert!(result.is_err());
}
