use anyhow::{anyhow, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use shared::TokenClaims;
use uuid::Uuid;

/// Hash a plaintext password with argon2id.
pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow!("Failed to hash password: {e}"))
}

/// Verify a plaintext password against a stored argon2 hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(hash).map_err(|e| anyhow!("Invalid hash: {e}"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// Create a short-lived access token (JWT).
pub fn create_access_token(user_id: Uuid, secret: &str, expiry_secs: i64) -> Result<String> {
    create_token(user_id, secret, expiry_secs, "access")
}

/// Create a long-lived refresh token (JWT).
pub fn create_refresh_token(user_id: Uuid, secret: &str, expiry_secs: i64) -> Result<String> {
    create_token(user_id, secret, expiry_secs, "refresh")
}

fn create_token(user_id: Uuid, secret: &str, expiry_secs: i64, kind: &str) -> Result<String> {
    let now = Utc::now().timestamp();
    let claims = TokenClaims {
        sub: user_id,
        iat: now,
        exp: now + expiry_secs,
        kind: kind.to_string(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow!("Failed to encode token: {e}"))
}

/// Decode and validate a JWT, returning its claims.
pub fn decode_token(token: &str, secret: &str) -> Result<TokenClaims> {
    let data = decode::<TokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| anyhow!("Invalid token: {e}"))?;
    Ok(data.claims)
}
