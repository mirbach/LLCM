-- Invoice status enum
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- Company settings (always a single row)
CREATE TABLE IF NOT EXISTS company_settings (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(255) NOT NULL DEFAULT '',
  address             VARCHAR(500) DEFAULT '',
  city                VARCHAR(100) DEFAULT '',
  state               VARCHAR(100) DEFAULT '',
  zip                 VARCHAR(20)  DEFAULT '',
  country             VARCHAR(100) DEFAULT '',
  phone               VARCHAR(50)  DEFAULT '',
  email               VARCHAR(255) DEFAULT '',
  website             VARCHAR(255) DEFAULT '',
  logo_path           VARCHAR(500) DEFAULT NULL,
  tax_id              VARCHAR(100) DEFAULT '',
  invoice_prefix      VARCHAR(20)  NOT NULL DEFAULT 'INV-',
  next_invoice_number INTEGER      NOT NULL DEFAULT 1,
  footer_text         TEXT         DEFAULT '',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default company row
INSERT INTO company_settings (name)
SELECT 'My LLC'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) DEFAULT '',
  phone      VARCHAR(50)  DEFAULT '',
  address    VARCHAR(500) DEFAULT '',
  city       VARCHAR(100) DEFAULT '',
  state      VARCHAR(100) DEFAULT '',
  zip        VARCHAR(20)  DEFAULT '',
  country    VARCHAR(100) DEFAULT '',
  notes      TEXT         DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50)     NOT NULL UNIQUE,
  customer_id    INTEGER         REFERENCES customers(id) ON DELETE SET NULL,
  status         invoice_status  NOT NULL DEFAULT 'draft',
  issue_date     DATE            NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE            NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  notes          TEXT            DEFAULT '',
  footer_text    TEXT            DEFAULT '',
  subtotal       NUMERIC(12, 2)  NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(5, 2)   NOT NULL DEFAULT 0,
  tax_amount     NUMERIC(12, 2)  NOT NULL DEFAULT 0,
  total          NUMERIC(12, 2)  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INTEGER        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT           NOT NULL DEFAULT '',
  quantity    NUMERIC(10, 3) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- Bank accounts (multiple, each optionally shown on invoices)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id             SERIAL PRIMARY KEY,
  account_name   VARCHAR(255) NOT NULL DEFAULT '',
  bank_name      VARCHAR(255) NOT NULL DEFAULT '',
  bank_address   TEXT         NOT NULL DEFAULT '',
  iban           VARCHAR(100) DEFAULT '',
  account_number VARCHAR(100) DEFAULT '',
  sort_code      VARCHAR(50)  DEFAULT '',
  routing_number VARCHAR(50)  DEFAULT '',
  bic_swift      VARCHAR(20)  DEFAULT '',
  currency       VARCHAR(10)  NOT NULL DEFAULT 'USD',
  show_on_invoice BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
