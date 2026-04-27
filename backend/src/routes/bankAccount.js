const express = require('express');
const router = express.Router();
const pool = require('../db');
const https = require('https');

// ─── Helper: call Wise API ───────────────────────────────────────────────────

function wiseRequest(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.wise.com',
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Bank Account CRUD ───────────────────────────────────────────────────────

// GET /api/bank-accounts
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bank_accounts ORDER BY id');
  res.json(rows);
});

// POST /api/bank-accounts
router.post('/', async (req, res) => {
  const {
    account_name, bank_name, bank_address, iban, account_number,
    sort_code, routing_number, bic_swift, currency, show_on_invoice,
  } = req.body;
  if (!account_name?.trim()) return res.status(400).json({ error: 'Account name is required' });

  const { rows } = await pool.query(
    `INSERT INTO bank_accounts
       (account_name, bank_name, bank_address, iban, account_number, sort_code, routing_number, bic_swift, currency, show_on_invoice)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      account_name, bank_name || '', bank_address || '', iban || '', account_number || '',
      sort_code || '', routing_number || '', bic_swift || '',
      currency || 'USD', show_on_invoice !== false,
    ],
  );
  res.status(201).json(rows[0]);
});

// PUT /api/bank-accounts/:id
router.put('/:id', async (req, res) => {
  const {
    account_name, bank_name, bank_address, iban, account_number,
    sort_code, routing_number, bic_swift, currency, show_on_invoice,
  } = req.body;
  if (!account_name?.trim()) return res.status(400).json({ error: 'Account name is required' });

  const { rows } = await pool.query(
    `UPDATE bank_accounts
     SET account_name=$1, bank_name=$2, bank_address=$3, iban=$4, account_number=$5, sort_code=$6,
         routing_number=$7, bic_swift=$8, currency=$9, show_on_invoice=$10, updated_at=NOW()
     WHERE id=$11
     RETURNING *`,
    [
      account_name, bank_name || '', bank_address || '', iban || '', account_number || '',
      sort_code || '', routing_number || '', bic_swift || '',
      currency || 'USD', show_on_invoice !== false, req.params.id,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Bank account not found' });
  res.json(rows[0]);
});

// DELETE /api/bank-accounts/:id
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM bank_accounts WHERE id=$1', [req.params.id]);
  res.status(204).send();
});

// ─── Wise Configuration ──────────────────────────────────────────────────────

// GET /api/bank-accounts/wise/config
router.get('/wise/config', async (req, res) => {
  const { rows: [row] } = await pool.query(
    'SELECT wise_profile_id, wise_api_key FROM company_settings LIMIT 1',
  );
  res.json({
    wise_profile_id: row?.wise_profile_id || '',
    // Never return the real key — mask it so the frontend knows one is saved
    wise_api_key_saved: !!(row?.wise_api_key),
  });
});

// PUT /api/bank-accounts/wise/config
router.put('/wise/config', async (req, res) => {
  const { wise_api_key, wise_profile_id } = req.body;
  if (!wise_profile_id?.trim()) return res.status(400).json({ error: 'Profile ID is required' });

  // Only overwrite the key if a new one was actually provided
  if (wise_api_key && wise_api_key.trim()) {
    await pool.query(
      'UPDATE company_settings SET wise_api_key=$1, wise_profile_id=$2, updated_at=NOW()',
      [wise_api_key.trim(), wise_profile_id.trim()],
    );
  } else {
    await pool.query(
      'UPDATE company_settings SET wise_profile_id=$1, updated_at=NOW()',
      [wise_profile_id.trim()],
    );
  }
  res.json({ success: true });
});

// POST /api/bank-accounts/wise/test — verify API key works
router.post('/wise/test', async (req, res) => {
  const { rows: [row] } = await pool.query(
    'SELECT wise_api_key FROM company_settings LIMIT 1',
  );
  if (!row?.wise_api_key) return res.status(400).json({ error: 'No Wise API key saved' });

  const { status, body } = await wiseRequest('/v1/profiles', row.wise_api_key);
  if (status !== 200) {
    return res.status(400).json({ error: 'Wise API rejected the key', detail: body });
  }
  res.json({ success: true, profiles: body });
});

// ─── Wise Transactions ───────────────────────────────────────────────────────

// GET /api/bank-accounts/wise/transactions/saved?currency=EUR
// Returns previously fetched (persisted) transactions without calling Wise
router.get('/wise/transactions/saved', async (req, res) => {
  const { currency } = req.query;

  // Re-match against current invoices every time we serve saved transactions
  const { rows: invoices } = await pool.query(
    `SELECT id, invoice_number, total, due_date, currency
     FROM invoices
     WHERE status IN ('sent', 'overdue')${currency ? ' AND currency=$1' : ''}`,
    currency ? [currency] : [],
  );

  const where = currency ? 'WHERE amount_currency=$1' : '';
  const { rows } = await pool.query(
    `SELECT * FROM wise_transactions ${where} ORDER BY date DESC`,
    currency ? [currency] : [],
  );

  const MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const enriched = rows.map((tx) => {
    const txAmount = Number(tx.amount_value);
    const txDate   = new Date(tx.date).getTime();
    const matched  = invoices.find((inv) => {
      return (
        Math.abs(Number(inv.total) - txAmount) < 0.01 &&
        Math.abs(txDate - new Date(inv.due_date).getTime()) <= MATCH_WINDOW_MS
      );
    });
    return {
      id:              tx.wise_id,
      date:            tx.date,
      type:            tx.type,
      amount:          { value: tx.amount_value, currency: tx.amount_currency },
      description:     tx.description,
      senderName:      tx.sender_name,
      referenceNumber: tx.reference_number,
      matched_invoice: matched
        ? { id: matched.id, invoice_number: matched.invoice_number }
        : null,
    };
  });

  res.json(enriched);
});

// GET /api/bank-accounts/wise/transactions?currency=EUR&start=2026-01-01&end=2026-04-30
// Fetches from Wise, upserts to DB, returns persisted rows
router.get('/wise/transactions', async (req, res) => {
  const { currency, start, end } = req.query;

  const { rows: [row] } = await pool.query(
    'SELECT wise_api_key, wise_profile_id FROM company_settings LIMIT 1',
  );
  if (!row?.wise_api_key) return res.status(400).json({ error: 'Wise API key not configured' });
  if (!row?.wise_profile_id) return res.status(400).json({ error: 'Wise Profile ID not configured' });
  if (!currency) return res.status(400).json({ error: 'currency query param is required' });

  const intervalStart = `${start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const intervalEnd   = `${end || new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;

  // Step 1: get balances to find the balanceId for this currency
  const balancesRes = await wiseRequest(
    `/v4/profiles/${row.wise_profile_id}/balances?types=STANDARD`,
    row.wise_api_key,
  );
  if (balancesRes.status !== 200) {
    return res.status(502).json({ error: 'Failed to fetch Wise balances', detail: balancesRes.body });
  }

  const balances = Array.isArray(balancesRes.body) ? balancesRes.body : [];
  const balance = balances.find((b) => b.currency === currency || b.amount?.currency === currency);
  if (!balance) {
    return res.status(404).json({ error: `No Wise balance found for currency ${currency}` });
  }
  const balanceId = balance.id;

  // Step 2: fetch statement for that balance
  const statementPath = `/v1/profiles/${row.wise_profile_id}/balance-statements/${balanceId}/statement.json` +
    `?currency=${encodeURIComponent(currency)}` +
    `&intervalStart=${encodeURIComponent(intervalStart)}` +
    `&intervalEnd=${encodeURIComponent(intervalEnd)}`;

  const { status, body } = await wiseRequest(statementPath, row.wise_api_key);
  if (status !== 200) {
    return res.status(502).json({ error: 'Failed to fetch Wise transactions', detail: body });
  }

  const transactions = body.transactions || [];

  // Upsert each transaction into wise_transactions
  for (const tx of transactions) {
    const wiseId    = tx.referenceNumber || String(tx.id);
    const txDate    = tx.date || tx.createdOn || null;
    const txType    = tx.type || '';
    const amtValue  = tx.amount?.value ?? 0;
    const amtCur    = tx.amount?.currency || currency;
    const desc      = tx.details?.description || tx.details?.type || '';
    const sender    = tx.details?.senderName || tx.details?.paymentReference || '';
    const refNum    = tx.referenceNumber || '';

    await pool.query(
      `INSERT INTO wise_transactions
         (wise_id, date, type, amount_value, amount_currency, description, sender_name, reference_number, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (wise_id) DO UPDATE SET
         date=EXCLUDED.date, type=EXCLUDED.type,
         amount_value=EXCLUDED.amount_value, amount_currency=EXCLUDED.amount_currency,
         description=EXCLUDED.description, sender_name=EXCLUDED.sender_name,
         reference_number=EXCLUDED.reference_number, fetched_at=NOW()`,
      [wiseId, txDate, txType, amtValue, amtCur, desc, sender, refNum],
    );
  }

  // Fetch candidate invoices for matching (sent/overdue, same currency)
  const { rows: invoices } = await pool.query(
    `SELECT id, invoice_number, total, due_date, currency
     FROM invoices
     WHERE status IN ('sent', 'overdue') AND currency=$1`,
    [currency],
  );

  // Match each transaction to an invoice by exact amount + due_date ±30 days
  const MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  const enriched = transactions.map((tx) => {
    const wiseId   = tx.referenceNumber || String(tx.id);
    const txAmount = Math.abs(Number(tx.amount?.value || 0));
    const txDate   = new Date(tx.date || tx.createdOn).getTime();
    const matched  = invoices.find((inv) => {
      const invTotal = Number(inv.total);
      const dueMs = new Date(inv.due_date).getTime();
      return (
        Math.abs(invTotal - txAmount) < 0.01 &&
        Math.abs(txDate - dueMs) <= MATCH_WINDOW_MS
      );
    });
    return {
      id:              wiseId,
      date:            tx.date,
      type:            tx.type,
      amount:          { value: tx.amount?.value, currency: tx.amount?.currency || currency },
      description:     tx.details?.description || tx.details?.type || '',
      senderName:      tx.details?.senderName || tx.details?.paymentReference || '',
      referenceNumber: tx.referenceNumber || '',
      matched_invoice: matched
        ? { id: matched.id, invoice_number: matched.invoice_number }
        : null,
    };
  });

  res.json(enriched);
});

module.exports = router;
