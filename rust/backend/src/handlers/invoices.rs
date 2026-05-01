use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use shared::{
    CreateInvoice, Invoice, InvoiceItem, InvoiceStatus, PdfFromHtml,
    SendInvoiceRequest, TextBlock, UpdateInvoice, UpdateInvoiceStatus,
};

use crate::{
    error::AppError,
    handlers::{company::fetch_company, customers::get_customer},
    invoice_html::render_invoice_html,
    middleware::UserId,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct InvoiceFilter {
    pub status: Option<String>,
}

// ── GET /api/invoices ─────────────────────────────────────────────────────────

pub async fn list_invoices(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(filter): Query<InvoiceFilter>,
) -> Result<Json<Vec<Invoice>>, AppError> {
    let rows: Vec<crate::db_types::DbInvoice> = match filter.status.as_deref() {
        Some(s) => {
            s.parse::<InvoiceStatus>().map_err(|e| AppError::BadRequest(e))?;
            sqlx::query_as::<_, crate::db_types::DbInvoice>(
                "SELECT id, user_id, invoice_number, customer_id,
                          status::TEXT AS status, issue_date, due_date, currency,
                          subtotal::FLOAT8 AS subtotal, tax_rate::FLOAT8 AS tax_rate,
                          tax_amount::FLOAT8 AS tax_amount, total::FLOAT8 AS total,
                          notes, footer_text, created_at, updated_at
                   FROM invoices WHERE user_id = $1 AND status::TEXT = $2
                   ORDER BY created_at DESC",
            )
            .bind(user_id)
            .bind(s)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, crate::db_types::DbInvoice>(
                "SELECT id, user_id, invoice_number, customer_id,
                          status::TEXT AS status, issue_date, due_date, currency,
                          subtotal::FLOAT8 AS subtotal, tax_rate::FLOAT8 AS tax_rate,
                          tax_amount::FLOAT8 AS tax_amount, total::FLOAT8 AS total,
                          notes, footer_text, created_at, updated_at
                   FROM invoices WHERE user_id = $1
                   ORDER BY created_at DESC",
            )
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?
        }
    };

    let invoices = rows
        .into_iter()
        .map(|r| Invoice {
            id: r.id,
            user_id: r.user_id,
            invoice_number: r.invoice_number,
            customer_id: r.customer_id,
            status: r.status.parse().unwrap_or_default(),
            issue_date: r.issue_date,
            due_date: r.due_date,
            currency: r.currency,
            subtotal: r.subtotal,
            tax_rate: r.tax_rate,
            tax_amount: r.tax_amount,
            total: r.total,
            notes: r.notes,
            footer_text: r.footer_text,
            created_at: r.created_at,
            updated_at: r.updated_at,
            items: vec![],
            text_block_ids: vec![],
        })
        .collect();

    Ok(Json(invoices))
}

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────

pub async fn get_invoice(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<Json<Invoice>, AppError> {
    Ok(Json(fetch_invoice_full(&state, user_id, id).await?))
}

// ── POST /api/invoices ────────────────────────────────────────────────────────

pub async fn create_invoice(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<CreateInvoice>,
) -> Result<(StatusCode, Json<Invoice>), AppError> {
    let mut tx = state.pool.begin().await?;

    // Atomically get and increment the next invoice number.
    let (prefix, num): (String, i32) = sqlx::query_as(
        r#"UPDATE company_settings
           SET next_invoice_number = next_invoice_number + 1, updated_at = NOW()
           WHERE user_id = $1
           RETURNING invoice_prefix, next_invoice_number - 1"#,
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    let invoice_number = format!("{}{:04}", prefix, num);

    // Calculate totals.
    let subtotal: f64 = body.items.iter().map(|i| i.amount).sum();
    let tax_amount = subtotal * (body.tax_rate / 100.0);
    let total = subtotal + tax_amount;

    let id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"INSERT INTO invoices
           (id, user_id, invoice_number, customer_id, status, issue_date, due_date,
            currency, subtotal, tax_rate, tax_amount, total, notes, footer_text,
            created_at, updated_at)
           VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&invoice_number)
    .bind(body.customer_id)
    .bind(body.issue_date)
    .bind(body.due_date)
    .bind(&body.currency)
    .bind(subtotal)
    .bind(body.tax_rate)
    .bind(tax_amount)
    .bind(total)
    .bind(&body.notes)
    .bind(&body.footer_text)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // Insert line items.
    for item in &body.items {
        sqlx::query(
            r#"INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
               VALUES ($1,$2,$3,$4,$5,$6)"#,
        )
        .bind(Uuid::new_v4())
        .bind(id)
        .bind(&item.description)
        .bind(item.quantity)
        .bind(item.unit_price)
        .bind(item.amount)
        .execute(&mut *tx)
        .await?;
    }

    // Link text blocks.
    for (order, tb_id) in body.text_block_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO invoice_text_blocks (invoice_id, text_block_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(tb_id)
        .bind(order as i32)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let invoice = fetch_invoice_full(&state, user_id, id).await?;
    Ok((StatusCode::CREATED, Json(invoice)))
}

// ── PUT /api/invoices/:id ─────────────────────────────────────────────────────

pub async fn update_invoice(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateInvoice>,
) -> Result<Json<Invoice>, AppError> {
    let mut tx = state.pool.begin().await?;

    // Recompute totals if items are provided.
    let (subtotal, tax_amount, total) = if let Some(ref items) = body.items {
        let sub: f64 = items.iter().map(|i| i.amount).sum();
        let rate = body.tax_rate.unwrap_or(0.0);
        let tax = sub * (rate / 100.0);
        (Some(sub), Some(tax), Some(sub + tax))
    } else {
        (None, None, None)
    };

    sqlx::query(
        r#"UPDATE invoices SET
            customer_id = CASE WHEN $3::boolean THEN $4::uuid ELSE customer_id END,
            issue_date  = COALESCE($5, issue_date),
            due_date    = COALESCE($6, due_date),
            currency    = COALESCE($7, currency),
            tax_rate    = COALESCE($8, tax_rate),
            subtotal    = COALESCE($9, subtotal),
            tax_amount  = COALESCE($10, tax_amount),
            total       = COALESCE($11, total),
            notes       = COALESCE($12, notes),
            footer_text = COALESCE($13, footer_text),
            updated_at  = NOW()
           WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(body.customer_id.is_some()) // $3 - whether to update customer_id
    .bind(body.customer_id.flatten()) // $4 - new value (may be NULL)
    .bind(body.issue_date)
    .bind(body.due_date)
    .bind(&body.currency)
    .bind(body.tax_rate)
    .bind(subtotal)
    .bind(tax_amount)
    .bind(total)
    .bind(&body.notes)
    .bind(&body.footer_text)
    .execute(&mut *tx)
    .await?;

    // Replace items if provided.
    if let Some(items) = &body.items {
        sqlx::query("DELETE FROM invoice_items WHERE invoice_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for item in items {
            sqlx::query(
                "INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount) VALUES ($1,$2,$3,$4,$5,$6)",
            )
            .bind(Uuid::new_v4())
            .bind(id)
            .bind(&item.description)
            .bind(item.quantity)
            .bind(item.unit_price)
            .bind(item.amount)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Replace text block links if provided.
    if let Some(tb_ids) = &body.text_block_ids {
        sqlx::query("DELETE FROM invoice_text_blocks WHERE invoice_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for (order, tb_id) in tb_ids.iter().enumerate() {
            sqlx::query(
                "INSERT INTO invoice_text_blocks (invoice_id, text_block_id, sort_order) VALUES ($1,$2,$3)",
            )
            .bind(id)
            .bind(tb_id)
            .bind(order as i32)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(fetch_invoice_full(&state, user_id, id).await?))
}

// ── PATCH /api/invoices/:id/status ───────────────────────────────────────────

pub async fn update_invoice_status(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateInvoiceStatus>,
) -> Result<Json<Invoice>, AppError> {
    body.status
        .parse::<InvoiceStatus>()
        .map_err(|e| AppError::BadRequest(e))?;

    sqlx::query(
        "UPDATE invoices SET status = $3::invoice_status, updated_at = NOW() WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.status)
    .execute(&state.pool)
    .await?;

    Ok(Json(fetch_invoice_full(&state, user_id, id).await?))
}

// ── DELETE /api/invoices/:id ──────────────────────────────────────────────────

pub async fn delete_invoice(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result =
        sqlx::query("DELETE FROM invoices WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&state.pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Invoice not found".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── GET /api/invoices/:id/pdf ─────────────────────────────────────────────────

pub async fn download_pdf(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    let invoice = fetch_invoice_full(&state, user_id, id).await?;
    let company = fetch_company(&state.pool, user_id).await?;

    // Fetch the customer if linked.
    let customer = if let Some(cid) = invoice.customer_id {
        get_customer(
            State(state.clone()),
            UserId(user_id),
            Path(cid),
        )
        .await
        .ok()
        .map(|j| j.0)
    } else {
        None
    };

    // Fetch bank accounts that should appear on the invoice.
    let bank_accounts: Vec<shared::BankAccount> = sqlx::query_as::<_, crate::db_types::DbBankAccount>(
        "SELECT id, user_id, account_name, bank_name, bank_address, iban,
                  account_number, sort_code, routing_number, bic_swift, currency,
                  show_on_invoice, created_at, updated_at
           FROM bank_accounts WHERE user_id = $1 AND show_on_invoice = TRUE ORDER BY created_at",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| r.into())
    .collect();

    // Fetch the text blocks linked to this invoice.
    let text_blocks = fetch_invoice_text_blocks(&state.pool, id).await?;

    let html = render_invoice_html(&invoice, customer.as_ref(), &company, &bank_accounts, &text_blocks);
    let pdf_bytes = crate::pdf::html_to_pdf(&state.browser, html).await?;

    let filename = format!("{}.pdf", invoice.invoice_number);
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .body(axum::body::Body::from(pdf_bytes))
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(response)
}

// ── POST /api/invoices/:id/pdf-from-html ──────────────────────────────────────

pub async fn pdf_from_html(
    State(state): State<AppState>,
    UserId(_user_id): UserId,
    Json(body): Json<PdfFromHtml>,
) -> Result<Response, AppError> {
    let pdf_bytes = crate::pdf::html_to_pdf(&state.browser, body.html).await?;

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"invoice.pdf\"",
        )
        .body(axum::body::Body::from(pdf_bytes))
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(response)
}

// ── POST /api/invoices/:id/send ───────────────────────────────────────────────

pub async fn send_invoice(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<SendInvoiceRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let invoice = fetch_invoice_full(&state, user_id, id).await?;
    let company = fetch_company(&state.pool, user_id).await?;

    let customer = if let Some(cid) = invoice.customer_id {
        get_customer(State(state.clone()), UserId(user_id), Path(cid))
            .await
            .ok()
            .map(|j| j.0)
    } else {
        None
    };

    let bank_accounts: Vec<shared::BankAccount> = sqlx::query_as::<_, crate::db_types::DbBankAccount>(
        "SELECT id, user_id, account_name, bank_name, bank_address, iban,
                  account_number, sort_code, routing_number, bic_swift, currency,
                  show_on_invoice, created_at, updated_at
           FROM bank_accounts WHERE user_id = $1 AND show_on_invoice = TRUE ORDER BY created_at",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| r.into())
    .collect();

    let text_blocks = fetch_invoice_text_blocks(&state.pool, id).await?;
    let html = render_invoice_html(&invoice, customer.as_ref(), &company, &bank_accounts, &text_blocks);
    let pdf_bytes = crate::pdf::html_to_pdf(&state.browser, html).await?;

    let subject = body
        .subject
        .unwrap_or_else(|| format!("Invoice {} from {}", invoice.invoice_number, company.name));
    let email_body = body
        .body
        .unwrap_or_else(|| format!("Please find attached invoice {}.", invoice.invoice_number));
    let filename = format!("{}.pdf", invoice.invoice_number);

    crate::email::send_invoice_email(
        &state.config,
        &body.to,
        &subject,
        &email_body,
        Some(pdf_bytes),
        &filename,
    )
    .await?;

    // Mark as sent.
    sqlx::query("UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

pub async fn fetch_invoice_full(
    state: &AppState,
    user_id: Uuid,
    id: Uuid,
) -> Result<Invoice, AppError> {
    let r = sqlx::query_as::<_, crate::db_types::DbInvoice>(
        "SELECT id, user_id, invoice_number, customer_id,
                  status::TEXT AS status, issue_date, due_date, currency,
                  subtotal::FLOAT8 AS subtotal, tax_rate::FLOAT8 AS tax_rate,
                  tax_amount::FLOAT8 AS tax_amount, total::FLOAT8 AS total,
                  notes, footer_text, created_at, updated_at
           FROM invoices WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Invoice not found".into()))?;

    let items = sqlx::query_as::<_, crate::db_types::DbInvoiceItem>(
        "SELECT id, invoice_id, description,
                  quantity::FLOAT8 AS quantity, unit_price::FLOAT8 AS unit_price,
                  amount::FLOAT8 AS amount
           FROM invoice_items WHERE invoice_id = $1",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    let text_block_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT text_block_id FROM invoice_text_blocks WHERE invoice_id = $1 ORDER BY sort_order",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(crate::db_types::db_invoice_to_shared(r, items, text_block_ids))
}

async fn fetch_invoice_text_blocks(
    pool: &sqlx::PgPool,
    invoice_id: Uuid,
) -> Result<Vec<TextBlock>, AppError> {
    let rows = sqlx::query_as::<_, crate::db_types::DbTextBlock>(
        "SELECT tb.id, tb.user_id, tb.title, tb.content, tb.content_de, tb.is_default,
                  tb.created_at, tb.updated_at
           FROM text_blocks tb
           JOIN invoice_text_blocks itb ON itb.text_block_id = tb.id
           WHERE itb.invoice_id = $1
           ORDER BY itb.sort_order",
    )
    .bind(invoice_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into()).collect())
}
