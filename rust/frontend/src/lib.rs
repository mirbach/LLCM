mod api;
mod auth;
mod components;
mod pages;

use leptos::prelude::*;
use leptos_router::components::{Router, Route, Routes, Redirect};
use leptos_router::path;

use auth::{provide_auth_ctx, use_auth};
use components::Layout;

#[component]
fn App() -> impl IntoView {
    let auth = provide_auth_ctx();

    view! {
        <Router>
            <Routes fallback=|| view! { <p style="padding:32px;">"404 — Page not found"</p> }>
                <Route path=path!("/login") view=pages::login::LoginPage />
                <Route path=path!("/register") view=pages::register::RegisterPage />

                // Protected routes — redirect to /login if not authenticated
                <Route path=path!("/") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::dashboard::DashboardPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/customers") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::customers::CustomersPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/invoices") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::invoices::InvoicesPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/invoices/new") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::invoice_editor::InvoiceEditorPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/invoices/:id/edit") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::invoice_editor::InvoiceEditorPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/bank-accounts") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::bank_accounts::BankAccountsPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/net-income") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::net_income::NetIncomePage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
                <Route path=path!("/settings") view=move || {
                    let auth = use_auth();
                    if auth.is_logged_in() {
                        view! { <Layout><pages::settings::SettingsPage /></Layout> }.into_any()
                    } else {
                        view! { <Redirect path="/login" /> }.into_any()
                    }
                } />
            </Routes>
        </Router>
    }
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn main() {
    // Set up panic hook for better WASM error messages
    console_error_panic_hook::set_once();
    // Set up console logging
    let _ = console_log::init_with_level(log::Level::Debug);

    mount_to_body(App);
}
