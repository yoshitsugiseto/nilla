use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

const ACCESS_TOKEN_EXPIRY_SECS: i64 = 300; // 5 minutes
const REFRESH_TOKEN_EXPIRY_DAYS: i64 = 30;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user_id
    pub exp: usize,
}

pub fn encode_access_token(user_id: &str, secret: &str) -> anyhow::Result<String> {
    let exp = (Utc::now().timestamp() + ACCESS_TOKEN_EXPIRY_SECS) as usize;
    let claims = Claims { sub: user_id.to_string(), exp };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?)
}

pub fn decode_access_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

pub fn refresh_token_expiry() -> chrono::DateTime<Utc> {
    Utc::now() + chrono::Duration::days(REFRESH_TOKEN_EXPIRY_DAYS)
}
