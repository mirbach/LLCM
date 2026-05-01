use axum::{
    extract::{Multipart, State},
    Json,
};
use chrono::Utc;
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;

use shared::{CompanySettings, UpdateCompany};

use crate::{error::AppError, middleware::UserId, state::AppState};

// ── GET /api/company ──────────────────────────────────────────────────────────

pub async fn get_company(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<CompanySettings>, AppError> {
    // Upsert: ensure the row exists (new users might not have one yet).
    sqlx::query(
        "INSERT INTO company_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(user_id)
    .execute(&state.pool)
    .await?;

    let row = fetch_company(&state.pool, user_id).await?;
    Ok(Json(row))
}

// ── PUT /api/company ──────────────────────────────────────────────────────────

pub async fn update_company(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<UpdateCompany>,
) -> Result<Json<CompanySettings>, AppError> {
    sqlx::query(
        r#"UPDATE company_settings SET
            name            = COALESCE($2, name),
            address         = COALESCE($3, address),
            city            = COALESCE($4, city),
            state           = COALESCE($5, state),
            zip             = COALESCE($6, zip),
            country         = COALESCE($7, country),
            phone           = COALESCE($8, phone),
            email           = COALESCE($9, email),
            website         = COALESCE($10, website),
            tax_id          = COALESCE($11, tax_id),
            invoice_prefix  = COALESCE($12, invoice_prefix),
            footer_text     = COALESCE($13, footer_text),
            accent_color    = COALESCE($14, accent_color),
            updated_at      = $15
        WHERE user_id = $1"#,
    )
    .bind(user_id)
    .bind(&body.name)
    .bind(&body.address)
    .bind(&body.city)
    .bind(&body.state)
    .bind(&body.zip)
    .bind(&body.country)
    .bind(&body.phone)
    .bind(&body.email)
    .bind(&body.website)
    .bind(&body.tax_id)
    .bind(&body.invoice_prefix)
    .bind(&body.footer_text)
    .bind(&body.accent_color)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    Ok(Json(fetch_company(&state.pool, user_id).await?))
}

// ── POST /api/company/logo ────────────────────────────────────────────────────

pub async fn upload_logo(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_upload_dir = PathBuf::from(&state.config.upload_dir).join(user_id.to_string());
    fs::create_dir_all(&user_upload_dir).await?;

    while let Some(field) = multipart.next_field().await? {
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        if !content_type.starts_with("image/") {
            return Err(AppError::BadRequest("Only image files are accepted".into()));
        }

        let ext = match content_type.as_str() {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            _ => "bin",
        };

        let file_name = format!("logo.{ext}");
        let file_path = user_upload_dir.join(&file_name);
        let data = field.bytes().await?;
        fs::write(&file_path, &data).await?;

        let logo_url = format!("/uploads/{user_id}/{file_name}");
        sqlx::query(
            "UPDATE company_settings SET logo_path = $2, updated_at = $3 WHERE user_id = $1",
        )
        .bind(user_id)
        .bind(&logo_url)
        .bind(Utc::now())
        .execute(&state.pool)
        .await?;

        return Ok(Json(serde_json::json!({ "logo_path": logo_url })));
    }

    Err(AppError::BadRequest("No file uploaded".into()))
}

// ── DELETE /api/company/logo ──────────────────────────────────────────────────

pub async fn delete_logo(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<serde_json::Value>, AppError> {
    let row: Option<String> = sqlx::query_scalar(
        "SELECT logo_path FROM company_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .flatten();

    if let Some(logo_path) = row {
        // logo_path is like /uploads/{user_id}/logo.png
        let fs_path = PathBuf::from(&state.config.upload_dir)
            .join(logo_path.trim_start_matches("/uploads/"));
        let _ = fs::remove_file(fs_path).await; // ignore if already gone
    }

    sqlx::query(
        "UPDATE company_settings SET logo_path = NULL, updated_at = $2 WHERE user_id = $1",
    )
    .bind(user_id)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Helper ────────────────────────────────────────────────────────────────────

pub async fn fetch_company(pool: &sqlx::PgPool, user_id: Uuid) -> Result<CompanySettings, AppError> {
    let r = sqlx::query_as::<_, crate::db_types::DbCompany>(
        "SELECT id, user_id, name, address, city, state, zip, country,
                  phone, email, website, logo_path, tax_id, invoice_prefix,
                  next_invoice_number, next_customer_number, footer_text,
                  accent_color, wise_api_key, wise_profile_id, created_at, updated_at
           FROM company_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|_| AppError::NotFound("Company settings not found".into()))?;

    let mut company: CompanySettings = r.into();
    company.wise_api_key = company.wise_api_key.as_deref().map(mask_key);
    Ok(company)
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        return "***".into();
    }
    format!("{}...{}", &key[..4], &key[key.len() - 4..])
}
