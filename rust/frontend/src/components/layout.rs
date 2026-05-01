use leptos::prelude::*;
use leptos_router::hooks::use_location;

use crate::auth::use_auth;

// ── Sidebar navigation item ────────────────────────────────────────────────────

#[component]
pub fn Layout(children: Children) -> impl IntoView {
    let auth = use_auth();
    let navigate = leptos_router::hooks::use_navigate();

    let logout = move |_| {
        auth.logout();
        navigate("/login", Default::default());
    };

    view! {
        <div style="display:flex;min-height:100vh;">
            // Sidebar
            <nav style="width:220px;flex-shrink:0;background:#1e293b;color:#e2e8f0;display:flex;flex-direction:column;padding:16px 0;">
                <div style="padding:0 20px 20px;font-size:18px;font-weight:700;color:#fff;border-bottom:1px solid #334155;">
                    "LLCM"
                </div>
                <div style="flex:1;padding-top:12px;">
                    <NavLink href="/" label="Dashboard" />
                    <NavLink href="/customers" label="Customers" />
                    <NavLink href="/invoices" label="Invoices" />
                    <NavLink href="/bank-accounts" label="Bank Accounts" />
                    <NavLink href="/net-income" label="Net Income" />
                    <NavLink href="/settings" label="Settings" />
                </div>
                <div style="padding:12px 20px;border-top:1px solid #334155;">
                    <button
                        on:click=logout
                        style="width:100%;background:transparent;border:1px solid #475569;color:#94a3b8;padding:8px;border-radius:6px;cursor:pointer;font-size:13px;"
                    >
                        "Log out"
                    </button>
                </div>
            </nav>
            // Main content
            <main style="flex:1;overflow-y:auto;padding:32px;">
                {children()}
            </main>
        </div>
    }
}

#[component]
fn NavLink(href: &'static str, label: &'static str) -> impl IntoView {
    let location = use_location();
    view! {
        <a
            href=href
            style=move || {
                let path = location.pathname.get();
                let is_active = if href == "/" { path == "/" } else { path.starts_with(href) };
                if is_active {
                    "display:block;padding:8px 20px;color:#fff;text-decoration:none;font-size:14px;background:rgba(255,255,255,0.12);transition:background 0.1s;"
                } else {
                    "display:block;padding:8px 20px;color:#cbd5e1;text-decoration:none;font-size:14px;transition:background 0.1s;"
                }
            }
        >
            {label}
        </a>
    }
}
