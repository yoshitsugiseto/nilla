mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};

use tower::ServiceExt;

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

#[tokio::test]
async fn health_returns_ok() {
    let app = common::setup_app().await;

    let response = app
        .oneshot(Request::builder().uri("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

// ---------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------

#[tokio::test]
async fn protected_route_requires_auth() {
    let app = common::setup_app().await;

    // Request with no Authorization header
    let response = app
        .oneshot(Request::builder().uri("/api/projects").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn invalid_token_is_rejected() {
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
