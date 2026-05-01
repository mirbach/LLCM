use leptos::prelude::*;
use shared::NetIncomeReport;
use wasm_bindgen_futures::spawn_local;

use crate::auth::use_auth;

#[component]
pub fn NetIncomePage() -> impl IntoView {
    let auth = use_auth();
    let report = RwSignal::new(Option::<NetIncomeReport>::None);
    let years = RwSignal::new(Vec::<i32>::new());
    let period = RwSignal::new("all".to_string());
    let loading = RwSignal::new(true);

    // Load years list on mount
    Effect::new(move |_| {
        if let Some(token) = auth.token_str() {
            spawn_local(async move {
                if let Ok(ys) = crate::api::get_net_income_years(&token).await {
                    years.set(ys);
                }
            });
        }
    });

    // Reload report whenever period changes
    Effect::new(move |_| {
        let p = period.get();
        if let Some(token) = auth.token_str() {
            loading.set(true);
            spawn_local(async move {
                if let Ok(r) = crate::api::get_net_income(&token, &p).await {
                    report.set(Some(r));
                }
                loading.set(false);
            });
        }
    });

    view! {
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                <h1 style="font-size:22px;font-weight:700;">"Net Income"</h1>
                <a
                    href=move || format!("/api/net-income/pdf?period={}", period.get())
                    target="_blank"
                    style="background:#fff;color:#64748b;border:1px solid #e5e7eb;padding:8px 16px;border-radius:8px;font-size:13px;text-decoration:none;"
                >
                    "Download PDF"
                </a>
            </div>

            // Period selector
            <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
                {move || {
                    let mut tabs: Vec<String> = vec!["all".into(), "this_month".into(), "this_year".into()];
                    for y in years.get() {
                        tabs.push(format!("year_{y}"));
                    }
                    tabs.into_iter().map(|tab| {
                        let tab2 = tab.clone();
                        let label = period_label(&tab);
                        view! {
                            <button
                                on:click=move |_| period.set(tab2.clone())
                                style=move || {
                                    let is_active = period.get() == tab;
                                    if is_active {
                                        "background:#3b82f6;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;"
                                    } else {
                                        "background:#fff;color:#64748b;border:1px solid #e5e7eb;padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;"
                                    }
                                }
                            >
                                {label}
                            </button>
                        }
                    }).collect_view()
                }}
            </div>

            // Report table
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                {move || if loading.get() {
                    view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"Loading…"</div> }.into_any()
                } else {
                    match report.get() {
                        None => view! { <div style="padding:40px;text-align:center;color:#9ca3af;">"No data available."</div> }.into_any(),
                        Some(r) => view! {
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead>
                                    <tr style="color:#9ca3af;font-size:11px;text-transform:uppercase;border-bottom:1px solid #f3f4f6;">
                                        <th style="text-align:left;padding:10px 20px;">"Currency"</th>
                                        <th style="text-align:right;padding:10px 12px;">"Invoice Receipts"</th>
                                        <th style="text-align:right;padding:10px 12px;">"Bank Receipts"</th>
                                        <th style="text-align:right;padding:10px 12px;">"Expenses"</th>
                                        <th style="text-align:right;padding:10px 12px;">"Withdrawals"</th>
                                        <th style="text-align:right;padding:10px 20px;">"Net Income"</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {r.buckets.into_iter().map(|b| {
                                        let net_style = if b.net_income >= 0.0 {
                                            "font-weight:700;color:#16a34a;"
                                        } else {
                                            "font-weight:700;color:#dc2626;"
                                        };
                                        view! {
                                            <tr style="border-bottom:1px solid #f9fafb;">
                                                <td style="padding:10px 20px;font-weight:600;">{b.currency.clone()}</td>
                                                <td style="padding:10px 12px;text-align:right;">{format!("{:.2}", b.invoice_receipts)}</td>
                                                <td style="padding:10px 12px;text-align:right;">{format!("{:.2}", b.bank_receipts)}</td>
                                                <td style="padding:10px 12px;text-align:right;">{format!("{:.2}", b.expenses)}</td>
                                                <td style="padding:10px 12px;text-align:right;">{format!("{:.2}", b.owner_withdrawals)}</td>
                                                <td style=format!("padding:10px 20px;text-align:right;{net_style}")>
                                                    {format!("{:.2}", b.net_income)}
                                                </td>
                                            </tr>
                                        }
                                    }).collect_view()}
                                </tbody>
                            </table>
                        }.into_any(),
                    }
                }}
            </div>
        </div>
    }
}

fn period_label(period: &str) -> String {
    match period {
        "all" => "All Time".into(),
        "this_month" => "This Month".into(),
        "this_year" => "This Year".into(),
        s if s.starts_with("year_") => s[5..].to_string(),
        other => other.to_string(),
    }
}
