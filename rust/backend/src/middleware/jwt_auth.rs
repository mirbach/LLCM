use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::state::AppState;

/// Axum extractor that reads the `Authorization: Bearer <token>` header,
/// validates the JWT, and provides the authenticated user's ID.
#[derive(Debug, Clone)]
pub struct UserId(pub Uuid);

impl FromRequestParts<AppState> for UserId {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));

        let token = match token {
            Some(t) => t,
            None => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": "Missing Authorization header" })),
                ))
            }
        };

        match crate::auth::decode_token(token, &state.config.jwt_secret) {
            Ok(claims) if claims.kind == "access" => Ok(UserId(claims.sub)),
            Ok(_) => Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid token type" })),
            )),
            Err(_) => Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid or expired token" })),
            )),
        }
    }
}
