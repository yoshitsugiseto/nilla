use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{Json, Response},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::UserId;
use crate::{auth::jwt, error::AppError, AppState};

// ─── Query params ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: String,
    state: String,
}

// ─── External API types ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: Option<String>,
    name: String,
    picture: Option<String>,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GithubUserInfo {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub provider: String,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

pub fn generate_random_hex(len: usize) -> String {
    use rand::Rng;
    let bytes: Vec<u8> = (0..len).map(|_| rand::rngs::OsRng.gen::<u8>()).collect();
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

async fn store_oauth_state(pool: &sqlx::SqlitePool, state: &str) -> anyhow::Result<()> {
    let expires_at = (Utc::now() + chrono::Duration::minutes(10)).to_rfc3339();
    sqlx::query!(
        "INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)",
        state,
        expires_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn verify_and_consume_state(pool: &sqlx::SqlitePool, state: &str) -> anyhow::Result<bool> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query!(
        "DELETE FROM oauth_states WHERE state = ? AND expires_at > ?",
        state,
        now
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

async fn store_oauth_code(
    pool: &sqlx::SqlitePool,
    code: &str,
    access_token: &str,
    refresh_token: &str,
) -> anyhow::Result<()> {
    let expires_at = (Utc::now() + chrono::Duration::seconds(30)).to_rfc3339();
    sqlx::query(
        "INSERT INTO oauth_codes (code, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(code)
    .bind(access_token)
    .bind(refresh_token)
    .bind(&expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

async fn exchange_oauth_code(
    pool: &sqlx::SqlitePool,
    code: &str,
) -> anyhow::Result<Option<(String, String)>> {
    let now = Utc::now().to_rfc3339();
    // Atomic DELETE ... RETURNING to prevent TOCTOU race (same pattern as ws_tickets)
    let row: Option<(String, String)> = sqlx::query_as(
        "DELETE FROM oauth_codes WHERE code = ? AND expires_at > ? RETURNING access_token, refresh_token",
    )
    .bind(code)
    .bind(&now)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

async fn build_redirect_response(
    pool: &sqlx::SqlitePool,
    frontend_callback: &str,
    access_token: &str,
    refresh_token: &str,
) -> Response<Body> {
    // Generate a one-time code instead of passing the JWT directly in the URL
    let code = generate_random_hex(32);
    if let Err(e) = store_oauth_code(pool, &code, access_token, refresh_token).await {
        tracing::error!("Failed to store OAuth code: {e}");
        return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::empty())
            .expect("building OAuth error response should not fail");
    }

    let location = format!("{}?code={}", frontend_callback, code);
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .body(Body::empty())
        .expect("building OAuth redirect response should not fail")
}

fn extract_refresh_token_cookie(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get("Cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .find(|p| p.trim().starts_with("refresh_token="))
                .map(|p| p.trim()["refresh_token=".len()..].to_string())
        })
}

async fn upsert_user_and_create_session(
    pool: &sqlx::SqlitePool,
    jwt_secret: &str,
    provider: &str,
    provider_id: &str,
    email: Option<&str>,
    name: &str,
    avatar_url: Option<&str>,
) -> anyhow::Result<(String, String)> {
    let now = Utc::now().to_rfc3339();

    let user_id = {
        let existing = sqlx::query!(
            "SELECT id FROM users WHERE provider = ? AND provider_id = ?",
            provider,
            provider_id
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = existing {
            sqlx::query!(
                "UPDATE users SET name = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
                name,
                email,
                avatar_url,
                now,
                row.id
            )
            .execute(pool)
            .await?;
            row.id.unwrap_or_default()
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query!(
                "INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id,
                provider,
                provider_id,
                email,
                name,
                avatar_url,
                now,
                now
            )
            .execute(pool)
            .await?;

            id
        }
    };

    let refresh_token = generate_random_hex(32);
    let refresh_token_hash = hash_token(&refresh_token);
    let session_id = Uuid::new_v4().to_string();
    let expires_at = jwt::refresh_token_expiry().to_rfc3339();

    sqlx::query!(
        "INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)",
        session_id,
        user_id,
        refresh_token_hash,
        expires_at,
        now
    )
    .execute(pool)
    .await?;

    let access_token = jwt::encode_access_token(&user_id, &session_id, jwt_secret)?;
    Ok((access_token, refresh_token))
}

// ─── Google ───────────────────────────────────────────────────────────────────

pub async fn google_login(State(state): State<AppState>) -> Response<Body> {
    let oauth_state = generate_random_hex(16);
    if let Err(e) = store_oauth_state(&state.pool, &oauth_state).await {
        tracing::error!("Failed to store OAuth state: {e}");
        return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::empty())
            .expect("building Google OAuth error response should not fail");
    }

    let redirect_uri = format!("{}/api/auth/google/callback", state.config.app_url);
    tracing::info!("Google OAuth: redirect_uri={redirect_uri}");
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid+email+profile&state={}",
        urlencoding::encode(&state.config.google_client_id),
        urlencoding::encode(&redirect_uri),
        oauth_state
    );

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, url)
        .body(Body::empty())
        .expect("building Google OAuth redirect response should not fail")
}

fn build_error_redirect(frontend_url: &str, reason: &str) -> Response<Body> {
    let location = format!(
        "{}/auth/callback?error={}",
        frontend_url,
        urlencoding::encode(reason)
    );
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .body(Body::empty())
        .expect("building OAuth callback redirect response should not fail")
}

pub async fn google_callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackQuery>,
) -> Response<Body> {
    let frontend_url = state.config.frontend_url.clone();

    let state_valid = match verify_and_consume_state(&state.pool, &params.state).await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Failed to verify OAuth state: {e}");
            return build_error_redirect(&frontend_url, "server_error");
        }
    };
    if !state_valid {
        tracing::warn!("Invalid or expired OAuth state");
        return build_error_redirect(&frontend_url, "invalid_state");
    }

    let redirect_uri = format!("{}/api/auth/google/callback", state.config.app_url);

    let token_resp: GoogleTokenResponse = match state
        .config
        .http_client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", params.code.as_str()),
            ("client_id", state.config.google_client_id.as_str()),
            ("client_secret", state.config.google_client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(resp) => match resp.json().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to parse Google token response: {e}");
                return build_error_redirect(&frontend_url, "token_exchange_failed");
            }
        },
        Err(e) => {
            tracing::error!("Google token exchange failed: {e}");
            return build_error_redirect(&frontend_url, "token_exchange_failed");
        }
    };

    let user_info: GoogleUserInfo = match state
        .config
        .http_client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(&token_resp.access_token)
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(resp) => match resp.json().await {
            Ok(u) => u,
            Err(e) => {
                tracing::error!("Failed to parse Google user info: {e}");
                return build_error_redirect(&frontend_url, "userinfo_failed");
            }
        },
        Err(e) => {
            tracing::error!("Google userinfo request failed: {e}");
            return build_error_redirect(&frontend_url, "userinfo_failed");
        }
    };

    let (access_token, refresh_token) = match upsert_user_and_create_session(
        &state.pool,
        &state.config.jwt_secret,
        "google",
        &user_info.id,
        user_info.email.as_deref(),
        &user_info.name,
        user_info.picture.as_deref(),
    )
    .await
    {
        Ok(tokens) => tokens,
        Err(e) => {
            tracing::error!("Failed to create session: {e}");
            return build_error_redirect(&frontend_url, "session_error");
        }
    };

    let callback_url = format!("{}/auth/callback", state.config.frontend_url);
    build_redirect_response(&state.pool, &callback_url, &access_token, &refresh_token).await
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

pub async fn github_login(State(state): State<AppState>) -> Response<Body> {
    let oauth_state = generate_random_hex(16);
    if let Err(e) = store_oauth_state(&state.pool, &oauth_state).await {
        tracing::error!("Failed to store OAuth state: {e}");
        return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::empty())
            .expect("building GitHub OAuth error response should not fail");
    }

    let redirect_uri = format!("{}/api/auth/github/callback", state.config.app_url);
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user+user:email&state={}",
        urlencoding::encode(&state.config.github_client_id),
        urlencoding::encode(&redirect_uri),
        oauth_state
    );

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, url)
        .body(Body::empty())
        .expect("building GitHub OAuth redirect response should not fail")
}

pub async fn github_callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackQuery>,
) -> Response<Body> {
    let frontend_url = state.config.frontend_url.clone();

    let state_valid = match verify_and_consume_state(&state.pool, &params.state).await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Failed to verify OAuth state: {e}");
            return build_error_redirect(&frontend_url, "server_error");
        }
    };
    if !state_valid {
        tracing::warn!("Invalid or expired OAuth state");
        return build_error_redirect(&frontend_url, "invalid_state");
    }

    let redirect_uri = format!("{}/api/auth/github/callback", state.config.app_url);

    let token_resp: GithubTokenResponse = match state
        .config
        .http_client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("code", params.code.as_str()),
            ("client_id", state.config.github_client_id.as_str()),
            ("client_secret", state.config.github_client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(resp) => match resp.json().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to parse GitHub token response: {e}");
                return build_error_redirect(&frontend_url, "token_exchange_failed");
            }
        },
        Err(e) => {
            tracing::error!("GitHub token exchange failed: {e}");
            return build_error_redirect(&frontend_url, "token_exchange_failed");
        }
    };

    let user_info: GithubUserInfo = match state
        .config
        .http_client
        .get("https://api.github.com/user")
        .bearer_auth(&token_resp.access_token)
        .header("User-Agent", "Nilla")
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(resp) => match resp.json().await {
            Ok(u) => u,
            Err(e) => {
                tracing::error!("Failed to parse GitHub user info: {e}");
                return build_error_redirect(&frontend_url, "userinfo_failed");
            }
        },
        Err(e) => {
            tracing::error!("GitHub userinfo request failed: {e}");
            return build_error_redirect(&frontend_url, "userinfo_failed");
        }
    };

    // GitHubはメールが非公開の場合があるため別途取得
    let email = if user_info.email.is_some() {
        user_info.email.clone()
    } else {
        let emails: Vec<GithubEmail> = async {
            state
                .config
                .http_client
                .get("https://api.github.com/user/emails")
                .bearer_auth(&token_resp.access_token)
                .header("User-Agent", "Nilla")
                .send()
                .await?
                .json::<Vec<GithubEmail>>()
                .await
        }
        .await
        .unwrap_or_default();

        emails
            .into_iter()
            .find(|e| e.primary && e.verified)
            .map(|e| e.email)
    };

    let display_name = user_info.name.unwrap_or_else(|| user_info.login.clone());
    let provider_id = user_info.id.to_string();

    let (access_token, refresh_token) = match upsert_user_and_create_session(
        &state.pool,
        &state.config.jwt_secret,
        "github",
        &provider_id,
        email.as_deref(),
        &display_name,
        user_info.avatar_url.as_deref(),
    )
    .await
    {
        Ok(tokens) => tokens,
        Err(e) => {
            tracing::error!("Failed to create session: {e}");
            return build_error_redirect(&frontend_url, "session_error");
        }
    };

    let callback_url = format!("{}/auth/callback", state.config.frontend_url);
    build_redirect_response(&state.pool, &callback_url, &access_token, &refresh_token).await
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TokenExchangeQuery {
    code: String,
}

pub async fn exchange_token(
    State(state): State<AppState>,
    Query(params): Query<TokenExchangeQuery>,
) -> Result<Response<Body>, AppError> {
    let tokens = exchange_oauth_code(&state.pool, &params.code)
        .await
        .map_err(|e| AppError::Internal(e))?
        .ok_or(AppError::Unauthorized)?;

    let (access_token, refresh_token) = tokens;

    let secure_flag = if state.config.app_url.starts_with("https") {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "refresh_token={}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000{}",
        refresh_token, secure_flag
    );

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::SET_COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "access_token": access_token }))
                .map_err(|e| AppError::Internal(e.into()))?,
        ))
        .expect("building token exchange response should not fail"))
}

// ─── Me / Refresh / Logout ────────────────────────────────────────────────────

pub async fn get_me(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<UserId>,
) -> Result<Json<UserResponse>, AppError> {
    let user = sqlx::query!(
        "SELECT id, name, email, avatar_url, provider FROM users WHERE id = ?",
        user_id.0
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    Ok(Json(UserResponse {
        id: user.id.unwrap_or_default(),
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        provider: user.provider,
    }))
}

pub async fn refresh_token(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let token = extract_refresh_token_cookie(&headers).ok_or(AppError::Unauthorized)?;
    let hash = hash_token(&token);
    let now = Utc::now().to_rfc3339();

    let session: (String, String) = sqlx::query_as(
        "SELECT id, user_id FROM sessions WHERE refresh_token_hash = ? AND expires_at > ?",
    )
    .bind(hash)
    .bind(now)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let access_token = jwt::encode_access_token(&session.1, &session.0, &state.config.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;

    Ok(Json(serde_json::json!({ "access_token": access_token })))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response<Body> {
    if let Some(token) = extract_refresh_token_cookie(&headers) {
        let hash = hash_token(&token);
        let _ = sqlx::query!("DELETE FROM sessions WHERE refresh_token_hash = ?", hash)
            .execute(&state.pool)
            .await;
    }

    let clear_cookie = "refresh_token=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0";
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(header::SET_COOKIE, clear_cookie)
        .body(Body::empty())
        .expect("building logout response should not fail")
}
