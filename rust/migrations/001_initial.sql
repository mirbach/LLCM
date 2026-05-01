-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Invoice status enum ───────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Company settings (one row per user) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name                  TEXT        NOT NULL DEFAULT '',
    address               TEXT        NOT NULL DEFAULT '',
    city                  TEXT        NOT NULL DEFAULT '',
    state                 TEXT        NOT NULL DEFAULT '',
    zip                   TEXT        NOT NULL DEFAULT '',
    country               TEXT        NOT NULL DEFAULT '',
    phone                 TEXT        NOT NULL DEFAULT '',
    email                 TEXT        NOT NULL DEFAULT '',
    website               TEXT        NOT NULL DEFAULT '',
    logo_path             TEXT,
    tax_id                TEXT        NOT NULL DEFAULT '',
    invoice_prefix        TEXT        NOT NULL DEFAULT 'INV-',
    next_invoice_number   INTEGER     NOT NULL DEFAULT 1,
    next_customer_number  INTEGER     NOT NULL DEFAULT 1,
    footer_text           TEXT        NOT NULL DEFAULT '',
    accent_color          TEXT        NOT NULL DEFAULT '#3b82f6',
    wise_api_key          TEXT,
    wise_profile_id       TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_number TEXT        NOT NULL DEFAULT '',
    name            TEXT        NOT NULL,
    email           TEXT        NOT NULL DEFAULT '',
    phone           TEXT        NOT NULL DEFAULT '',
    address         TEXT        NOT NULL DEFAULT '',
    city            TEXT        NOT NULL DEFAULT '',
    state           TEXT        NOT NULL DEFAULT '',
    zip             TEXT        NOT NULL DEFAULT '',
    country         TEXT        NOT NULL DEFAULT '',
    title           TEXT        NOT NULL DEFAULT '',
    contact_person  TEXT        NOT NULL DEFAULT '',
    currency        TEXT        NOT NULL DEFAULT 'USD',
    notes           TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_name    ON customers(user_id, name);

-- ── Invoices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number TEXT           NOT NULL,
    customer_id    UUID           REFERENCES customers(id) ON DELETE SET NULL,
    status         invoice_status NOT NULL DEFAULT 'draft',
    issue_date     DATE           NOT NULL DEFAULT CURRENT_DATE,
    due_date       DATE           NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    currency       TEXT           NOT NULL DEFAULT 'USD',
    subtotal       NUMERIC(12,2)  NOT NULL DEFAULT 0,
    tax_rate       NUMERIC(5,2)   NOT NULL DEFAULT 0,
    tax_amount     NUMERIC(12,2)  NOT NULL DEFAULT 0,
    total          NUMERIC(12,2)  NOT NULL DEFAULT 0,
    notes          TEXT           NOT NULL DEFAULT '',
    footer_text    TEXT           NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id    ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer   ON invoices(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(user_id, status);

-- ── Invoice line items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
    id          UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id  UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT           NOT NULL DEFAULT '',
    quantity    NUMERIC(10,3)  NOT NULL DEFAULT 1,
    unit_price  NUMERIC(12,2)  NOT NULL DEFAULT 0,
    amount      NUMERIC(12,2)  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ── Bank accounts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_name    TEXT        NOT NULL DEFAULT '',
    bank_name       TEXT        NOT NULL DEFAULT '',
    bank_address    TEXT        NOT NULL DEFAULT '',
    iban            TEXT        NOT NULL DEFAULT '',
    account_number  TEXT        NOT NULL DEFAULT '',
    sort_code       TEXT        NOT NULL DEFAULT '',
    routing_number  TEXT        NOT NULL DEFAULT '',
    bic_swift       TEXT        NOT NULL DEFAULT '',
    currency        TEXT        NOT NULL DEFAULT 'USD',
    show_on_invoice BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);

-- ── Text blocks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS text_blocks (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL DEFAULT '',
    content    TEXT        NOT NULL DEFAULT '',
    content_de TEXT        NOT NULL DEFAULT '',
    is_default BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_text_blocks_user ON text_blocks(user_id);

-- ── Invoice ↔ text block junction ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_text_blocks (
    invoice_id    UUID    NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    text_block_id UUID    NOT NULL REFERENCES text_blocks(id) ON DELETE CASCADE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(invoice_id, text_block_id)
);

-- ── Wise transactions (cache) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wise_transactions (
    wise_id              TEXT        PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                 TIMESTAMPTZ NOT NULL,
    transaction_type     TEXT        NOT NULL DEFAULT '',
    amount_value         NUMERIC(14,4) NOT NULL DEFAULT 0,
    amount_currency      TEXT        NOT NULL DEFAULT '',
    description          TEXT        NOT NULL DEFAULT '',
    sender_name          TEXT        NOT NULL DEFAULT '',
    reference_number     TEXT        NOT NULL DEFAULT '',
    matched_invoice_id   UUID        REFERENCES invoices(id) ON DELETE SET NULL,
    is_owners_withdrawal BOOLEAN     NOT NULL DEFAULT FALSE,
    fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wise_transactions_user ON wise_transactions(user_id);
