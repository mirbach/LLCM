use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;

use shared::{CreateTextBlock, TextBlock, UpdateTextBlock};

use crate::{error::AppError, middleware::UserId, state::AppState};

// ── GET /api/text-blocks ──────────────────────────────────────────────────────

pub async fn list_text_blocks(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<TextBlock>>, AppError> {
    let rows = sqlx::query_as::<_, crate::db_types::DbTextBlock>(
        "SELECT id, user_id, title, content, content_de, is_default, created_at, updated_at
           FROM text_blocks WHERE user_id = $1 ORDER BY is_default DESC, title",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(|r| r.into()).collect()))
}

// ── POST /api/text-blocks ─────────────────────────────────────────────────────

pub async fn create_text_block(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<CreateTextBlock>,
) -> Result<(StatusCode, Json<TextBlock>), AppError> {
    body.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"INSERT INTO text_blocks (id, user_id, title, content, content_de, is_default, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.title)
    .bind(&body.content)
    .bind(&body.content_de)
    .bind(body.is_default)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(TextBlock {
        id,
        user_id,
        title: body.title,
        content: body.content,
        content_de: body.content_de,
        is_default: body.is_default,
        created_at: now,
        updated_at: now,
    })))
}

// ── PUT /api/text-blocks/:id ──────────────────────────────────────────────────

pub async fn update_text_block(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTextBlock>,
) -> Result<Json<TextBlock>, AppError> {
    sqlx::query(
        r#"UPDATE text_blocks SET
            title      = COALESCE($3, title),
            content    = COALESCE($4, content),
            content_de = COALESCE($5, content_de),
            is_default = COALESCE($6, is_default),
            updated_at = $7
           WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.title)
    .bind(&body.content)
    .bind(&body.content_de)
    .bind(body.is_default)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    let r = sqlx::query_as::<_, crate::db_types::DbTextBlock>(
        "SELECT id, user_id, title, content, content_de, is_default, created_at, updated_at FROM text_blocks WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Text block not found".into()))?;

    Ok(Json(r.into()))
}

// ── PATCH /api/text-blocks/:id/default ────────────────────────────────────────

pub async fn set_default_text_block(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Toggle the is_default flag on this block.
    let current: bool = sqlx::query_scalar(
        "SELECT is_default FROM text_blocks WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Text block not found".into()))?;

    sqlx::query(
        "UPDATE text_blocks SET is_default = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(!current)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "is_default": !current })))
}

// ── DELETE /api/text-blocks/:id ───────────────────────────────────────────────

pub async fn delete_text_block(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result =
        sqlx::query("DELETE FROM text_blocks WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&state.pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Text block not found".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}
