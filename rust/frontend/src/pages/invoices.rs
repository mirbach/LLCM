use leptos::prelude::*;
use shared::{Invoice, InvoiceStatus};
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn InvoicesPage() -> impl IntoView {
    let auth = use_auth();
    let invoices = RwSignal::new(Vec::<Invoice>::new());
    let loading = RwSignal::new(true);
    let filter = RwSignal::new("all".to_string());

    let refresh = move || {
        if let Some(token) = auth.token_str() {
            loading.set(true);
            let status_filter = {
                let f = filter.get();
                if f == "all" { None } else { Some(f) }
            };
            spawn_local(async move {
                if let Ok(data) = crate::api::list_invoices(&token, status_filter.as_deref()).await {
                    invoices.set(data);
                }
                loading.set(false);
            });
        }
    };

    Effect::new(move |_| {
        let _ = filter.get(); // track
        refresh();
    });

    let delete_invoice = move |id: String| {
        let Some(token) = auth.token_str() else { return };
        spawn_local(async move {
            if crate::api::delete_invoice(&token, &id).await.is_ok() {
                refresh();
            }
        });
    };

    let mark_paid = move |id: String| {
        let Some(token) = auth.token_str() else { return };
        spawn_local(async move {
            let _ = crate::api::update_invoice_status(&token, &id, InvoiceStatus::Paid).await;
            refresh();
        });
    };

    view! {
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">"Invoices"</h1>
                <a href="/invoices/new" style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">
                    "+ New Invoice"
                </a>
            </div>

            // Filter tabs
            <div style="display:flex;gap:8px;margin-bottom:20px;">
                {["all", "draft", "sent", "paid", "overdue"].iter().map(|tab| {
                    let tab_str = *tab;
                    view! {
                        <button
                            on:click=move |_| filter.set(tab_str.into())
                            style=move || {
                                let is_active = filter.get() == tab_str;
                                if is_active {
                                    "background:#3b82f6;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;"
                                } else {
                                    "background:#fff;color:#64748b;border:1px solid #e5e7eb;padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;"
                                }
                            }
                        >
                            {tab_str.to_uppercase()}
                        </button>
                    }
                }).collect_view()}
            </div>

            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                {move || if loading.get() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
                } else if invoices.get().is_empty() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"No invoices found."</div> }.into_any()
                } else {
                    view! {
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;border-bottom:1px solid #f3f4f6;">
                                    <th style="text-align:left;padding:10px 20px;">"Number"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Status"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Issue Date"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Due Date"</th>
                                    <th style="text-align:right;padding:10px 8px;">"Total"</th>
                                    <th style="padding:10px 20px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {move || invoices.get().into_iter().map(|inv| {
                                    let id = inv.id.to_string();
                                    let del_id = id.clone();
                                    let paid_id = id.clone();
                                    let pdf_url = crate::api::invoice_pdf_url(&id);
                                    let edit_url = format!("/invoices/{id}/edit");
                                    let status_style = status_badge_style(inv.status.clone());
                                    let status_label = inv.status.to_string();
                                    let can_mark_paid = inv.status == InvoiceStatus::Sent || inv.status == InvoiceStatus::Overdue;

                                    view! {
                                        <tr style="border-bottom:1px solid #f9fafb;">
                                            <td style="padding:10px 20px;">
                                                <a href=edit_url.clone() style="color:#3b82f6;font-weight:500;">{inv.invoice_number.clone()}</a>
                                            </td>
                                            <td style="padding:10px 8px;">
                                                <span style=status_style>{status_label}</span>
                                            </td>
                                            <td style="padding:10px 8px;color:#6b7280;">{inv.issue_date.format("%d %b %Y").to_string()}</td>
                                            <td style="padding:10px 8px;color:#6b7280;">{inv.due_date.format("%d %b %Y").to_string()}</td>
                                            <td style="padding:10px 8px;text-align:right;font-weight:600;">
                                                {format!("{:.2} {}", inv.total, inv.currency)}
                                            </td>
                                            <td style="padding:10px 20px;text-align:right;white-space:nowrap;">
                                                <a href=edit_url style="color:#3b82f6;font-size:12px;margin-right:8px;">
                                                    "Edit"
                                                </a>
                                                <a href=pdf_url target="_blank" style="color:#6b7280;font-size:12px;margin-right:8px;">
                                                    "PDF"
                                                </a>
                                                {if can_mark_paid {
                                                    view! {
                                                        <button on:click=move |_| mark_paid(paid_id.clone())
                                                            style="background:none;border:none;color:#16a34a;cursor:pointer;font-size:12px;margin-right:8px;">
                                                            "Mark Paid"
                                                        </button>
                                                    }.into_any()
                                                } else { view! { <span /> }.into_any() }}
                                                <button on:click=move |_| delete_invoice(del_id.clone())
                                                    style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;">
                                                    "Delete"
                                                </button>
                                            </td>
                                        </tr>
                                    }
                                }).collect_view()}
                            </tbody>
                        </table>
                    }.into_any()
                }}
            </div>
        </div>
    }
}

fn status_badge_style(status: InvoiceStatus) -> &'static str {
    match status {
        InvoiceStatus::Draft => "background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;",
        InvoiceStatus::Sent => "background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;",
        InvoiceStatus::Paid => "background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;",
        InvoiceStatus::Overdue => "background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;",
    }
}
