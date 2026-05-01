use std::env;

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_secs: i64,
    pub refresh_secret: String,
    pub refresh_expiry_secs: i64,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_user: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from: Option<String>,
    pub chromium_path: String,
    pub upload_dir: String,
    pub port: u16,
    pub frontend_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: require("DATABASE_URL")?,
            jwt_secret: require("JWT_SECRET")?,
            jwt_expiry_secs: env::var("JWT_EXPIRY_SECS")
                .unwrap_or_else(|_| "900".into())
                .parse()?,
            refresh_secret: require("REFRESH_SECRET")?,
            refresh_expiry_secs: env::var("REFRESH_EXPIRY_SECS")
                .unwrap_or_else(|_| "604800".into())
                .parse()?,
            smtp_host: env::var("SMTP_HOST").ok(),
            smtp_port: env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".into())
                .parse()
                .unwrap_or(587),
            smtp_user: env::var("SMTP_USER").ok(),
            smtp_password: env::var("SMTP_PASSWORD").ok(),
            smtp_from: env::var("SMTP_FROM").ok(),
            chromium_path: env::var("CHROMIUM_PATH")
                .unwrap_or_else(|_| "chromium".into()),
            upload_dir: env::var("UPLOAD_DIR")
                .unwrap_or_else(|_| "./uploads".into()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "4000".into())
                .parse()
                .unwrap_or(4000),
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
        })
    }
}

fn require(key: &str) -> anyhow::Result<String> {
    env::var(key).map_err(|_| anyhow::anyhow!("Missing required env var: {key}"))
}
