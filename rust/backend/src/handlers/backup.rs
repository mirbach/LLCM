use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use uuid::Uuid;

use shared::{BackupData, BankAccount, Customer, Invoice, TextBlock, WiseTransaction};

use crate::{
    error::AppError,
    middleware::UserId,
    state::AppState,
};

// ── GET /api/backup ───────────────────────────────────────────────────────────

pub async fn download_backup(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<BackupData>, AppError> {
    let company = crate::handlers::company::fetch_company(&state.pool, user_id)
        .await
        .ok();

    // Customers
    let customers: Vec<Customer> = sqlx::query_as::<_, crate::db_types::DbCustomer>(
        "SELECT id, user_id, customer_number, name, email, phone, address, city,
                  state, zip, country, title, contact_person, currency, notes,
                  created_at, updated_at
           FROM customers WHERE user_id = $1 ORDER BY name",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.into())
    .collect();

    // Invoices + items
    let invoice_rows = sqlx::query_as::<_, crate::db_types::DbInvoice>(
        "SELECT id, user_id, invoice_number, customer_id,
                  status::TEXT AS status, issue_date, due_date, currency,
                  subtotal::FLOAT8 AS subtotal, tax_rate::FLOAT8 AS tax_rate,
                  tax_amount::FLOAT8 AS tax_amount, total::FLOAT8 AS total,
                  notes, footer_text, created_at, updated_at
           FROM invoices WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let mut invoices: Vec<Invoice> = Vec::with_capacity(invoice_rows.len());
    for r in invoice_rows {
        let items = sqlx::query_as::<_, crate::db_types::DbInvoiceItem>(
            "SELECT id, invoice_id, description,
                      quantity::FLOAT8 AS quantity, unit_price::FLOAT8 AS unit_price,
                      amount::FLOAT8 AS amount
               FROM invoice_items WHERE invoice_id = $1",
        )
        .bind(r.id)
        .fetch_all(&state.pool)
        .await?;

        let text_block_ids: Vec<Uuid> = sqlx::query_scalar(
            "SELECT text_block_id FROM invoice_text_blocks WHERE invoice_id = $1 ORDER BY sort_order",
        )
        .bind(r.id)
        .fetch_all(&state.pool)
        .await?;

        invoices.push(crate::db_types::db_invoice_to_shared(r, items, text_block_ids));
    }

    // Bank accounts
    let bank_accounts: Vec<BankAccount> = sqlx::query_as::<_, crate::db_types::DbBankAccount>(
        "SELECT id, user_id, account_name, bank_name, bank_address, iban,
                  account_number, sort_code, routing_number, bic_swift, currency,
                  show_on_invoice, created_at, updated_at
           FROM bank_accounts WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.into())
    .collect();

    // Text blocks
    let text_blocks: Vec<TextBlock> = sqlx::query_as::<_, crate::db_types::DbTextBlock>(
        "SELECT id, user_id, title, content, content_de, is_default, created_at, updated_at FROM text_blocks WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.into())
    .collect();

    // Wise transactions
    let wise_transactions: Vec<WiseTransaction> = sqlx::query_as::<_, crate::db_types::DbWiseTransaction>(
        "SELECT wise_id, user_id, date, transaction_type,
                  amount_value::FLOAT8 AS amount_value, amount_currency,
                  description, sender_name, reference_number, matched_invoice_id,
                  is_owners_withdrawal, fetched_at
           FROM wise_transactions WHERE user_id = $1 ORDER BY date DESC",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.into())
    .collect();

    Ok(Json(BackupData {
        company,
        customers,
        invoices,
        bank_accounts,
        text_blocks,
        wise_transactions,
    }))
}

// ── POST /api/backup ──────────────────────────────────────────────────────────

pub async fn restore_backup(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(data): Json<BackupData>,
) -> Result<StatusCode, AppError> {
    let mut tx = state.pool.begin().await?;
    let now = Utc::now();

    // Delete all user data (FK cascades handle children).
    sqlx::query("DELETE FROM wise_transactions WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM text_blocks WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM invoices WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM customers WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM bank_accounts WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;

    // Restore company settings (preserving user_id).
    if let Some(c) = &data.company {
        sqlx::query(
            r#"UPDATE company_settings SET
                name = $2, address = $3, city = $4, state = $5, zip = $6, country = $7,
                phone = $8, email = $9, website = $10, tax_id = $11, invoice_prefix = $12,
                next_invoice_number = $13, next_customer_number = $14, footer_text = $15,
                accent_color = $16, updated_at = $17
               WHERE user_id = $1"#,
        )
        .bind(user_id)
        .bind(&c.name).bind(&c.address).bind(&c.city).bind(&c.state).bind(&c.zip).bind(&c.country)
        .bind(&c.phone).bind(&c.email).bind(&c.website).bind(&c.tax_id).bind(&c.invoice_prefix)
        .bind(c.next_invoice_number).bind(c.next_customer_number).bind(&c.footer_text)
        .bind(&c.accent_color).bind(now)
        .execute(&mut *tx)
        .await?;
    }

    // Restore customers.
    for c in &data.customers {
        sqlx::query(
            r#"INSERT INTO customers (id, user_id, customer_number, name, email, phone, address, city, state, zip, country, title, contact_person, currency, notes, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)"#,
        )
        .bind(c.id).bind(user_id).bind(&c.customer_number).bind(&c.name).bind(&c.email)
        .bind(&c.phone).bind(&c.address).bind(&c.city).bind(&c.state).bind(&c.zip)
        .bind(&c.country).bind(&c.title).bind(&c.contact_person).bind(&c.currency)
        .bind(&c.notes).bind(c.created_at).bind(c.updated_at)
        .execute(&mut *tx).await?;
    }

    // Restore invoices.
    for inv in &data.invoices {
        sqlx::query(
            r#"INSERT INTO invoices (id, user_id, invoice_number, customer_id, status, issue_date, due_date, currency, subtotal, tax_rate, tax_amount, total, notes, footer_text, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5::invoice_status,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)"#,
        )
        .bind(inv.id).bind(user_id).bind(&inv.invoice_number).bind(inv.customer_id)
        .bind(inv.status.to_string()).bind(inv.issue_date).bind(inv.due_date)
        .bind(&inv.currency).bind(inv.subtotal).bind(inv.tax_rate).bind(inv.tax_amount)
        .bind(inv.total).bind(&inv.notes).bind(&inv.footer_text).bind(inv.created_at).bind(inv.updated_at)
        .execute(&mut *tx).await?;

        for item in &inv.items {
            sqlx::query(
                "INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount) VALUES ($1,$2,$3,$4,$5,$6)",
            )
            .bind(item.id).bind(inv.id).bind(&item.description)
            .bind(item.quantity).bind(item.unit_price).bind(item.amount)
            .execute(&mut *tx).await?;
        }
    }

    // Restore bank accounts.
    for b in &data.bank_accounts {
        sqlx::query(
            r#"INSERT INTO bank_accounts (id, user_id, account_name, bank_name, bank_address, iban, account_number, sort_code, routing_number, bic_swift, currency, show_on_invoice, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)"#,
        )
        .bind(b.id).bind(user_id).bind(&b.account_name).bind(&b.bank_name).bind(&b.bank_address)
        .bind(&b.iban).bind(&b.account_number).bind(&b.sort_code).bind(&b.routing_number)
        .bind(&b.bic_swift).bind(&b.currency).bind(b.show_on_invoice).bind(b.created_at).bind(b.updated_at)
        .execute(&mut *tx).await?;
    }

    // Restore text blocks.
    for tb in &data.text_blocks {
        sqlx::query(
            "INSERT INTO text_blocks (id, user_id, title, content, content_de, is_default, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(tb.id).bind(user_id).bind(&tb.title).bind(&tb.content).bind(&tb.content_de)
        .bind(tb.is_default).bind(tb.created_at).bind(tb.updated_at)
        .execute(&mut *tx).await?;
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
