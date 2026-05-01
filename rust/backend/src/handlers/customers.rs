use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;

use shared::{CreateCustomer, Customer, UpdateCustomer};

use crate::{error::AppError, middleware::UserId, state::AppState};

// ── GET /api/customers ────────────────────────────────────────────────────────

pub async fn list_customers(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<Customer>>, AppError> {
    let rows = sqlx::query_as::<_, crate::db_types::DbCustomer>(
        "SELECT id, user_id, customer_number, name, email, phone, address, city,
                  state, zip, country, title, contact_person, currency, notes,
                  created_at, updated_at
           FROM customers WHERE user_id = $1 ORDER BY name",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let customers: Vec<Customer> = rows.into_iter().map(|r| r.into()).collect();

    Ok(Json(customers))
}

// ── GET /api/customers/:id ────────────────────────────────────────────────────

pub async fn get_customer(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<Json<Customer>, AppError> {
    let r = sqlx::query_as::<_, crate::db_types::DbCustomer>(
        "SELECT id, user_id, customer_number, name, email, phone, address, city,
                  state, zip, country, title, contact_person, currency, notes,
                  created_at, updated_at
           FROM customers WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Customer not found".into()))?;

    Ok(Json(r.into()))
}

// ── POST /api/customers ───────────────────────────────────────────────────────

pub async fn create_customer(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(body): Json<CreateCustomer>,
) -> Result<(StatusCode, Json<Customer>), AppError> {
    body.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Atomically get and increment the next customer number.
    let num: i32 = sqlx::query_scalar(
        r#"UPDATE company_settings
           SET next_customer_number = next_customer_number + 1, updated_at = NOW()
           WHERE user_id = $1
           RETURNING next_customer_number - 1"#,
    )
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    let customer_number = format!("K-{:06}", num);
    let id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"INSERT INTO customers
           (id, user_id, customer_number, name, email, phone, address, city,
            state, zip, country, title, contact_person, currency, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&customer_number)
    .bind(&body.name)
    .bind(&body.email)
    .bind(&body.phone)
    .bind(&body.address)
    .bind(&body.city)
    .bind(&body.state)
    .bind(&body.zip)
    .bind(&body.country)
    .bind(&body.title)
    .bind(&body.contact_person)
    .bind(&body.currency)
    .bind(&body.notes)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    let customer = Customer {
        id,
        user_id,
        customer_number,
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        city: body.city,
        state: body.state,
        zip: body.zip,
        country: body.country,
        title: body.title,
        contact_person: body.contact_person,
        currency: body.currency,
        notes: body.notes,
        created_at: now,
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(customer)))
}

// ── PUT /api/customers/:id ────────────────────────────────────────────────────

pub async fn update_customer(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateCustomer>,
) -> Result<Json<Customer>, AppError> {
    sqlx::query(
        r#"UPDATE customers SET
            name           = COALESCE($3, name),
            email          = COALESCE($4, email),
            phone          = COALESCE($5, phone),
            address        = COALESCE($6, address),
            city           = COALESCE($7, city),
            state          = COALESCE($8, state),
            zip            = COALESCE($9, zip),
            country        = COALESCE($10, country),
            title          = COALESCE($11, title),
            contact_person = COALESCE($12, contact_person),
            currency       = COALESCE($13, currency),
            notes          = COALESCE($14, notes),
            updated_at     = $15
           WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(&body.name)
    .bind(&body.email)
    .bind(&body.phone)
    .bind(&body.address)
    .bind(&body.city)
    .bind(&body.state)
    .bind(&body.zip)
    .bind(&body.country)
    .bind(&body.title)
    .bind(&body.contact_person)
    .bind(&body.currency)
    .bind(&body.notes)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    get_customer(State(state), UserId(user_id), Path(id)).await
}

// ── DELETE /api/customers/:id ─────────────────────────────────────────────────

pub async fn delete_customer(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query(
        "DELETE FROM customers WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Customer not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
