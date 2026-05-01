mod auth;
mod config;
mod db;
mod db_types;
mod email;
mod error;
mod handlers;
mod invoice_html;
mod middleware;
mod pdf;
mod server;
mod state;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialise tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "llcm_backend=debug,tower_http=debug,axum=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration from env vars / .env
    let cfg = config::Config::from_env()?;

    // Connect to Postgres + run migrations
    let pool = db::init_pool(&cfg).await?;

    // Initialise application state (browser for PDF, etc.)
    let state = state::AppState::new(pool, cfg).await?;

    // Build Axum router
    let app = server::build_router(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 4000));
    tracing::info!("LLCM backend listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received — stopping server");
}
