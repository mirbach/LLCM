/// Shared application state injected into every Axum handler.
#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub config: crate::config::Config,
    pub browser: crate::pdf::SharedBrowser,
}

impl AppState {
    pub async fn new(
        pool: sqlx::PgPool,
        config: crate::config::Config,
    ) -> anyhow::Result<Self> {
        let browser = crate::pdf::launch_browser(&config.chromium_path).await?;
        Ok(Self { pool, config, browser })
    }
}
