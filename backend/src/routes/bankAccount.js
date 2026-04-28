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
      id:                    tx.wise_id,
      date:                  tx.date,
      type:                  tx.type,
      amount:                { value: tx.amount_value, currency: tx.amount_currency },
      totalFees:             { value: tx.total_fees_value, currency: tx.total_fees_currency },
      runningBalance:        { value: tx.running_balance_value, currency: tx.running_balance_currency },
      description:           tx.description,
      detailsType:           tx.details_type,
      senderName:            tx.sender_name,
      senderAccount:         tx.sender_account,
      paymentReference:      tx.payment_reference,
      referenceNumber:       tx.reference_number,
      exchangeRate:          tx.exchange_rate,
      isOwnersWithdrawal:    tx.is_owners_withdrawal,
      matched_invoice: matched
        ? { id: matched.id, invoice_number: matched.invoice_number }
        : null,
    };
  });

  res.json(enriched);
});

// GET /api/bank-accounts/wise/transactions?currency=EUR
// Fetches all available transactions from Wise, upserts to DB, returns persisted rows
router.get('/wise/transactions', async (req, res) => {
  const { currency } = req.query;

  const { rows: [row] } = await pool.query(
    'SELECT wise_api_key, wise_profile_id FROM company_settings LIMIT 1',
  );
  if (!row?.wise_api_key) return res.status(400).json({ error: 'Wise API key not configured' });
  if (!row?.wise_profile_id) return res.status(400).json({ error: 'Wise Profile ID not configured' });
  if (!currency) return res.status(400).json({ error: 'currency query param is required' });

  // Always fetch all available history (Wise caps at ~469 days per request; use a wide window)
  const intervalStart = '2020-01-01T00:00:00.000Z';
  const intervalEnd   = `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;

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
    const wiseId       = tx.referenceNumber || String(tx.id);
    const txDate       = tx.date || tx.createdOn || null;
    const txType       = tx.type || '';
    const amtValue     = tx.amount?.value ?? 0;
    const amtCur       = tx.amount?.currency || currency;
    const feesValue    = tx.totalFees?.value ?? 0;
    const feesCur      = tx.totalFees?.currency || '';
    const runBalValue  = tx.runningBalance?.value ?? null;
    const runBalCur    = tx.runningBalance?.currency || '';
    const desc         = tx.details?.description || '';
    const detailsType  = tx.details?.type || '';
    const sender       = tx.details?.senderName || '';
    const senderAcct   = tx.details?.senderAccount || '';
    const payRef       = tx.details?.paymentReference || '';
    const refNum       = tx.referenceNumber || '';
    const exchRate     = tx.exchangeDetails?.rate ?? null;

    await pool.query(
      `INSERT INTO wise_transactions
         (wise_id, date, type, amount_value, amount_currency,
          total_fees_value, total_fees_currency,
          running_balance_value, running_balance_currency,
          description, details_type, sender_name, sender_account,
          payment_reference, reference_number, exchange_rate, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       ON CONFLICT (wise_id) DO UPDATE SET
         date=EXCLUDED.date, type=EXCLUDED.type,
         amount_value=EXCLUDED.amount_value, amount_currency=EXCLUDED.amount_currency,
         total_fees_value=EXCLUDED.total_fees_value, total_fees_currency=EXCLUDED.total_fees_currency,
         running_balance_value=EXCLUDED.running_balance_value, running_balance_currency=EXCLUDED.running_balance_currency,
         description=EXCLUDED.description, details_type=EXCLUDED.details_type,
         sender_name=EXCLUDED.sender_name, sender_account=EXCLUDED.sender_account,
         payment_reference=EXCLUDED.payment_reference, reference_number=EXCLUDED.reference_number,
         exchange_rate=EXCLUDED.exchange_rate, fetched_at=NOW()`,
      [wiseId, txDate, txType, amtValue, amtCur,
       feesValue, feesCur,
       runBalValue, runBalCur,
       desc, detailsType, sender, senderAcct,
       payRef, refNum, exchRate],
    );
  }

  // Fetch candidate invoices for matching (sent/overdue, same currency)
  const { rows: invoices } = await pool.query(
    `SELECT id, invoice_number, total, due_date, currency
     FROM invoices
     WHERE status IN ('sent', 'overdue') AND currency=$1`,
    [currency],
  );

  // Fetch persisted flags for this currency (withdrawal flag may have been set by user)
  const { rows: flagRows } = await pool.query(
    `SELECT wise_id, is_owners_withdrawal FROM wise_transactions WHERE amount_currency = $1`,
    [currency],
  );
  const withdrawalMap = Object.fromEntries(flagRows.map((r) => [r.wise_id, r.is_owners_withdrawal]));

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
      id:               wiseId,
      date:             tx.date,
      type:             tx.type,
      amount:           { value: tx.amount?.value, currency: tx.amount?.currency || currency },
      totalFees:        { value: tx.totalFees?.value ?? 0, currency: tx.totalFees?.currency || '' },
      runningBalance:   { value: tx.runningBalance?.value ?? null, currency: tx.runningBalance?.currency || '' },
      description:      tx.details?.description || '',
      detailsType:      tx.details?.type || '',
      senderName:       tx.details?.senderName || '',
      senderAccount:    tx.details?.senderAccount || '',
      paymentReference: tx.details?.paymentReference || '',
      referenceNumber:  tx.referenceNumber || '',
      exchangeRate:          tx.exchangeDetails?.rate ?? null,
      isOwnersWithdrawal:    withdrawalMap[wiseId] ?? false,
      matched_invoice: matched
        ? { id: matched.id, invoice_number: matched.invoice_number }
        : null,
    };
  });

  res.json(enriched);
});

// PATCH /api/bank-accounts/wise/transactions/:wiseId/withdrawal
// Body: { is_owners_withdrawal: true|false }
router.patch('/wise/transactions/:wiseId/withdrawal', async (req, res, next) => {
  try {
    const { wiseId } = req.params;
    const flag = req.body.is_owners_withdrawal === true;
    const { rowCount } = await pool.query(
      `UPDATE wise_transactions SET is_owners_withdrawal = $1 WHERE wise_id = $2`,
      [flag, wiseId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ wiseId, is_owners_withdrawal: flag });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
