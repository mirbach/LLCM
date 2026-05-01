use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Unified API error type returned in JSON responses.
#[derive(Debug, Serialize, Deserialize, Error, Clone)]
#[serde(tag = "type", content = "message")]
pub enum ApiError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal server error")]
    Internal,
}

impl ApiError {
    pub fn not_found(what: impl Into<String>) -> Self {
        Self::NotFound(what.into())
    }
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Conflict(msg.into())
    }
}
