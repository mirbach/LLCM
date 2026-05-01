use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use shared::{AuthResponse, LoginRequest, RegisterRequest, User};

use crate::{
    auth::{create_access_token, create_refresh_token, hash_password, verify_password},
    error::AppError,
    middleware::UserId,
    state::AppState,
};

// ── POST /api/auth/register ───────────────────────────────────────────────────

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    body.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let email = body.email.to_lowercase().trim().to_string();

    // Check if the email is already taken.
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)",
    )
    .bind(&email)
    .fetch_one(&state.pool)
    .await?;

    if exists {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let password_hash = hash_password(&body.password)?;
    let user_id = Uuid::new_v4();
    let now = Utc::now();

    // Create the user and seed an empty company_settings row atomically.
    let mut tx = state.pool.begin().await?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(user_id)
    .bind(&email)
    .bind(&password_hash)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO company_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let user = User { id: user_id, email, created_at: now };
    let tokens = issue_tokens(&state, user_id)?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            access_token: tokens.0,
            token_type: "Bearer".into(),
            user,
        }),
    ))
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    body.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let email = body.email.to_lowercase().trim().to_string();

    let row = sqlx::query_as::<_, crate::db_types::DbUser>(
        "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let valid = verify_password(&body.password, &row.password_hash)?;
    if !valid {
        return Err(AppError::Unauthorized);
    }

    let user = User {
        id: row.id,
        email: row.email,
        created_at: row.created_at,
    };
    let tokens = issue_tokens(&state, user.id)?;

    Ok(Json(AuthResponse {
        access_token: tokens.0,
        token_type: "Bearer".into(),
        user,
    }))
}

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

pub async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<shared::RefreshRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let claims = crate::auth::decode_token(&body.refresh_token, &state.config.refresh_secret)
        .map_err(|_| AppError::Unauthorized)?;

    if claims.kind != "refresh" {
        return Err(AppError::Unauthorized);
    }

    let access_token = create_access_token(
        claims.sub,
        &state.config.jwt_secret,
        state.config.jwt_expiry_secs,
    )?;

    Ok(Json(json!({ "access_token": access_token, "token_type": "Bearer" })))
}

// ── GET /api/me ───────────────────────────────────────────────────────────────

pub async fn me(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<User>, AppError> {
    let row = sqlx::query_as::<_, crate::db_types::DbUser>(
        "SELECT id, email, password_hash, created_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(User {
        id: row.id,
        email: row.email,
        created_at: row.created_at,
    }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Issue both an access token and a refresh token for the given user.
fn issue_tokens(state: &AppState, user_id: Uuid) -> Result<(String, String), AppError> {
    let access = create_access_token(
        user_id,
        &state.config.jwt_secret,
        state.config.jwt_expiry_secs,
    )?;
    let refresh = create_refresh_token(
        user_id,
        &state.config.refresh_secret,
        state.config.refresh_expiry_secs,
    )?;
    Ok((access, refresh))
}
