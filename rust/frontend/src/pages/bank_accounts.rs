use leptos::prelude::*;
use shared::{BankAccount, CreateBankAccount, UpdateBankAccount};
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn BankAccountsPage() -> impl IntoView {
    let auth = use_auth();
    let accounts = RwSignal::new(Vec::<BankAccount>::new());
    let loading = RwSignal::new(true);
    let show_form = RwSignal::new(false);
    let editing_id = RwSignal::new(Option::<String>::None);
    let error = RwSignal::new(Option::<String>::None);

    // Form fields
    let account_name = RwSignal::new(String::new());
    let bank_name = RwSignal::new(String::new());
    let iban = RwSignal::new(String::new());
    let bic_swift = RwSignal::new(String::new());
    let account_number = RwSignal::new(String::new());
    let sort_code = RwSignal::new(String::new());
    let currency = RwSignal::new("USD".to_string());
    let show_on_invoice = RwSignal::new(true);

    let refresh = move || {
        if let Some(token) = auth.token_str() {
            spawn_local(async move {
                if let Ok(data) = crate::api::list_bank_accounts(&token).await {
                    accounts.set(data);
                }
                loading.set(false);
            });
        }
    };

    Effect::new(move |_| refresh());

    let open_new = move |_| {
        editing_id.set(None);
        account_name.set(String::new());
        bank_name.set(String::new());
        iban.set(String::new());
        bic_swift.set(String::new());
        account_number.set(String::new());
        sort_code.set(String::new());
        currency.set("USD".into());
        show_on_invoice.set(true);
        show_form.set(true);
    };

    let open_edit = move |a: &BankAccount| {
        editing_id.set(Some(a.id.to_string()));
        account_name.set(a.account_name.clone());
        bank_name.set(a.bank_name.clone());
        iban.set(a.iban.clone());
        bic_swift.set(a.bic_swift.clone());
        account_number.set(a.account_number.clone());
        sort_code.set(a.sort_code.clone());
        currency.set(a.currency.clone());
        show_on_invoice.set(a.show_on_invoice);
        show_form.set(true);
    };

    let save = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let Some(token) = auth.token_str() else { return };
        let id = editing_id.get();

        error.set(None);
        let body = CreateBankAccount {
            account_name: account_name.get(),
            bank_name: bank_name.get(),
            bank_address: String::new(),
            iban: iban.get(),
            account_number: account_number.get(),
            sort_code: sort_code.get(),
            routing_number: String::new(),
            bic_swift: bic_swift.get(),
            currency: currency.get(),
            show_on_invoice: show_on_invoice.get(),
        };

        spawn_local(async move {
            let result = if let Some(aid) = id {
                crate::api::update_bank_account(&token, &aid, &UpdateBankAccount {
                    account_name: Some(body.account_name),
                    bank_name: Some(body.bank_name),
                    bank_address: Some(body.bank_address),
                    iban: Some(body.iban),
                    account_number: Some(body.account_number),
                    sort_code: Some(body.sort_code),
                    routing_number: Some(body.routing_number),
                    bic_swift: Some(body.bic_swift),
                    currency: Some(body.currency),
                    show_on_invoice: Some(body.show_on_invoice),
                }).await.map(|_| ())
            } else {
                crate::api::create_bank_account(&token, &body).await.map(|_| ())
            };

            match result {
                Ok(_) => { show_form.set(false); refresh(); }
                Err(e) => error.set(Some(e)),
            }
        });
    };

    let delete = move |id: String| {
        let Some(token) = auth.token_str() else { return };
        spawn_local(async move {
            if crate::api::delete_bank_account(&token, &id).await.is_ok() {
                refresh();
            }
        });
    };

    view! {
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">"Bank Accounts"</h1>
                <button on:click=open_new
                    style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
                    "+ Add Account"
                </button>
            </div>

            // Modal form
            {move || show_form.get().then(|| view! {
                <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:50;">
                    <div style="background:#fff;border-radius:12px;padding:28px;width:520px;max-height:90vh;overflow-y:auto;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                            <h2 style="font-size:17px;font-weight:700;">
                                {move || if editing_id.get().is_some() { "Edit Bank Account" } else { "New Bank Account" }}
                            </h2>
                            <button on:click=move |_| show_form.set(false) style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">"×"</button>
                        </div>

                        {move || error.get().map(|e| view! {
                            <div style="background:#fef2f2;color:#dc2626;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px;">{e}</div>
                        })}

                        <form on:submit=save>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                                <BankField label="Account Name" value=account_name />
                                <BankField label="Bank Name" value=bank_name />
                                <BankField label="IBAN" value=iban />
                                <BankField label="BIC/SWIFT" value=bic_swift />
                                <BankField label="Account Number" value=account_number />
                                <BankField label="Sort Code" value=sort_code />
                                <BankField label="Currency" value=currency />
                            </div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:20px;cursor:pointer;">
                                <input type="checkbox"
                                    prop:checked=move || show_on_invoice.get()
                                    on:change=move |ev| {
                                        use wasm_bindgen::JsCast;
                                        if let Some(el) = ev.target().and_then(|t| t.dyn_into::<web_sys::HtmlInputElement>().ok()) {
                                            show_on_invoice.set(el.checked());
                                        }
                                    }
                                />
                                "Show on invoice"
                            </label>
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

            // Cards
            {move || if loading.get() {
                view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
            } else if accounts.get().is_empty() {
                view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"No bank accounts yet."</div> }.into_any()
            } else {
                view! {
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
                        {move || accounts.get().into_iter().map(|a| {
                            let id = a.id.to_string();
                            let del_id = id.clone();
                            let a_edit = a.clone();
                            view! {
                                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
                                    <div style="font-weight:600;margin-bottom:4px;">{a.account_name.clone()}</div>
                                    <div style="font-size:12px;color:#64748b;margin-bottom:8px;">{a.bank_name.clone()}</div>
                                    {(!a.iban.is_empty()).then(|| view! {
                                        <div style="font-size:12px;color:#374151;">"IBAN: "{a.iban.clone()}</div>
                                    })}
                                    {(!a.bic_swift.is_empty()).then(|| view! {
                                        <div style="font-size:12px;color:#374151;">"BIC: "{a.bic_swift.clone()}</div>
                                    })}
                                    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:12px;">
                                        <button on:click=move |_| open_edit(&a_edit)
                                            style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;">
                                            "Edit"
                                        </button>
                                        <button on:click=move |_| delete(del_id.clone())
                                            style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;">
                                            "Delete"
                                        </button>
                                    </div>
                                </div>
                            }
                        }).collect_view()}
                    </div>
                }.into_any()
            }}
        </div>
    }
}

#[component]
fn BankField(label: &'static str, value: RwSignal<String>) -> impl IntoView {
    view! {
        <div>
            <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;">{label}</label>
            <input type="text"
                prop:value=move || value.get()
                on:input=move |ev| value.set(event_target_value(&ev))
                style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;"
            />
        </div>
    }
}
