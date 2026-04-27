const express = require('express');
const router = express.Router();
const pool = require('../db');

const BACKUP_VERSION = 1;

// ── GET /api/backup ──────────────────────────────────────────────────────────
// Returns a full JSON snapshot of all data for download.
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const [company, customers, invoices, items] = await Promise.all([
      client.query('SELECT * FROM company_settings ORDER BY id LIMIT 1'),
      client.query('SELECT * FROM customers ORDER BY id'),
      client.query('SELECT * FROM invoices ORDER BY id'),
      client.query('SELECT * FROM invoice_items ORDER BY id'),
    ]);

    const backup = {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      company: company.rows[0] || null,
      customers: customers.rows,
      invoices: invoices.rows,
      invoice_items: items.rows,
    };

    const filename = `llcm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } finally {
    client.release();
  }
});

// ── POST /api/restore ────────────────────────────────────────────────────────
// Accepts a backup JSON body and restores all data inside a transaction.
// WARNING: This replaces all existing data.
router.post('/', async (req, res) => {
  const { version, company, customers = [], invoices = [], invoice_items = [] } = req.body;

  if (!version || version !== BACKUP_VERSION) {
    return res.status(400).json({ error: 'Invalid or unsupported backup file format' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clear tables in dependency order
    await client.query('DELETE FROM invoice_items');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM customers');

    // 2. Restore customers (preserve original IDs)
    for (const c of customers) {
      await client.query(
        `INSERT INTO customers
           (id, name, email, phone, address, city, state, zip, country, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [c.id, c.name, c.email, c.phone, c.address, c.city, c.state, c.zip, c.country, c.notes, c.created_at, c.updated_at],
      );
    }
    if (customers.length > 0) {
      const maxId = Math.max(...customers.map((c) => c.id));
      await client.query(`SELECT setval('customers_id_seq', $1)`, [maxId]);
    }

    // 3. Restore invoices (preserve original IDs)
    for (const inv of invoices) {
      await client.query(
        `INSERT INTO invoices
           (id, invoice_number, customer_id, status, issue_date, due_date, notes, footer_text,
            subtotal, tax_rate, tax_amount, total, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          inv.id, inv.invoice_number, inv.customer_id, inv.status,
          inv.issue_date, inv.due_date, inv.notes, inv.footer_text,
          inv.subtotal, inv.tax_rate, inv.tax_amount, inv.total,
          inv.created_at, inv.updated_at,
        ],
      );
    }
    if (invoices.length > 0) {
      const maxId = Math.max(...invoices.map((i) => i.id));
      await client.query(`SELECT setval('invoices_id_seq', $1)`, [maxId]);
    }

    // 4. Restore invoice items (preserve original IDs)
    for (const item of invoice_items) {
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [item.id, item.invoice_id, item.description, item.quantity, item.unit_price, item.amount],
      );
    }
    if (invoice_items.length > 0) {
      const maxId = Math.max(...invoice_items.map((i) => i.id));
      await client.query(`SELECT setval('invoice_items_id_seq', $1)`, [maxId]);
    }

    // 5. Restore company settings (single row — update in place)
    if (company) {
      await client.query(
        `UPDATE company_settings SET
           name=$1, address=$2, city=$3, state=$4, zip=$5, country=$6,
           phone=$7, email=$8, website=$9, tax_id=$10, invoice_prefix=$11,
           next_invoice_number=$12, footer_text=$13, updated_at=NOW()
         WHERE id=1`,
        [
          company.name, company.address, company.city, company.state, company.zip,
          company.country, company.phone, company.email, company.website, company.tax_id,
          company.invoice_prefix, company.next_invoice_number, company.footer_text,
        ],
      );
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      restored: {
        customers: customers.length,
        invoices: invoices.length,
        invoice_items: invoice_items.length,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Restore failed:', err);
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
