use axum::extract::State;
use axum::{extract::Request, middleware::Next, response::Response};
use chrono::Utc;

use crate::{auth::jwt, error::AppError, AppState};

#[derive(Clone)]
pub struct UserId(pub String);

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let claims = jwt::decode_access_token(token, &state.config.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;

    let now = Utc::now().to_rfc3339();
    let session_is_valid: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?)",
    )
    .bind(&claims.sid)
    .bind(&claims.sub)
    .bind(&now)
    .fetch_one(&state.pool)
    .await?;
    if !session_is_valid {
        return Err(AppError::Unauthorized);
    }

    request.extensions_mut().insert(UserId(claims.sub));

    Ok(next.run(request).await)
}
