use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::config::Config;

/// Create the SQLx connection pool and run pending migrations.
pub async fn init_pool(config: &Config) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("../migrations").run(&pool).await?;

    Ok(pool)
}
