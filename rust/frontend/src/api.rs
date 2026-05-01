/// Base URL for API calls.
/// In production nginx proxies /api → backend:4000.
/// In dev (trunk serve --proxy-backend) set API_BASE at build time or use localhost.
const API_BASE: &str = "/api";

use gloo_net::http::Request;
use serde::{de::DeserializeOwned, Serialize};

use shared::{
    AuthResponse, BackupData, BankAccount, CompanySettings, CreateCustomer, CreateInvoice,
    Customer, Invoice, InvoiceStatus, LoginRequest, NetIncomeReport, RegisterRequest,
    SendInvoiceRequest, TextBlock, UpdateCompanySettings, UpdateCustomer, UpdateInvoice,
    UpdateInvoiceStatus, WiseTransaction,
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

pub async fn register(body: &RegisterRequest) -> Result<AuthResponse, String> {
    post_json("/auth/register", body).await
}

pub async fn login(body: &LoginRequest) -> Result<AuthResponse, String> {
    post_json("/auth/login", body).await
}

pub async fn refresh(refresh_token: &str) -> Result<AuthResponse, String> {
    post_json("/auth/refresh", &serde_json::json!({ "refresh_token": refresh_token })).await
}

// ── Company ───────────────────────────────────────────────────────────────────

pub async fn get_company(token: &str) -> Result<CompanySettings, String> {
    auth_get(token, "/company").await
}

pub async fn update_company(token: &str, body: &UpdateCompanySettings) -> Result<CompanySettings, String> {
    auth_put(token, "/company", body).await
}

// ── Customers ─────────────────────────────────────────────────────────────────

pub async fn list_customers(token: &str) -> Result<Vec<Customer>, String> {
    auth_get(token, "/customers").await
}

pub async fn get_customer(token: &str, id: &str) -> Result<Customer, String> {
    auth_get(token, &format!("/customers/{id}")).await
}

pub async fn create_customer(token: &str, body: &CreateCustomer) -> Result<Customer, String> {
    auth_post(token, "/customers", body).await
}

pub async fn update_customer(token: &str, id: &str, body: &UpdateCustomer) -> Result<Customer, String> {
    auth_put(token, &format!("/customers/{id}"), body).await
}

pub async fn delete_customer(token: &str, id: &str) -> Result<(), String> {
    auth_delete(token, &format!("/customers/{id}")).await
}

// ── Invoices ──────────────────────────────────────────────────────────────────

pub async fn list_invoices(token: &str, status: Option<&str>) -> Result<Vec<Invoice>, String> {
    let url = match status {
        Some(s) => format!("/invoices?status={s}"),
        None => "/invoices".to_string(),
    };
    auth_get(token, &url).await
}

pub async fn get_invoice(token: &str, id: &str) -> Result<Invoice, String> {
    auth_get(token, &format!("/invoices/{id}")).await
}

pub async fn create_invoice(token: &str, body: &CreateInvoice) -> Result<Invoice, String> {
    auth_post(token, "/invoices", body).await
}

pub async fn update_invoice(token: &str, id: &str, body: &UpdateInvoice) -> Result<Invoice, String> {
    auth_put(token, &format!("/invoices/{id}"), body).await
}

pub async fn update_invoice_status(
    token: &str,
    id: &str,
    status: InvoiceStatus,
) -> Result<Invoice, String> {
    auth_put(token, &format!("/invoices/{id}/status"), &UpdateInvoiceStatus { status: status.to_string() }).await
}

pub async fn delete_invoice(token: &str, id: &str) -> Result<(), String> {
    auth_delete(token, &format!("/invoices/{id}")).await
}

pub async fn send_invoice(token: &str, id: &str, body: &SendInvoiceRequest) -> Result<(), String> {
    let resp = Request::post(&format!("{API_BASE}/invoices/{id}/send"))
        .header("Authorization", &format!("Bearer {token}"))
        .json(body)
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.ok() {
        Ok(())
    } else {
        let err: serde_json::Value = resp.json().await.unwrap_or_default();
        Err(err["error"].as_str().unwrap_or("Failed to send").to_string())
    }
}

/// Returns a PDF download URL (to open in a new tab).
pub fn invoice_pdf_url(id: &str) -> String {
    format!("{API_BASE}/invoices/{id}/pdf")
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

pub async fn list_bank_accounts(token: &str) -> Result<Vec<BankAccount>, String> {
    auth_get(token, "/bank-accounts").await
}

pub async fn create_bank_account(
    token: &str,
    body: &shared::CreateBankAccount,
) -> Result<BankAccount, String> {
    auth_post(token, "/bank-accounts", body).await
}

pub async fn update_bank_account(
    token: &str,
    id: &str,
    body: &shared::UpdateBankAccount,
) -> Result<BankAccount, String> {
    auth_put(token, &format!("/bank-accounts/{id}"), body).await
}

pub async fn delete_bank_account(token: &str, id: &str) -> Result<(), String> {
    auth_delete(token, &format!("/bank-accounts/{id}")).await
}

pub async fn get_wise_transactions(token: &str) -> Result<Vec<WiseTransaction>, String> {
    auth_get(token, "/bank-accounts/wise/transactions/saved").await
}

pub async fn test_wise(token: &str) -> Result<(), String> {
    let resp = Request::post(&format!("{API_BASE}/bank-accounts/wise/test"))
        .header("Authorization", &format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.ok() { Ok(()) } else {
        let err: serde_json::Value = resp.json().await.unwrap_or_default();
        Err(err["error"].as_str().unwrap_or("Failed").to_string())
    }
}

// ── Text Blocks ───────────────────────────────────────────────────────────────

pub async fn list_text_blocks(token: &str) -> Result<Vec<TextBlock>, String> {
    auth_get(token, "/text-blocks").await
}

pub async fn create_text_block(
    token: &str,
    body: &shared::CreateTextBlock,
) -> Result<TextBlock, String> {
    auth_post(token, "/text-blocks", body).await
}

pub async fn update_text_block(
    token: &str,
    id: &str,
    body: &shared::UpdateTextBlock,
) -> Result<TextBlock, String> {
    auth_put(token, &format!("/text-blocks/{id}"), body).await
}

pub async fn delete_text_block(token: &str, id: &str) -> Result<(), String> {
    auth_delete(token, &format!("/text-blocks/{id}")).await
}

// ── Net Income ────────────────────────────────────────────────────────────────

pub async fn get_net_income(token: &str, period: &str) -> Result<NetIncomeReport, String> {
    auth_get(token, &format!("/net-income?period={period}")).await
}

pub async fn get_net_income_years(token: &str) -> Result<Vec<i32>, String> {
    auth_get(token, "/net-income/years").await
}

// ── Backup ────────────────────────────────────────────────────────────────────

pub async fn download_backup(token: &str) -> Result<BackupData, String> {
    auth_get(token, "/backup").await
}

// ── Generic HTTP helpers ──────────────────────────────────────────────────────

async fn auth_get<T: DeserializeOwned>(token: &str, path: &str) -> Result<T, String> {
    let resp = Request::get(&format!("{API_BASE}{path}"))
        .header("Authorization", &format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_response(resp).await
}

async fn auth_post<B: Serialize, T: DeserializeOwned>(
    token: &str,
    path: &str,
    body: &B,
) -> Result<T, String> {
    let resp = Request::post(&format!("{API_BASE}{path}"))
        .header("Authorization", &format!("Bearer {token}"))
        .json(body)
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_response(resp).await
}

async fn auth_put<B: Serialize, T: DeserializeOwned>(
    token: &str,
    path: &str,
    body: &B,
) -> Result<T, String> {
    let resp = Request::put(&format!("{API_BASE}{path}"))
        .header("Authorization", &format!("Bearer {token}"))
        .json(body)
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_response(resp).await
}

async fn auth_delete(token: &str, path: &str) -> Result<(), String> {
    let resp = Request::delete(&format!("{API_BASE}{path}"))
        .header("Authorization", &format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.ok() {
        Ok(())
    } else {
        let err: serde_json::Value = resp.json().await.unwrap_or_default();
        Err(err["error"].as_str().unwrap_or("Request failed").to_string())
    }
}

async fn post_json<B: Serialize, T: DeserializeOwned>(path: &str, body: &B) -> Result<T, String> {
    let resp = Request::post(&format!("{API_BASE}{path}"))
        .json(body)
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_response(resp).await
}

async fn parse_response<T: DeserializeOwned>(resp: gloo_net::http::Response) -> Result<T, String> {
    if resp.ok() {
        resp.json::<T>().await.map_err(|e| e.to_string())
    } else {
        let err: serde_json::Value = resp.json().await.unwrap_or_default();
        Err(err["error"].as_str().unwrap_or("Request failed").to_string())
    }
}
