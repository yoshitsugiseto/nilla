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

    let now = Utc::now();

    // Check in-memory session cache first to avoid a DB round-trip.
    let user_id = if let Some((cached_user_id, expires_at)) =
        state.session_cache.get(&claims.sid).await
    {
        if expires_at > now && cached_user_id == claims.sub {
            // Cache hit: session is still valid
            cached_user_id
        } else {
            // Cached entry is expired or user_id mismatch — evict and fall through to DB
            state.session_cache.invalidate(&claims.sid).await;
            validate_session_from_db(&state, &claims.sid, &claims.sub, &now).await?
        }
    } else {
        // Cache miss — query DB
        validate_session_from_db(&state, &claims.sid, &claims.sub, &now).await?
    };

    request.extensions_mut().insert(UserId(user_id));

    Ok(next.run(request).await)
}

/// Query the database for the session, populate the cache on success.
async fn validate_session_from_db(
    state: &AppState,
    session_id: &str,
    expected_user_id: &str,
    now: &chrono::DateTime<Utc>,
) -> Result<String, AppError> {
    let now_str = now.to_rfc3339();
    let session_is_valid: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?)",
    )
    .bind(session_id)
    .bind(expected_user_id)
    .bind(&now_str)
    .fetch_one(&state.pool)
    .await?;

    if !session_is_valid {
        return Err(AppError::Unauthorized);
    }

    // Fetch the actual expires_at so we can cache it accurately
    let expires_at: String = sqlx::query_scalar(
        "SELECT expires_at FROM sessions WHERE id = ? AND user_id = ?",
    )
    .bind(session_id)
    .bind(expected_user_id)
    .fetch_one(&state.pool)
    .await?;

    let parsed_expires = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or(*now);

    // Populate the cache so subsequent requests skip the DB
    state
        .session_cache
        .insert(
            session_id.to_string(),
            (expected_user_id.to_string(), parsed_expires),
        )
        .await;

    Ok(expected_user_id.to_string())
}
