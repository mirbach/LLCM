use gloo_storage::{LocalStorage, Storage};
use leptos::prelude::*;
use shared::AuthResponse;

const TOKEN_KEY: &str = "llcm_access_token";

/// Auth state shared across the app via Leptos context.
#[derive(Clone, Copy)]
pub struct AuthCtx {
    pub token: ReadSignal<Option<String>>,
    pub set_token: WriteSignal<Option<String>>,
}

impl AuthCtx {
    /// Returns true if the user has an access token.
    pub fn is_logged_in(self) -> bool {
        self.token.get().is_some()
    }

    /// Persists auth tokens from a successful auth response.
    pub fn set_auth(self, resp: AuthResponse) {
        LocalStorage::set(TOKEN_KEY, &resp.access_token).ok();
        self.set_token.set(Some(resp.access_token));
    }

    /// Clears auth state and storage.
    pub fn logout(self) {
        LocalStorage::delete(TOKEN_KEY);
        self.set_token.set(None);
    }

    /// Convenience: get the token string or redirect.
    pub fn token_str(self) -> Option<String> {
        self.token.get()
    }
}

/// Provides the auth context. Call once at the app root.
pub fn provide_auth_ctx() -> AuthCtx {
    let initial_token: Option<String> = LocalStorage::get(TOKEN_KEY).ok();

    let (token, set_token) = signal(initial_token);

    let ctx = AuthCtx {
        token,
        set_token,
    };
    provide_context(ctx);
    ctx
}

/// Use the auth context anywhere in the tree.
pub fn use_auth() -> AuthCtx {
    use_context::<AuthCtx>().expect("AuthCtx not provided")
}
