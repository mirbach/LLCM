use leptos::prelude::*;
use shared::LoginRequest;
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn LoginPage() -> impl IntoView {
    let auth = use_auth();
    let navigate = leptos_router::hooks::use_navigate();

    let email = RwSignal::new(String::new());
    let password = RwSignal::new(String::new());
    let error = RwSignal::new(Option::<String>::None);
    let loading = RwSignal::new(false);

    let submit = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let email_val = email.get();
        let pass_val = password.get();
        let nav = navigate.clone();

        if email_val.is_empty() || pass_val.is_empty() {
            error.set(Some("Please fill in all fields.".into()));
            return;
        }

        loading.set(true);
        error.set(None);

        spawn_local(async move {
            let result = crate::api::login(&LoginRequest {
                email: email_val,
                password: pass_val,
            })
            .await;

            loading.set(false);
            match result {
                Ok(resp) => {
                    auth.set_auth(resp);
                    nav("/", Default::default());
                }
                Err(e) => error.set(Some(e)),
            }
        });
    };

    view! {
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;">
            <div style="background:#fff;border-radius:12px;padding:40px;width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                <h1 style="font-size:22px;font-weight:700;margin-bottom:6px;">"Sign in to LLCM"</h1>
                <p style="color:#64748b;font-size:13px;margin-bottom:24px;">"Invoice & financial management"</p>

                {move || error.get().map(|e| view! {
                    <div style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:10px 12px;font-size:13px;margin-bottom:16px;">
                        {e}
                    </div>
                })}

                <form on:submit=submit>
                    <div style="margin-bottom:16px;">
                        <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">"Email"</label>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            prop:value=move || email.get()
                            on:input=move |ev| email.set(event_target_value(&ev))
                            style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;"
                        />
                    </div>
                    <div style="margin-bottom:24px;">
                        <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">"Password"</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            prop:value=move || password.get()
                            on:input=move |ev| password.set(event_target_value(&ev))
                            style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled=move || loading.get()
                        style="width:100%;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:600;cursor:pointer;"
                    >
                        {move || if loading.get() { "Signing in…" } else { "Sign in" }}
                    </button>
                </form>

                <p style="margin-top:20px;text-align:center;font-size:13px;color:#64748b;">
                    "Don't have an account? "
                    <a href="/register" style="color:#3b82f6;font-weight:500;">"Sign up"</a>
                </p>
            </div>
        </div>
    }
}
