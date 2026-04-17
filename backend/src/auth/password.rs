use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode},
    response::Response,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{auth::jwt, error::AppError, AppState};

use super::oauth::{hash_token, generate_random_hex};

// ─── Request / Response types ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SignupRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub user: AuthUser,
}

#[derive(Serialize)]
pub struct AuthUser {
    pub id: String,
    pub name: String,
    pub email: String,
}

// ─── Password hashing ────────────────────────────────────────────────────────

fn hash_password(password: &str) -> Result<String, AppError> {
    use argon2::{
        password_hash::{rand_core::OsRng, SaltString},
        Argon2, PasswordHasher,
    };
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {e}")))
}

fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    use argon2::{
        password_hash::PasswordHash, Argon2, PasswordVerifier,
    };
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async fn create_session_and_tokens(
    pool: &sqlx::SqlitePool,
    jwt_secret: &str,
    user_id: &str,
) -> Result<(String, String), AppError> {
    let refresh_token = generate_random_hex(32);
    let refresh_token_hash = hash_token(&refresh_token);
    let session_id = Uuid::new_v4().to_string();
    let expires_at = jwt::refresh_token_expiry().to_rfc3339();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(&refresh_token_hash)
    .bind(&expires_at)
    .bind(&now)
    .execute(pool)
    .await?;

    let access_token = jwt::encode_access_token(user_id, &session_id, jwt_secret)
        .map_err(|e| AppError::Internal(e))?;

    Ok((access_token, refresh_token))
}

fn build_auth_response(
    access_token: &str,
    refresh_token: &str,
    user_id: &str,
    name: &str,
    email: &str,
    app_url: &str,
) -> Result<Response<Body>, AppError> {
    let secure_flag = if app_url.starts_with("https") {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "refresh_token={}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000{}",
        refresh_token, secure_flag
    );

    let body = serde_json::to_string(&AuthResponse {
        access_token: access_token.to_string(),
        user: AuthUser {
            id: user_id.to_string(),
            name: name.to_string(),
            email: email.to_string(),
        },
    })
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::SET_COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .expect("building auth response should not fail"))
}

// ─── Signup ──────────────────────────────────────────────────────────────────

pub async fn signup(
    State(state): State<AppState>,
    Json(body): Json<SignupRequest>,
) -> Result<Response<Body>, AppError> {
    let email = body.email.trim().to_lowercase();
    let name = body.name.trim().to_string();

    if email.is_empty() {
        return Err(AppError::BadRequest("email is required".to_string()));
    }
    if name.is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".to_string(),
        ));
    }
    if body.password.len() > 128 {
        return Err(AppError::BadRequest(
            "password must be 128 characters or fewer".to_string(),
        ));
    }

    // Check if email already exists
    let existing: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = ? AND provider = 'email')",
    )
    .bind(&email)
    .fetch_one(&state.pool)
    .await?;

    if existing {
        return Err(AppError::BadRequest(
            "An account with this email already exists".to_string(),
        ));
    }

    let password_hash = hash_password(&body.password)?;
    let user_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, password_hash, created_at, updated_at) VALUES (?, 'email', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(&user_id) // provider_id = user_id for email provider
    .bind(&email)
    .bind(&name)
    .bind(&password_hash)
    .bind(&now)
    .bind(&now)
    .execute(&state.pool)
    .await?;

    let (access_token, refresh_token) =
        create_session_and_tokens(&state.pool, &state.config.jwt_secret, &user_id).await?;

    build_auth_response(
        &access_token,
        &refresh_token,
        &user_id,
        &name,
        &email,
        &state.config.app_url,
    )
}

// ─── Login ───────────────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Response<Body>, AppError> {
    let email = body.email.trim().to_lowercase();

    if email.is_empty() {
        return Err(AppError::BadRequest("email is required".to_string()));
    }
    if body.password.is_empty() {
        return Err(AppError::BadRequest("password is required".to_string()));
    }

    let user: Option<(String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT id, name, password_hash, email FROM users WHERE email = ? AND provider = 'email'",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    let (user_id, name, password_hash, user_email) = user.ok_or(AppError::Unauthorized)?;
    let password_hash = password_hash.ok_or(AppError::Unauthorized)?;

    if !verify_password(&body.password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let (access_token, refresh_token) =
        create_session_and_tokens(&state.pool, &state.config.jwt_secret, &user_id).await?;

    build_auth_response(
        &access_token,
        &refresh_token,
        &user_id,
        &name,
        &user_email,
        &state.config.app_url,
    )
}
