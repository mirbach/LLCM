use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::Deserialize;

use shared::{NetIncomeBucket, NetIncomeReport};

use crate::{
    error::AppError,
    handlers::company::fetch_company,
    middleware::UserId,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct NetIncomeQuery {
    pub period: Option<String>,
}

// ── GET /api/net-income ───────────────────────────────────────────────────────

pub async fn get_net_income(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(q): Query<NetIncomeQuery>,
) -> Result<Json<NetIncomeReport>, AppError> {
    let period = q.period.clone().unwrap_or_else(|| "all".to_string());
    let report = build_report(&state, user_id, &period).await?;
    Ok(Json(report))
}

// ── GET /api/net-income/years ─────────────────────────────────────────────────

pub async fn get_years(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<i32>>, AppError> {
    let years: Vec<i32> = sqlx::query_scalar(
        r#"SELECT DISTINCT EXTRACT(YEAR FROM issue_date)::INT as year
           FROM invoices WHERE user_id = $1 AND status IN ('paid')
           UNION
           SELECT DISTINCT EXTRACT(YEAR FROM date)::INT
           FROM wise_transactions WHERE user_id = $1
           ORDER BY year DESC"#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(years))
}

// ── GET /api/net-income/pdf ───────────────────────────────────────────────────

pub async fn get_net_income_pdf(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(q): Query<NetIncomeQuery>,
) -> Result<Response, AppError> {
    let period = q.period.unwrap_or_else(|| "all".to_string());
    let report = build_report(&state, user_id, &period).await?;
    let company = fetch_company(&state.pool, user_id).await?;

    let html = crate::invoice_html::render_net_income_html(&report, &company);
    let pdf_bytes = crate::pdf::html_to_pdf(&state.browser, html).await?;

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"net-income-{period}.pdf\""),
        )
        .body(axum::body::Body::from(pdf_bytes))
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(response)
}

// ── Internal: build the aggregated report ─────────────────────────────────────

async fn build_report(
    state: &AppState,
    user_id: uuid::Uuid,
    period: &str,
) -> Result<NetIncomeReport, AppError> {
    // Date filter SQL fragment.
    let (date_filter_inv, date_filter_wise) = match period {
        p if p.starts_with("year_") => {
            let year = p.trim_start_matches("year_");
            (
                format!("AND EXTRACT(YEAR FROM issue_date) = {year}"),
                format!("AND EXTRACT(YEAR FROM date) = {year}"),
            )
        }
        "this_month" => (
            "AND DATE_TRUNC('month', issue_date) = DATE_TRUNC('month', CURRENT_DATE)".into(),
            "AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)".into(),
        ),
        "this_year" => (
            "AND EXTRACT(YEAR FROM issue_date) = EXTRACT(YEAR FROM CURRENT_DATE)".into(),
            "AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)".into(),
        ),
        _ => ("".into(), "".into()),
    };

    // Invoice receipts (paid invoices grouped by currency) — cast NUMERIC to FLOAT8.
    let inv_query = format!(
        "SELECT currency, SUM(total)::FLOAT8 AS total
           FROM invoices
           WHERE user_id = $1 AND status = 'paid' {date_filter_inv}
           GROUP BY currency",
    );
    let inv_rows: Vec<(String, f64)> =
        sqlx::query_as(&inv_query)
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?;

    // Wise transactions: credits = income, debits = expenses, withdrawals excluded.
    let wise_query = format!(
        "SELECT amount_currency,
                  SUM(CASE WHEN amount_value > 0 AND NOT is_owners_withdrawal THEN amount_value ELSE 0 END)::FLOAT8 AS bank_receipts,
                  SUM(CASE WHEN amount_value < 0 THEN ABS(amount_value) ELSE 0 END)::FLOAT8 AS expenses,
                  SUM(CASE WHEN is_owners_withdrawal THEN ABS(amount_value) ELSE 0 END)::FLOAT8 AS withdrawals
           FROM wise_transactions
           WHERE user_id = $1 {date_filter_wise}
           GROUP BY amount_currency",
    );
    let wise_rows: Vec<(String, f64, f64, f64)> =
        sqlx::query_as(&wise_query)
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?;

    // Merge into buckets keyed by currency.
    use std::collections::HashMap;
    let mut buckets: HashMap<String, NetIncomeBucket> = HashMap::new();

    for (currency, total) in inv_rows {
        let b = buckets.entry(currency.clone()).or_insert_with(|| NetIncomeBucket {
            currency,
            invoice_receipts: 0.0,
            bank_receipts: 0.0,
            expenses: 0.0,
            owner_withdrawals: 0.0,
            net_income: 0.0,
        });
        b.invoice_receipts += total;
    }

    for (currency, bank_receipts, expenses, withdrawals) in wise_rows {
        let b = buckets.entry(currency.clone()).or_insert_with(|| NetIncomeBucket {
            currency,
            invoice_receipts: 0.0,
            bank_receipts: 0.0,
            expenses: 0.0,
            owner_withdrawals: 0.0,
            net_income: 0.0,
        });
        b.bank_receipts += bank_receipts;
        b.expenses += expenses;
        b.owner_withdrawals += withdrawals;
    }

    let mut result: Vec<NetIncomeBucket> = buckets.into_values().map(|mut b| {
        b.net_income = b.invoice_receipts + b.bank_receipts - b.expenses;
        b
    }).collect();

    result.sort_by(|a, b| a.currency.cmp(&b.currency));

    Ok(NetIncomeReport {
        period: period.to_string(),
        buckets: result,
    })
}
