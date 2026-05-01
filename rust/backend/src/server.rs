use std::time::Duration;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, Method, StatusCode, header},
    middleware as axum_middleware,
    response::IntoResponse,
    routing::{delete, get, post, put},
};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    services::ServeDir,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

use crate::{
    handlers::{auth, backup, bank_accounts, company, customers, invoices, net_income, text_blocks},
    state::AppState,
};

pub fn build_router(state: AppState) -> Router {
    // Public auth routes (no JWT required)
    let auth_routes = Router::new()
        .route("/register", post(auth::register))
        .route("/login", post(auth::login))
        .route("/refresh", post(auth::refresh));

    // Protected routes
    let me_routes = Router::new().route("/me", get(auth::me));

    let company_routes = Router::new()
        .route("/company", get(company::get_company))
        .route("/company", put(company::update_company))
        .route("/company/logo", post(company::upload_logo))
        .route("/company/logo", delete(company::delete_logo));

    let customer_routes = Router::new()
        .route("/customers", get(customers::list_customers))
        .route("/customers", post(customers::create_customer))
        .route("/customers/{id}", get(customers::get_customer))
        .route("/customers/{id}", put(customers::update_customer))
        .route("/customers/{id}", delete(customers::delete_customer));

    let invoice_routes = Router::new()
        .route("/invoices", get(invoices::list_invoices))
        .route("/invoices", post(invoices::create_invoice))
        .route("/invoices/{id}", get(invoices::get_invoice))
        .route("/invoices/{id}", put(invoices::update_invoice))
        .route("/invoices/{id}", delete(invoices::delete_invoice))
        .route("/invoices/{id}/status", put(invoices::update_invoice_status))
        .route("/invoices/{id}/pdf", get(invoices::download_pdf))
        .route("/invoices/{id}/send", post(invoices::send_invoice))
        .route("/invoices/pdf-from-html", post(invoices::pdf_from_html));

    let bank_routes = Router::new()
        .route("/bank-accounts", get(bank_accounts::list_bank_accounts))
        .route("/bank-accounts", post(bank_accounts::create_bank_account))
        .route("/bank-accounts/{id}", put(bank_accounts::update_bank_account))
        .route("/bank-accounts/{id}", delete(bank_accounts::delete_bank_account))
        .route("/bank-accounts/wise/config", get(bank_accounts::get_wise_config))
        .route("/bank-accounts/wise/config", put(bank_accounts::save_wise_config))
        .route("/bank-accounts/wise/test", post(bank_accounts::test_wise))
        .route(
            "/bank-accounts/wise/transactions",
            get(bank_accounts::get_wise_transactions),
        )
        .route(
            "/bank-accounts/wise/transactions/saved",
            get(bank_accounts::get_saved_transactions),
        )
        .route(
            "/bank-accounts/wise/transactions/{id}/withdrawal",
            put(bank_accounts::flag_withdrawal),
        );

    let text_block_routes = Router::new()
        .route("/text-blocks", get(text_blocks::list_text_blocks))
        .route("/text-blocks", post(text_blocks::create_text_block))
        .route("/text-blocks/{id}", put(text_blocks::update_text_block))
        .route("/text-blocks/{id}", delete(text_blocks::delete_text_block))
        .route(
            "/text-blocks/{id}/default",
            put(text_blocks::set_default_text_block),
        );

    let backup_routes = Router::new()
        .route("/backup", get(backup::download_backup))
        .route("/backup", post(backup::restore_backup));

    let net_income_routes = Router::new()
        .route("/net-income", get(net_income::get_net_income))
        .route("/net-income/years", get(net_income::get_years))
        .route("/net-income/pdf", get(net_income::get_net_income_pdf));

    // CORS — allow the frontend origin in production; allow all in dev
    let cors = CorsLayer::new()
        .allow_origin(cors_origins())
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
        ])
        .max_age(Duration::from_secs(3600));

    // Combine all API routes under /api
    let api = Router::new()
        .nest("/auth", auth_routes)
        .merge(me_routes)
        .merge(company_routes)
        .merge(customer_routes)
        .merge(invoice_routes)
        .merge(bank_routes)
        .merge(text_block_routes)
        .merge(backup_routes)
        .merge(net_income_routes)
        .route("/health", get(health))
        .layer(ServiceBuilder::new().layer(cors));

    // Static file serving for uploaded logos
    let uploads = Router::new().nest_service(
        "/uploads",
        ServeDir::new("uploads"),
    );

    Router::new()
        .nest("/api", api)
        .merge(uploads)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new())
                .layer(TimeoutLayer::new(Duration::from_secs(60)))
                .layer(DefaultBodyLimit::max(50 * 1024 * 1024)), // 50 MB
        )
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

fn cors_origins() -> tower_http::cors::AllowOrigin {
    // In production FRONTEND_URL env var should be set; otherwise allow any.
    if let Ok(origin) = std::env::var("FRONTEND_URL") {
        if let Ok(val) = origin.parse::<HeaderValue>() {
            return tower_http::cors::AllowOrigin::exact(val);
        }
    }
    tower_http::cors::AllowOrigin::any()
}
