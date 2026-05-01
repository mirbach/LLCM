use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;
use validator::Validate;

use shared::{
    BankAccount, CreateBankAccount, FlagWithdrawal, UpdateBankAccount, WiseConfig,
    WiseTransaction,
};

use crate::{error::AppError, middleware::UserId, state::AppState};

// ── GET /api/bank-accounts ────────────────────────────────────────────────────

pub async fn list_bank_accounts(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<BankAccount>>, AppError> {
    let rows = sqlx::query_as::<_, crate::db_types::DbBankAccount>(
        "SELECT id, user_id, account_name, bank_name, bank_address, iban,
                  account_number, sort_code, routing_number, bic_swift, currency,
                  show_on_invoice, created_at, updated_at
           FROM bank_accounts WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(|r| r.into()).collect()))
}

// ── POST /api/bank-accounts ───────────────────────────────────────────────────

pub async fn create_bank_account(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<CreateBankAccount>,
) -> Result<(StatusCode, Json<BankAccount>), AppError> {
    body.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"INSERT INTO bank_accounts
           (id, user_id, account_name, bank_name, bank_address, iban, account_number,
            sort_code, routing_number, bic_swift, currency, show_on_invoice, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.account_name)
    .bind(&body.bank_name)
    .bind(&body.bank_address)
    .bind(&body.iban)
    .bind(&body.account_number)
    .bind(&body.sort_code)
    .bind(&body.routing_number)
    .bind(&body.bic_swift)
    .bind(&body.currency)
    .bind(body.show_on_invoice)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    let account = BankAccount {
        id,
        user_id,
        account_name: body.account_name,
        bank_name: body.bank_name,
        bank_address: body.bank_address,
        iban: body.iban,
        account_number: body.account_number,
        sort_code: body.sort_code,
        routing_number: body.routing_number,
        bic_swift: body.bic_swift,
        currency: body.currency,
        show_on_invoice: body.show_on_invoice,
        created_at: now,
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(account)))
}

// ── PUT /api/bank-accounts/:id ────────────────────────────────────────────────

pub async fn update_bank_account(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBankAccount>,
) -> Result<Json<BankAccount>, AppError> {
    sqlx::query(
        r#"UPDATE bank_accounts SET
            account_name   = COALESCE($3, account_name),
            bank_name      = COALESCE($4, bank_name),
            bank_address   = COALESCE($5, bank_address),
            iban           = COALESCE($6, iban),
            account_number = COALESCE($7, account_number),
            sort_code      = COALESCE($8, sort_code),
            routing_number = COALESCE($9, routing_number),
            bic_swift      = COALESCE($10, bic_swift),
            currency       = COALESCE($11, currency),
            show_on_invoice = COALESCE($12, show_on_invoice),
            updated_at     = $13
           WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.account_name)
    .bind(&body.bank_name)
    .bind(&body.bank_address)
    .bind(&body.iban)
    .bind(&body.account_number)
    .bind(&body.sort_code)
    .bind(&body.routing_number)
    .bind(&body.bic_swift)
    .bind(&body.currency)
    .bind(body.show_on_invoice)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    let row = sqlx::query_as::<_, crate::db_types::DbBankAccount>(
        "SELECT id, user_id, account_name, bank_name, bank_address, iban,
                  account_number, sort_code, routing_number, bic_swift, currency,
                  show_on_invoice, created_at, updated_at
           FROM bank_accounts WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Bank account not found".into()))?;

    Ok(Json(row.into()))
}

// ── DELETE /api/bank-accounts/:id ─────────────────────────────────────────────

pub async fn delete_bank_account(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result =
        sqlx::query("DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&state.pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Bank account not found".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── GET /api/bank-accounts/wise/config ───────────────────────────────────────

pub async fn get_wise_config(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, crate::db_types::DbWiseConfig>(
        "SELECT wise_api_key, wise_profile_id FROM company_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?;

    let (key, profile) = row
        .map(|r| (r.wise_api_key, r.wise_profile_id))
        .unwrap_or((None, None));

    Ok(Json(serde_json::json!({
        "api_key": key.map(|k| mask_key(&k)),
        "profile_id": profile
    })))
}

// ── PUT /api/bank-accounts/wise/config ───────────────────────────────────────

pub async fn save_wise_config(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<WiseConfig>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        r#"UPDATE company_settings SET wise_api_key = $2, wise_profile_id = $3, updated_at = NOW()
           WHERE user_id = $1"#,
    )
    .bind(user_id)
    .bind(&body.api_key)
    .bind(&body.profile_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── POST /api/bank-accounts/wise/test ────────────────────────────────────────

pub async fn test_wise(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, crate::db_types::DbWiseConfig>(
        "SELECT wise_api_key, wise_profile_id FROM company_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Wise not configured".into()))?;

    let api_key = row
        .wise_api_key
        .ok_or_else(|| AppError::BadRequest("Wise API key not set".into()))?;

    let resp = reqwest::Client::new()
        .get("https://api.transferwise.com/v1/profiles")
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if resp.status().is_success() {
        Ok(Json(serde_json::json!({ "ok": true })))
    } else {
        Err(AppError::BadRequest(format!(
            "Wise API returned {}",
            resp.status()
        )))
    }
}

// ── GET /api/bank-accounts/wise/transactions (live fetch + cache) ─────────────

#[derive(Debug, Deserialize)]
pub struct TransactionQuery {
    pub currency: Option<String>,
    pub limit: Option<i64>,
}

pub async fn get_wise_transactions(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(q): Query<TransactionQuery>,
) -> Result<Json<Vec<WiseTransaction>>, AppError> {
    let row = sqlx::query_as::<_, crate::db_types::DbWiseConfig>(
        "SELECT wise_api_key, wise_profile_id FROM company_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Wise not configured".into()))?;

    let api_key = row
        .wise_api_key
        .ok_or_else(|| AppError::BadRequest("Wise API key not set".into()))?;
    let profile_id = row
        .wise_profile_id
        .ok_or_else(|| AppError::BadRequest("Wise profile ID not set".into()))?;

    let currency = q.currency.as_deref().unwrap_or("USD");
    let url = format!(
        "https://api.transferwise.com/v1/profiles/{profile_id}/border-accounts/statements?currency={currency}&intervalStart=2020-01-01T00:00:00.000Z&intervalEnd={}&type=COMPACT",
        Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ")
    );

    let resp: serde_json::Value = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    // Cache transactions in our DB.
    let mut saved = Vec::new();
    if let Some(transactions) = resp["transactions"].as_array() {
        for txn in transactions {
            let wise_id = txn["referenceNumber"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            if wise_id.is_empty() {
                continue;
            }

            let amount_value: f64 = txn["amount"]["value"].as_f64().unwrap_or(0.0);
            let amount_currency = txn["amount"]["currency"]
                .as_str()
                .unwrap_or(currency)
                .to_string();
            let date_str = txn["date"].as_str().unwrap_or("").to_string();
            let date = chrono::DateTime::parse_from_rfc3339(&date_str)
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            sqlx::query(
                r#"INSERT INTO wise_transactions
                   (wise_id, user_id, date, transaction_type, amount_value, amount_currency,
                    description, sender_name, reference_number, fetched_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
                   ON CONFLICT (wise_id) DO NOTHING"#,
            )
            .bind(&wise_id)
            .bind(user_id)
            .bind(date)
            .bind(txn["type"].as_str().unwrap_or(""))
            .bind(amount_value)
            .bind(&amount_currency)
            .bind(txn["details"]["description"].as_str().unwrap_or(""))
            .bind(txn["details"]["senderName"].as_str().unwrap_or(""))
            .bind(&wise_id)
            .execute(&state.pool)
            .await
            .ok();

            saved.push(WiseTransaction {
                wise_id,
                user_id,
                date,
                transaction_type: txn["type"].as_str().unwrap_or("").to_string(),
                amount_value,
                amount_currency,
                description: txn["details"]["description"].as_str().unwrap_or("").to_string(),
                sender_name: txn["details"]["senderName"].as_str().unwrap_or("").to_string(),
                reference_number: txn["referenceNumber"].as_str().unwrap_or("").to_string(),
                matched_invoice_id: None,
                is_owners_withdrawal: false,
                fetched_at: Utc::now(),
            });
        }
    }

    Ok(Json(saved))
}

// ── GET /api/bank-accounts/wise/transactions/saved ───────────────────────────

pub async fn get_saved_transactions(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<WiseTransaction>>, AppError> {
    let rows = sqlx::query_as::<_, crate::db_types::DbWiseTransaction>(
        "SELECT wise_id, user_id, date, transaction_type,
                  amount_value::FLOAT8 AS amount_value, amount_currency, description,
                  sender_name, reference_number, matched_invoice_id,
                  is_owners_withdrawal, fetched_at
           FROM wise_transactions
           WHERE user_id = $1
           ORDER BY date DESC",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let txns: Vec<WiseTransaction> = rows.into_iter().map(|r| r.into()).collect();

    Ok(Json(txns))
}

// ── PATCH /api/bank-accounts/wise/transactions/:wise_id/withdrawal ────────────

pub async fn flag_withdrawal(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(wise_id): Path<String>,
    Json(body): Json<FlagWithdrawal>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        "UPDATE wise_transactions SET is_owners_withdrawal = $3 WHERE wise_id = $1 AND user_id = $2",
    )
    .bind(&wise_id)
    .bind(user_id)
    .bind(body.is_owners_withdrawal)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        return "***".into();
    }
    format!("{}...{}", &key[..4], &key[key.len() - 4..])
}
