require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const companyRoutes = require('./routes/company');
const customersRoutes = require('./routes/customers');
const invoicesRoutes = require('./routes/invoices');
const backupRoutes = require('./routes/backup');
const bankAccountRoutes = require('./routes/bankAccount');
const textBlocksRoutes = require('./routes/textBlocks');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve uploaded logo files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/company', companyRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/text-blocks', textBlocksRoutes);

// Global error handler (must be last)
app.use(errorHandler);

async function runMigrations() {
  await pool.query(`
    ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#3b82f6'
  `);

  await pool.query(`
    ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS wise_api_key TEXT
  `);
  await pool.query(`
    ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS wise_profile_id VARCHAR(100)
  `);

  // Currency on customers and invoices
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD'
  `);
  await pool.query(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD'
  `);

  // Bank accounts table
  await pool.query(`
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
    )
  `);

  await pool.query(`
    ALTER TABLE bank_accounts
    ADD COLUMN IF NOT EXISTS bank_address TEXT NOT NULL DEFAULT ''
  `);

  // Customer numbering (K-000001, K-000002, …)
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS customer_number_seq START 1
  `);
  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS customer_number VARCHAR(12)
  `);
  // Back-fill existing customers that have no number yet
  await pool.query(`
    UPDATE customers
    SET customer_number = 'K-' || LPAD(nextval('customer_number_seq')::text, 6, '0')
    WHERE customer_number IS NULL
  `);

  // Wise transactions cache
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wise_transactions (
      wise_id          VARCHAR(255) PRIMARY KEY,
      date             TIMESTAMPTZ,
      type             VARCHAR(20),
      amount_value     NUMERIC(14,2),
      amount_currency  VARCHAR(10),
      description      TEXT DEFAULT '',
      sender_name      TEXT DEFAULT '',
      reference_number VARCHAR(255) DEFAULT '',
      matched_invoice_id      INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      matched_invoice_number  VARCHAR(50),
      fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS text_blocks (
      id         SERIAL PRIMARY KEY,
      title      VARCHAR(255) NOT NULL DEFAULT '',
      content    TEXT         NOT NULL DEFAULT '',
      content_de TEXT         NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  // Add content_de to existing text_blocks tables (idempotent)
  await pool.query(`
    ALTER TABLE text_blocks ADD COLUMN IF NOT EXISTS content_de TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE text_blocks ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_text_blocks (
      id             SERIAL PRIMARY KEY,
      invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      text_block_id  INTEGER NOT NULL REFERENCES text_blocks(id) ON DELETE CASCADE,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      UNIQUE (invoice_id, text_block_id)
    )
  `);

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255) NOT NULL DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS title VARCHAR(20) NOT NULL DEFAULT ''
  `);
}

runMigrations()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Startup migration failed:', err);
    process.exit(1);
  });
