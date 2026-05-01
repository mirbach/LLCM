use leptos::prelude::*;
use shared::{Invoice, InvoiceStatus};
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn DashboardPage() -> impl IntoView {
    let auth = use_auth();
    let invoices = RwSignal::new(Vec::<Invoice>::new());
    let loading = RwSignal::new(true);

    Effect::new(move |_| {
        if let Some(token) = auth.token_str() {
            spawn_local(async move {
                if let Ok(data) = crate::api::list_invoices(&token, None).await {
                    invoices.set(data);
                }
                loading.set(false);
            });
        }
    });

    view! {
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">"Dashboard"</h1>
                <a href="/invoices/new" style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">
                    "+ New Invoice"
                </a>
            </div>

            // Stats row
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;">
                <StatCard title="Total Invoices" value=move || invoices.get().len().to_string() />
                <StatCard title="Draft" value=move || count_status(&invoices.get(), InvoiceStatus::Draft).to_string() />
                <StatCard title="Sent" value=move || count_status(&invoices.get(), InvoiceStatus::Sent).to_string() />
                <StatCard title="Paid" value=move || count_status(&invoices.get(), InvoiceStatus::Paid).to_string() />
            </div>

            // Recent invoices
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:15px;">
                    "Recent Invoices"
                </div>
                {move || if loading.get() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
                } else if invoices.get().is_empty() {
                    view! {
                        <div style="padding:40px;text-align:center;color:#9ca3af;">
                            <p>"No invoices yet."</p>
                            <a href="/invoices/new" style="color:#3b82f6;font-size:13px;">"Create your first invoice"</a>
                        </div>
                    }.into_any()
                } else {
                    view! {
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;border-bottom:1px solid #f3f4f6;">
                                    <th style="text-align:left;padding:10px 20px;">"Number"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Status"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Date"</th>
                                    <th style="text-align:right;padding:10px 20px;">"Total"</th>
                                </tr>
                            </thead>
                            <tbody>
                                {move || invoices.get().into_iter().take(10).map(|inv| {
                                    view! { <InvoiceRow inv=inv /> }
                                }).collect_view()}
                            </tbody>
                        </table>
                    }.into_any()
                }}
            </div>
        </div>
    }
}

#[component]
fn StatCard(title: &'static str, value: impl Fn() -> String + 'static + Send + Sync) -> impl IntoView {
    view! {
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">{title}</div>
            <div style="font-size:28px;font-weight:700;">{value}</div>
        </div>
    }
}

#[component]
fn InvoiceRow(inv: Invoice) -> impl IntoView {
    let status_style = match inv.status {
        InvoiceStatus::Draft => "background:#f3f4f6;color:#374151",
        InvoiceStatus::Sent => "background:#dbeafe;color:#1d4ed8",
        InvoiceStatus::Paid => "background:#d1fae5;color:#065f46",
        InvoiceStatus::Overdue => "background:#fee2e2;color:#b91c1c",
    };
    let status_label = inv.status.to_string();
    let id = inv.id.to_string();

    view! {
        <tr style="border-bottom:1px solid #f9fafb;">
            <td style="padding:10px 20px;">
                <a href=format!("/invoices/{id}/edit") style="color:#3b82f6;font-weight:500;">
                    {inv.invoice_number.clone()}
                </a>
            </td>
            <td style="padding:10px 8px;">
                <span style=format!("{status_style};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:capitalize;")>
                    {status_label}
                </span>
            </td>
            <td style="padding:10px 8px;color:#6b7280;">
                {inv.issue_date.format("%d %b %Y").to_string()}
            </td>
            <td style="padding:10px 20px;text-align:right;font-weight:600;">
                {format!("{:.2} {}", inv.total, inv.currency)}
            </td>
        </tr>
    }
}

fn count_status(invoices: &[Invoice], status: InvoiceStatus) -> usize {
    invoices.iter().filter(|i| i.status == status).count()
}
