use leptos::prelude::*;
use leptos_router::hooks::use_params_map;
use shared::{CreateInvoice, CreateInvoiceItem, Customer, UpdateInvoice};
use uuid::Uuid;
use wasm_bindgen_futures::spawn_local;
use chrono::Duration;

use crate::auth::use_auth;

#[component]
pub fn InvoiceEditorPage() -> impl IntoView {
    let auth = use_auth();
    let navigate = leptos_router::hooks::use_navigate();
    let params = use_params_map();

    // Detect if editing (has :id param)
    let invoice_id = move || params.read().get("id").map(|s| s.to_string());

    let customers = RwSignal::new(Vec::<Customer>::new());
    let loading = RwSignal::new(true);
    let saving = RwSignal::new(false);
    let error = RwSignal::new(Option::<String>::None);

    // Form fields
    let customer_id = RwSignal::new(String::new());
    let issue_date = RwSignal::new(chrono::Utc::now().format("%Y-%m-%d").to_string());
    let due_date = RwSignal::new((chrono::Utc::now() + chrono::Duration::days(30)).format("%Y-%m-%d").to_string());
    let currency = RwSignal::new("USD".to_string());
    let tax_rate = RwSignal::new("0".to_string());
    let notes = RwSignal::new(String::new());
    let items: RwSignal<Vec<(RwSignal<String>, RwSignal<String>, RwSignal<String>)>> = RwSignal::new(vec![
        (RwSignal::new(String::new()), RwSignal::new("1".into()), RwSignal::new("0".into()))
    ]);

    // Load customers and optionally the invoice
    Effect::new(move |_| {
        let Some(token) = auth.token_str() else { return };
        let id = invoice_id();

        spawn_local(async move {
            if let Ok(cs) = crate::api::list_customers(&token).await {
                customers.set(cs);
            }

            if let Some(ref inv_id) = id {
                if let Ok(inv) = crate::api::get_invoice(&token, inv_id).await {
                    customer_id.set(inv.customer_id.map(|id| id.to_string()).unwrap_or_default());
                    issue_date.set(inv.issue_date.format("%Y-%m-%d").to_string());
                    due_date.set(inv.due_date.format("%Y-%m-%d").to_string());
                    currency.set(inv.currency);
                    tax_rate.set(inv.tax_rate.to_string());
                    notes.set(inv.notes);
                    items.set(inv.items.into_iter().map(|item| (
                        RwSignal::new(item.description),
                        RwSignal::new(item.quantity.to_string()),
                        RwSignal::new(item.unit_price.to_string()),
                    )).collect());
                }
            }

            loading.set(false);
        });
    });

    let add_item = move |_| {
        items.update(|v| v.push((
            RwSignal::new(String::new()),
            RwSignal::new("1".into()),
            RwSignal::new("0".into()),
        )));
    };

    let remove_item = move |idx: usize| {
        items.update(|v| { if v.len() > 1 { v.remove(idx); } });
    };

    let submit = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let Some(token) = auth.token_str() else { return };
        let id = invoice_id();

        let build_items: Vec<CreateInvoiceItem> = items.get().iter().map(|(desc, qty, price)| {
            let q: f64 = qty.get().parse().unwrap_or(1.0);
            let p: f64 = price.get().parse().unwrap_or(0.0);
            let amount = q * p;
            CreateInvoiceItem {
                description: desc.get(),
                quantity: q,
                unit_price: p,
                amount,
            }
        }).collect();

        let cust_uuid = Uuid::parse_str(&customer_id.get()).ok();
        let tax: f64 = tax_rate.get().parse().unwrap_or(0.0);
        let nav = navigate.clone();

        saving.set(true);
        error.set(None);

        spawn_local(async move {
            let result = if let Some(ref inv_id) = id {
                crate::api::update_invoice(&token, inv_id, &UpdateInvoice {
                    customer_id: Some(cust_uuid),
                    issue_date: issue_date.get().parse().ok(),
                    due_date: due_date.get().parse().ok(),
                    currency: Some(currency.get()),
                    tax_rate: Some(tax),
                    notes: Some(notes.get()),
                    items: Some(build_items),
                    ..Default::default()
                }).await.map(|_| ())
            } else {
                crate::api::create_invoice(&token, &CreateInvoice {
                    customer_id: cust_uuid,
                    issue_date: issue_date.get().parse().unwrap_or_else(|_| chrono::Utc::now().date_naive()),
                    due_date: due_date.get().parse().unwrap_or_else(|_| (chrono::Utc::now() + Duration::days(30)).date_naive()),
                    currency: currency.get(),
                    tax_rate: tax,
                    notes: notes.get(),
                    footer_text: String::new(),
                    items: build_items,
                    text_block_ids: Vec::new(),
                }).await.map(|_| ())
            };

            saving.set(false);
            match result {
                Ok(_) => { nav("/invoices", Default::default()); }
                Err(e) => error.set(Some(e)),
            }
        });
    };

    let submit = StoredValue::new(submit);

    view! {
        <div style="max-width:840px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">
                    {move || if invoice_id().is_some() { "Edit Invoice" } else { "New Invoice" }}
                </h1>
                <a href="/invoices" style="color:#64748b;font-size:13px;">"← Back"</a>
            </div>

            {move || error.get().map(|e| view! {
                <div style="background:#fef2f2;color:#dc2626;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">{e}</div>
            })}

            {move || if loading.get() {
                view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
            } else {
                view! {
                    <form on:submit=move |ev| submit.update_value(|f| f(ev))>
                        // Header fields
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px;">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                                <div>
                                    <label style=LABEL_STYLE>"Customer"</label>
                                    <select
                                        prop:value=move || customer_id.get()
                                        on:change=move |ev| customer_id.set(event_target_value(&ev))
                                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
                                    >
                                        <option value="">"— Select customer —"</option>
                                        {move || customers.get().into_iter().map(|c| {
                                            let id = c.id.to_string();
                                            view! { <option value=id.clone()>{c.name.clone()}</option> }
                                        }).collect_view()}
                                    </select>
                                </div>
                                <div>
                                    <label style=LABEL_STYLE>"Currency"</label>
                                    <select
                                        prop:value=move || currency.get()
                                        on:change=move |ev| currency.set(event_target_value(&ev))
                                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
                                    >
                                        <option value="USD">"USD"</option>
                                        <option value="EUR">"EUR"</option>
                                        <option value="GBP">"GBP"</option>
                                        <option value="CHF">"CHF"</option>
                                        <option value="CAD">"CAD"</option>
                                        <option value="AUD">"AUD"</option>
                                    </select>
                                </div>
                                <div>
                                    <label style=LABEL_STYLE>"Issue Date"</label>
                                    <input type="date"
                                        prop:value=move || issue_date.get()
                                        on:input=move |ev| issue_date.set(event_target_value(&ev))
                                        style=INPUT_STYLE />
                                </div>
                                <div>
                                    <label style=LABEL_STYLE>"Due Date"</label>
                                    <input type="date"
                                        prop:value=move || due_date.get()
                                        on:input=move |ev| due_date.set(event_target_value(&ev))
                                        style=INPUT_STYLE />
                                </div>
                                <div>
                                    <label style=LABEL_STYLE>"Tax Rate (%)"</label>
                                    <input type="number" step="0.01" min="0"
                                        prop:value=move || tax_rate.get()
                                        on:input=move |ev| tax_rate.set(event_target_value(&ev))
                                        style=INPUT_STYLE />
                                </div>
                            </div>
                        </div>

                        // Line items
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px;">
                            <div style="font-weight:600;margin-bottom:16px;">"Line Items"</div>
                            <div style="display:grid;grid-template-columns:1fr 80px 100px 24px;gap:8px;margin-bottom:8px;font-size:11px;color:#9ca3af;text-transform:uppercase;">
                                <span>"Description"</span><span>"Qty"</span><span>"Unit Price"</span><span></span>
                            </div>
                            {move || items.get().into_iter().enumerate().map(|(i, (desc, qty, price))| {
                                view! {
                                    <div style="display:grid;grid-template-columns:1fr 80px 100px 24px;gap:8px;margin-bottom:8px;">
                                        <input type="text"
                                            prop:value=move || desc.get()
                                            on:input=move |ev| desc.set(event_target_value(&ev))
                                            placeholder="Description"
                                            style=INPUT_STYLE />
                                        <input type="number" step="0.01" min="0"
                                            prop:value=move || qty.get()
                                            on:input=move |ev| qty.set(event_target_value(&ev))
                                            style=INPUT_STYLE />
                                        <input type="number" step="0.01" min="0"
                                            prop:value=move || price.get()
                                            on:input=move |ev| price.set(event_target_value(&ev))
                                            style=INPUT_STYLE />
                                        <button type="button" on:click=move |_| remove_item(i)
                                            style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:18px;line-height:1;">
                                            "×"
                                        </button>
                                    </div>
                                }
                            }).collect_view()}
                            <button type="button" on:click=add_item
                                style="margin-top:8px;background:none;border:1px dashed #e2e8f0;border-radius:6px;padding:8px 16px;font-size:13px;color:#64748b;cursor:pointer;width:100%;">
                                "+ Add Item"
                            </button>
                        </div>

                        // Notes
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;">
                            <label style=LABEL_STYLE>"Notes"</label>
                            <textarea rows="3"
                                prop:value=move || notes.get()
                                on:input=move |ev| notes.set(event_target_value(&ev))
                                style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;resize:vertical;"
                            />
                        </div>

                        <div style="display:flex;justify-content:flex-end;gap:12px;">
                            <a href="/invoices"
                                style="padding:10px 20px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;color:#64748b;text-decoration:none;">
                                "Cancel"
                            </a>
                            <button type="submit" disabled=move || saving.get()
                                style="background:#3b82f6;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
                                {move || if saving.get() { "Saving…" } else { "Save Invoice" }}
                            </button>
                        </div>
                    </form>
                }.into_any()
            }}
        </div>
    }
}

const LABEL_STYLE: &str = "display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;";
const INPUT_STYLE: &str = "width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;";
