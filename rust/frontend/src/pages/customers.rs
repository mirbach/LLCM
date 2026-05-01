use leptos::prelude::*;
use shared::{CreateCustomer, Customer, UpdateCustomer};
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn CustomersPage() -> impl IntoView {
    let auth = use_auth();
    let customers = RwSignal::new(Vec::<Customer>::new());
    let loading = RwSignal::new(true);
    let show_form = RwSignal::new(false);
    let editing_id = RwSignal::new(Option::<String>::None);
    let error = RwSignal::new(Option::<String>::None);

    // Form fields
    let name = RwSignal::new(String::new());
    let email = RwSignal::new(String::new());
    let phone = RwSignal::new(String::new());
    let address = RwSignal::new(String::new());
    let city = RwSignal::new(String::new());
    let zip = RwSignal::new(String::new());
    let country = RwSignal::new(String::new());
    let currency = RwSignal::new("USD".to_string());
    let notes = RwSignal::new(String::new());

    let refresh = move || {
        if let Some(token) = auth.token_str() {
            spawn_local(async move {
                if let Ok(data) = crate::api::list_customers(&token).await {
                    customers.set(data);
                }
                loading.set(false);
            });
        }
    };

    Effect::new(move |_| refresh());

    let open_new = move |_| {
        editing_id.set(None);
        name.set(String::new());
        email.set(String::new());
        phone.set(String::new());
        address.set(String::new());
        city.set(String::new());
        zip.set(String::new());
        country.set(String::new());
        currency.set("USD".into());
        notes.set(String::new());
        show_form.set(true);
    };

    let open_edit = move |c: &Customer| {
        editing_id.set(Some(c.id.to_string()));
        name.set(c.name.clone());
        email.set(c.email.clone());
        phone.set(c.phone.clone());
        address.set(c.address.clone());
        city.set(c.city.clone());
        zip.set(c.zip.clone());
        country.set(c.country.clone());
        currency.set(c.currency.clone());
        notes.set(c.notes.clone());
        show_form.set(true);
    };

    let save = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let Some(token) = auth.token_str() else { return };
        let id = editing_id.get();
        let body_name = name.get();
        if body_name.trim().is_empty() {
            error.set(Some("Name is required.".into()));
            return;
        }
        error.set(None);

        let create_body = CreateCustomer {
            name: body_name,
            email: email.get(),
            phone: phone.get(),
            address: address.get(),
            city: city.get(),
            zip: zip.get(),
            country: country.get(),
            currency: currency.get(),
            notes: notes.get(),
            title: String::new(),
            contact_person: String::new(),
            state: String::new(),
        };

        spawn_local(async move {
            let result = if let Some(cid) = id {
                crate::api::update_customer(
                    &token,
                    &cid,
                    &UpdateCustomer {
                        name: Some(create_body.name),
                        email: Some(create_body.email),
                        phone: Some(create_body.phone),
                        address: Some(create_body.address),
                        city: Some(create_body.city),
                        zip: Some(create_body.zip),
                        country: Some(create_body.country),
                        currency: Some(create_body.currency),
                        notes: Some(create_body.notes),
                        ..Default::default()
                    },
                )
                .await
                .map(|_| ())
            } else {
                crate::api::create_customer(&token, &create_body)
                    .await
                    .map(|_| ())
            };

            match result {
                Ok(_) => {
                    show_form.set(false);
                    refresh();
                }
                Err(e) => error.set(Some(e)),
            }
        });
    };

    let delete_customer = move |id: String| {
        let Some(token) = auth.token_str() else { return };
        spawn_local(async move {
            if crate::api::delete_customer(&token, &id).await.is_ok() {
                refresh();
            }
        });
    };

    view! {
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">"Customers"</h1>
                <button
                    on:click=open_new
                    style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;"
                >
                    "+ New Customer"
                </button>
            </div>

            // Modal form
            {move || show_form.get().then(|| view! {
                <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:50;">
                    <div style="background:#fff;border-radius:12px;padding:28px;width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.15);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                            <h2 style="font-size:17px;font-weight:700;">
                                {move || if editing_id.get().is_some() { "Edit Customer" } else { "New Customer" }}
                            </h2>
                            <button on:click=move |_| show_form.set(false) style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">
                                "×"
                            </button>
                        </div>

                        {move || error.get().map(|e| view! {
                            <div style="background:#fef2f2;color:#dc2626;padding:10px;border-radius:6px;margin-bottom:16px;font-size:13px;">{e}</div>
                        })}

                        <form on:submit=save>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                                <FormField label="Name *" value=name />
                                <FormField label="Email" value=email />
                                <FormField label="Phone" value=phone />
                                <FormField label="Currency" value=currency />
                                <FormField label="Address" value=address />
                                <FormField label="City" value=city />
                                <FormField label="ZIP" value=zip />
                                <FormField label="Country" value=country />
                            </div>
                            <div style="margin-bottom:16px;">
                                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;">"Notes"</label>
                                <textarea
                                    rows="3"
                                    prop:value=move || notes.get()
                                    on:input=move |ev| notes.set(event_target_value(&ev))
                                    style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;resize:vertical;"
                                />
                            </div>
                            <div style="display:flex;justify-content:flex-end;gap:8px;">
                                <button type="button" on:click=move |_| show_form.set(false)
                                    style="padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;cursor:pointer;background:#fff;">
                                    "Cancel"
                                </button>
                                <button type="submit"
                                    style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
                                    "Save"
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            })}

            // Table
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                {move || if loading.get() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
                } else if customers.get().is_empty() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"No customers yet."</div> }.into_any()
                } else {
                    view! {
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;border-bottom:1px solid #f3f4f6;">
                                    <th style="text-align:left;padding:10px 20px;">"Name"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Email"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Country"</th>
                                    <th style="text-align:left;padding:10px 8px;">"Currency"</th>
                                    <th style="padding:10px 20px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {move || customers.get().into_iter().map(|c| {
                                    let id = c.id.to_string();
                                    let del_id = id.clone();
                                    let c_edit = c.clone();
                                    view! {
                                        <tr style="border-bottom:1px solid #f9fafb;">
                                            <td style="padding:10px 20px;font-weight:500;">{c.name.clone()}</td>
                                            <td style="padding:10px 8px;color:#6b7280;">{c.email.clone()}</td>
                                            <td style="padding:10px 8px;color:#6b7280;">{c.country.clone()}</td>
                                            <td style="padding:10px 8px;color:#6b7280;">{c.currency.clone()}</td>
                                            <td style="padding:10px 20px;text-align:right;">
                                                <button on:click=move |_| open_edit(&c_edit)
                                                    style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;margin-right:12px;">
                                                    "Edit"
                                                </button>
                                                <button on:click=move |_| delete_customer(del_id.clone())
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

#[component]
fn FormField(label: &'static str, value: RwSignal<String>) -> impl IntoView {
    view! {
        <div>
            <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;">{label}</label>
            <input
                type="text"
                prop:value=move || value.get()
                on:input=move |ev| value.set(event_target_value(&ev))
                style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
            />
        </div>
    }
}
