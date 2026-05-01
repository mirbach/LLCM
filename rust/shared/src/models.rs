use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Invoice status ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum InvoiceStatus {
    #[default]
    Draft,
    Sent,
    Paid,
    Overdue,
}

impl std::fmt::Display for InvoiceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InvoiceStatus::Draft => write!(f, "draft"),
            InvoiceStatus::Sent => write!(f, "sent"),
            InvoiceStatus::Paid => write!(f, "paid"),
            InvoiceStatus::Overdue => write!(f, "overdue"),
        }
    }
}

impl std::str::FromStr for InvoiceStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "draft" => Ok(Self::Draft),
            "sent" => Ok(Self::Sent),
            "paid" => Ok(Self::Paid),
            "overdue" => Ok(Self::Overdue),
            other => Err(format!("Unknown status: {other}")),
        }
    }
}

// ── User ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

// ── Company settings (one row per user) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompanySettings {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub address: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub country: String,
    pub phone: String,
    pub email: String,
    pub website: String,
    pub logo_path: Option<String>,
    pub tax_id: String,
    pub invoice_prefix: String,
    pub next_invoice_number: i32,
    pub next_customer_number: i32,
    pub footer_text: String,
    pub accent_color: String,
    pub wise_api_key: Option<String>,
    pub wise_profile_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Customer ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: Uuid,
    pub user_id: Uuid,
    pub customer_number: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub address: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub country: String,
    pub title: String,
    pub contact_person: String,
    pub currency: String,
    pub notes: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Invoice + related ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceItem {
    pub id: Uuid,
    pub invoice_id: Uuid,
    pub description: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: Uuid,
    pub user_id: Uuid,
    pub invoice_number: String,
    pub customer_id: Option<Uuid>,
    pub status: InvoiceStatus,
    pub issue_date: NaiveDate,
    pub due_date: NaiveDate,
    pub currency: String,
    pub subtotal: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub total: f64,
    pub notes: String,
    pub footer_text: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Populated when fetching a single invoice
    #[serde(default)]
    pub items: Vec<InvoiceItem>,
    /// Text block IDs linked to this invoice
    #[serde(default)]
    pub text_block_ids: Vec<Uuid>,
}

// ── Bank account ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankAccount {
    pub id: Uuid,
    pub user_id: Uuid,
    pub account_name: String,
    pub bank_name: String,
    pub bank_address: String,
    pub iban: String,
    pub account_number: String,
    pub sort_code: String,
    pub routing_number: String,
    pub bic_swift: String,
    pub currency: String,
    pub show_on_invoice: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Text block ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBlock {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub content: String,
    pub content_de: String,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Wise transaction (cached) ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiseTransaction {
    pub wise_id: String,
    pub user_id: Uuid,
    pub date: DateTime<Utc>,
    pub transaction_type: String,
    pub amount_value: f64,
    pub amount_currency: String,
    pub description: String,
    pub sender_name: String,
    pub reference_number: String,
    pub matched_invoice_id: Option<Uuid>,
    pub is_owners_withdrawal: bool,
    pub fetched_at: DateTime<Utc>,
}

// ── Net income report ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetIncomeBucket {
    pub currency: String,
    pub invoice_receipts: f64,
    pub bank_receipts: f64,
    pub expenses: f64,
    pub owner_withdrawals: f64,
    pub net_income: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetIncomeReport {
    pub period: String,
    pub buckets: Vec<NetIncomeBucket>,
}

// ── Auth ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub token_type: String,
    pub user: User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenClaims {
    pub sub: Uuid,
    pub exp: i64,
    pub iat: i64,
    pub kind: String, // "access" | "refresh"
}

// ── Backup ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BackupData {
    pub company: Option<CompanySettings>,
    pub customers: Vec<Customer>,
    pub invoices: Vec<Invoice>,
    pub bank_accounts: Vec<BankAccount>,
    pub text_blocks: Vec<TextBlock>,
    pub wise_transactions: Vec<WiseTransaction>,
}
