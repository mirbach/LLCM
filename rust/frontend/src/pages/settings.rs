use leptos::prelude::*;
use shared::UpdateCompanySettings;
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn SettingsPage() -> impl IntoView {
    let auth = use_auth();
    let loading = RwSignal::new(true);
    let saving = RwSignal::new(false);
    let error = RwSignal::new(Option::<String>::None);
    let success = RwSignal::new(false);

    // Company fields
    let company_name = RwSignal::new(String::new());
    let address = RwSignal::new(String::new());
    let city = RwSignal::new(String::new());
    let zip = RwSignal::new(String::new());
    let country = RwSignal::new(String::new());
    let phone = RwSignal::new(String::new());
    let email = RwSignal::new(String::new());
    let website = RwSignal::new(String::new());
    let tax_id = RwSignal::new(String::new());
    let invoice_prefix = RwSignal::new(String::new());
    let footer_text = RwSignal::new(String::new());
    let accent_color = RwSignal::new("#3b82f6".to_string());

    // Wise fields
    let wise_api_key = RwSignal::new(String::new());
    let wise_profile_id = RwSignal::new(String::new());
    let wise_test_result = RwSignal::new(Option::<String>::None);

    Effect::new(move |_| {
        if let Some(token) = auth.token_str() {
            spawn_local(async move {
                if let Ok(co) = crate::api::get_company(&token).await {
                    company_name.set(co.name);
                    address.set(co.address);
                    city.set(co.city);
                    zip.set(co.zip);
                    country.set(co.country);
                    phone.set(co.phone);
                    email.set(co.email);
                    website.set(co.website);
                    tax_id.set(co.tax_id);
                    invoice_prefix.set(co.invoice_prefix);
                    footer_text.set(co.footer_text);
                    accent_color.set(co.accent_color);
                }
                loading.set(false);
            });
        }
    });

    let save_company = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let Some(token) = auth.token_str() else { return };

        saving.set(true);
        error.set(None);
        success.set(false);

        let payload = UpdateCompanySettings {
            name: Some(company_name.get()),
            address: Some(address.get()),
            city: Some(city.get()),
            zip: Some(zip.get()),
            country: Some(country.get()),
            phone: Some(phone.get()),
            email: Some(email.get()),
            website: Some(website.get()),
            tax_id: Some(tax_id.get()),
            invoice_prefix: Some(invoice_prefix.get()),
            footer_text: Some(footer_text.get()),
            accent_color: Some(accent_color.get()),
            ..Default::default()
        };

        spawn_local(async move {
            match crate::api::update_company(&token, &payload).await {
                Ok(_) => success.set(true),
                Err(e) => error.set(Some(e)),
            }
            saving.set(false);
        });
    };

    let test_wise = move |_| {
        let Some(token) = auth.token_str() else { return };
        wise_test_result.set(None);
        spawn_local(async move {
            match crate::api::test_wise(&token).await {
                Ok(_) => wise_test_result.set(Some("Connection successful!".into())),
                Err(e) => wise_test_result.set(Some(format!("Error: {e}"))),
            }
        });
    };

    view! {
        <div style="max-width:700px;">
            <h1 style="font-size:22px;font-weight:700;margin-bottom:24px;">"Settings"</h1>

            {move || if loading.get() {
                view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
            } else {
                view! {
                    <div>
                        {move || error.get().map(|e| view! {
                            <div style="background:#fef2f2;color:#dc2626;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">{e}</div>
                        })}
                        {move || success.get().then(|| view! {
                            <div style="background:#f0fdf4;color:#16a34a;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">"Settings saved."</div>
                        })}

                        <form on:submit=save_company>
                            // Company info
                            <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;">
                                <div style="font-weight:600;margin-bottom:16px;">"Company Information"</div>
                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                                    <SettField label="Company Name" value=company_name />
                                    <SettField label="Tax ID / VAT" value=tax_id />
                                    <SettField label="Address" value=address />
                                    <SettField label="City" value=city />
                                    <SettField label="ZIP" value=zip />
                                    <SettField label="Country" value=country />
                                    <SettField label="Phone" value=phone />
                                    <SettField label="Email" value=email />
                                    <SettField label="Website" value=website />
                                    <SettField label="Invoice Prefix" value=invoice_prefix />
                                </div>
                            </section>

                            // Invoice defaults
                            <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;">
                                <div style="font-weight:600;margin-bottom:16px;">"Invoice Defaults"</div>
                                <div style="margin-bottom:12px;">
                                    <label style=LABEL>"Footer Text"</label>
                                    <textarea rows="3"
                                        prop:value=move || footer_text.get()
                                        on:input=move |ev| footer_text.set(event_target_value(&ev))
                                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;resize:vertical;"
                                    />
                                </div>
                                <div>
                                    <label style=LABEL>"Accent Color"</label>
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <input type="color"
                                            prop:value=move || accent_color.get()
                                            on:input=move |ev| accent_color.set(event_target_value(&ev))
                                            style="width:48px;height:36px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;padding:2px;"
                                        />
                                        <span style="font-size:13px;color:#64748b;">{move || accent_color.get()}</span>
                                    </div>
                                </div>
                            </section>

                            <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
                                <button type="submit" disabled=move || saving.get()
                                    style="background:#3b82f6;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
                                    {move || if saving.get() { "Saving…" } else { "Save Settings" }}
                                </button>
                            </div>
                        </form>

                        // Wise config
                        <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;">
                            <div style="font-weight:600;margin-bottom:16px;">"Wise Integration"</div>
                            <p style="font-size:13px;color:#64748b;margin-bottom:16px;">
                                "Connect your Wise account to automatically import transactions and match them to invoices."
                            </p>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                                <div>
                                    <label style=LABEL>"API Key"</label>
                                    <input type="password"
                                        prop:value=move || wise_api_key.get()
                                        on:input=move |ev| wise_api_key.set(event_target_value(&ev))
                                        placeholder="sk-xxxxxxxx"
                                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
                                    />
                                </div>
                                <div>
                                    <label style=LABEL>"Profile ID"</label>
                                    <input type="text"
                                        prop:value=move || wise_profile_id.get()
                                        on:input=move |ev| wise_profile_id.set(event_target_value(&ev))
                                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
                                    />
                                </div>
                            </div>
                            {move || wise_test_result.get().map(|msg| {
                                let is_ok = !msg.starts_with("Error");
                                let style = if is_ok {
                                    "background:#f0fdf4;color:#16a34a;padding:10px;border-radius:6px;font-size:13px;margin-bottom:12px;"
                                } else {
                                    "background:#fef2f2;color:#dc2626;padding:10px;border-radius:6px;font-size:13px;margin-bottom:12px;"
                                };
                                view! { <div style=style>{msg}</div> }
                            })}
                            <button on:click=test_wise
                                style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;background:#fff;color:#374151;">
                                "Test Connection"
                            </button>
                        </section>
                    </div>
                }.into_any()
            }}
        </div>
    }
}

#[component]
fn SettField(label: &'static str, value: RwSignal<String>) -> impl IntoView {
    view! {
        <div>
            <label style=LABEL>{label}</label>
            <input type="text"
                prop:value=move || value.get()
                on:input=move |ev| value.set(event_target_value(&ev))
                style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
            />
        </div>
    }
}

const LABEL: &str = "display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;";
