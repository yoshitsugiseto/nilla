use axum::{extract::Request, middleware::Next, response::Response};
use axum::extract::State;

use crate::{AppState, auth::jwt, error::AppError};

#[derive(Clone)]
pub struct UserId(pub String);

/// 認証が不要なパス（WebSocket は handler 内でチケット検証するため除外）
const PUBLIC_PATHS: &[&str] = &[
    "/api/auth/google",
    "/api/auth/google/callback",
    "/api/auth/github",
    "/api/auth/github/callback",
    "/api/auth/token",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/ws",
    "/api/health",
];

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let path = request.uri().path();

    if PUBLIC_PATHS.iter().any(|p| *p == path) {
        return Ok(next.run(request).await);
    }

    let token = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let claims = jwt::decode_access_token(token, &state.config.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;

    request.extensions_mut().insert(UserId(claims.sub));

    Ok(next.run(request).await)
}
