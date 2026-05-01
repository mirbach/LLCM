use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ── Auth ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

// ── Company ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCompanySettings {
    pub name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub tax_id: Option<String>,
    pub invoice_prefix: Option<String>,
    pub footer_text: Option<String>,
    pub accent_color: Option<String>,
}

/// Alias for backwards compatibility
pub type UpdateCompany = UpdateCompanySettings;

// ── Customers ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateCustomer {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub zip: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub contact_person: String,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCustomer {
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country: Option<String>,
    pub title: Option<String>,
    pub contact_person: Option<String>,
    pub currency: Option<String>,
    pub notes: Option<String>,
}

// ── Invoices ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInvoiceItem {
    pub description: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInvoice {
    pub customer_id: Option<Uuid>,
    #[serde(default = "today")]
    pub issue_date: NaiveDate,
    #[serde(default = "in_30_days")]
    pub due_date: NaiveDate,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default)]
    pub tax_rate: f64,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub footer_text: String,
    #[serde(default)]
    pub items: Vec<CreateInvoiceItem>,
    #[serde(default)]
    pub text_block_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateInvoice {
    pub customer_id: Option<Option<Uuid>>,
    pub issue_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub currency: Option<String>,
    pub tax_rate: Option<f64>,
    pub notes: Option<String>,
    pub footer_text: Option<String>,
    pub items: Option<Vec<CreateInvoiceItem>>,
    pub text_block_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInvoiceStatus {
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfFromHtml {
    pub html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendInvoiceRequest {
    pub to: String,
    pub subject: Option<String>,
    pub body: Option<String>,
}

// ── Bank accounts ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateBankAccount {
    #[validate(length(min = 1, message = "Account name is required"))]
    pub account_name: String,
    #[serde(default)]
    pub bank_name: String,
    #[serde(default)]
    pub bank_address: String,
    #[serde(default)]
    pub iban: String,
    #[serde(default)]
    pub account_number: String,
    #[serde(default)]
    pub sort_code: String,
    #[serde(default)]
    pub routing_number: String,
    #[serde(default)]
    pub bic_swift: String,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default = "default_true")]
    pub show_on_invoice: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateBankAccount {
    pub account_name: Option<String>,
    pub bank_name: Option<String>,
    pub bank_address: Option<String>,
    pub iban: Option<String>,
    pub account_number: Option<String>,
    pub sort_code: Option<String>,
    pub routing_number: Option<String>,
    pub bic_swift: Option<String>,
    pub currency: Option<String>,
    pub show_on_invoice: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiseConfig {
    pub api_key: String,
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagWithdrawal {
    pub is_owners_withdrawal: bool,
}

// ── Text blocks ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateTextBlock {
    #[validate(length(min = 1, message = "Title is required"))]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub content_de: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateTextBlock {
    pub title: Option<String>,
    pub content: Option<String>,
    pub content_de: Option<String>,
    pub is_default: Option<bool>,
}

// ── Net income ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetIncomeQuery {
    pub period: Option<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn default_currency() -> String {
    "USD".to_string()
}

fn default_true() -> bool {
    true
}

fn today() -> NaiveDate {
    chrono::Utc::now().date_naive()
}

fn in_30_days() -> NaiveDate {
    chrono::Utc::now().date_naive() + chrono::Duration::days(30)
}
