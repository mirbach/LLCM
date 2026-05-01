use chrono::{DateTime, NaiveDate, Utc};
use uuid::Uuid;

// ── Local DB row types with sqlx::FromRow ─────────────────────────────────────
// These are used with sqlx::query_as::<_, T>() (runtime queries, no macros)
// to avoid requiring a live database at compile time.

#[derive(Debug, sqlx::FromRow)]
pub struct DbUser {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbCompany {
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

impl From<DbCompany> for shared::CompanySettings {
    fn from(r: DbCompany) -> Self {
        Self {
            id: r.id,
            user_id: r.user_id,
            name: r.name,
            address: r.address,
            city: r.city,
            state: r.state,
            zip: r.zip,
            country: r.country,
            phone: r.phone,
            email: r.email,
            website: r.website,
            logo_path: r.logo_path,
            tax_id: r.tax_id,
            invoice_prefix: r.invoice_prefix,
            next_invoice_number: r.next_invoice_number,
            next_customer_number: r.next_customer_number,
            footer_text: r.footer_text,
            accent_color: r.accent_color,
            wise_api_key: r.wise_api_key,
            wise_profile_id: r.wise_profile_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbCustomer {
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

impl From<DbCustomer> for shared::Customer {
    fn from(r: DbCustomer) -> Self {
        Self {
            id: r.id,
            user_id: r.user_id,
            customer_number: r.customer_number,
            name: r.name,
            email: r.email,
            phone: r.phone,
            address: r.address,
            city: r.city,
            state: r.state,
            zip: r.zip,
            country: r.country,
            title: r.title,
            contact_person: r.contact_person,
            currency: r.currency,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbInvoice {
    pub id: Uuid,
    pub user_id: Uuid,
    pub invoice_number: String,
    pub customer_id: Option<Uuid>,
    pub status: String, // cast to TEXT in SQL
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
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbInvoiceItem {
    pub id: Uuid,
    pub invoice_id: Uuid,
    pub description: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub amount: f64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbBankAccount {
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

impl From<DbBankAccount> for shared::BankAccount {
    fn from(r: DbBankAccount) -> Self {
        Self {
            id: r.id,
            user_id: r.user_id,
            account_name: r.account_name,
            bank_name: r.bank_name,
            bank_address: r.bank_address,
            iban: r.iban,
            account_number: r.account_number,
            sort_code: r.sort_code,
            routing_number: r.routing_number,
            bic_swift: r.bic_swift,
            currency: r.currency,
            show_on_invoice: r.show_on_invoice,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbTextBlock {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub content: String,
    pub content_de: String,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<DbTextBlock> for shared::TextBlock {
    fn from(r: DbTextBlock) -> Self {
        Self {
            id: r.id,
            user_id: r.user_id,
            title: r.title,
            content: r.content,
            content_de: r.content_de,
            is_default: r.is_default,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbWiseTransaction {
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

impl From<DbWiseTransaction> for shared::WiseTransaction {
    fn from(r: DbWiseTransaction) -> Self {
        Self {
            wise_id: r.wise_id,
            user_id: r.user_id,
            date: r.date,
            transaction_type: r.transaction_type,
            amount_value: r.amount_value,
            amount_currency: r.amount_currency,
            description: r.description,
            sender_name: r.sender_name,
            reference_number: r.reference_number,
            matched_invoice_id: r.matched_invoice_id,
            is_owners_withdrawal: r.is_owners_withdrawal,
            fetched_at: r.fetched_at,
        }
    }
}

// ── Helpers to convert DbInvoice + items + text_block_ids → shared::Invoice ───

#[derive(Debug, sqlx::FromRow)]
pub struct DbWiseConfig {
    pub wise_api_key: Option<String>,
    pub wise_profile_id: Option<String>,
}

pub fn db_invoice_to_shared(
    r: DbInvoice,
    items: Vec<DbInvoiceItem>,
    text_block_ids: Vec<Uuid>,
) -> shared::Invoice {
    shared::Invoice {
        id: r.id,
        user_id: r.user_id,
        invoice_number: r.invoice_number,
        customer_id: r.customer_id,
        status: r.status.parse().unwrap_or_default(),
        issue_date: r.issue_date,
        due_date: r.due_date,
        currency: r.currency,
        subtotal: r.subtotal,
        tax_rate: r.tax_rate,
        tax_amount: r.tax_amount,
        total: r.total,
        notes: r.notes,
        footer_text: r.footer_text,
        created_at: r.created_at,
        updated_at: r.updated_at,
        items: items
            .into_iter()
            .map(|i| shared::InvoiceItem {
                id: i.id,
                invoice_id: i.invoice_id,
                description: i.description,
                quantity: i.quantity,
                unit_price: i.unit_price,
                amount: i.amount,
            })
            .collect(),
        text_block_ids,
    }
}
