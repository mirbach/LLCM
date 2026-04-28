const express = require('express');
const router = express.Router();
const pool = require('../db');
const puppeteer = require('puppeteer');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDateWindow(period) {
  const now = new Date();
  const year = now.getFullYear();

  if (period === 'this_month') {
    const start = new Date(year, now.getMonth(), 1);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (period === 'this_year') {
    const start = new Date(year, 0, 1);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  // all_time: start of current year, no upper bound
  const start = new Date(year, 0, 1);
  return { start: start.toISOString(), end: null };
}

async function buildReportData(period) {
  const { start, end } = getDateWindow(period);

  // (a) Paid invoices in window
  const invoiceDateFilter = end
    ? `status = 'paid' AND issue_date >= $1 AND issue_date <= $2`
    : `status = 'paid' AND issue_date >= $1`;
  const invoiceParams = end ? [start, end] : [start];
  const { rows: paidInvoices } = await pool.query(
    `SELECT id,
            invoice_number,
            issue_date::date AS date,
            currency,
            total
     FROM invoices
     WHERE ${invoiceDateFilter}
     ORDER BY issue_date`,
    invoiceParams,
  );

  // (b) Positive (inflow) bank transactions not already matched to a paid invoice
  const txnDateFilter = end
    ? `amount_value > 0 AND matched_invoice_id IS NULL AND date >= $1 AND date <= $2`
    : `amount_value > 0 AND matched_invoice_id IS NULL AND date >= $1`;
  const txnParams = end ? [start, end] : [start];
  const { rows: txnReceipts } = await pool.query(
    `SELECT wise_id,
            date::date AS date,
            description,
            sender_name,
            amount_value,
            amount_currency AS currency
     FROM wise_transactions
     WHERE ${txnDateFilter}
     ORDER BY date`,
    txnParams,
  );

  // (c) Negative (outflow) bank transactions — expenses
  const expDateFilter = end
    ? `amount_value < 0 AND date >= $1 AND date <= $2`
    : `amount_value < 0 AND date >= $1`;
  const expParams = end ? [start, end] : [start];
  const { rows: expenses } = await pool.query(
    `SELECT wise_id,
            date::date AS date,
            description,
            sender_name,
            amount_value,
            amount_currency AS currency
     FROM wise_transactions
     WHERE ${expDateFilter}
     ORDER BY date`,
    expParams,
  );

  // ── Group by currency ──────────────────────────────────────────────────────
  const currencyMap = {};

  function getOrCreate(currency) {
    if (!currencyMap[currency]) {
      currencyMap[currency] = {
        currency,
        invoiceReceipts: [],
        txnReceipts: [],
        expenses: [],
        receiptsTotal: 0,
        expensesTotal: 0,
        netIncome: 0,
      };
    }
    return currencyMap[currency];
  }

  for (const inv of paidInvoices) {
    const cur = (inv.currency || 'USD').toUpperCase();
    const bucket = getOrCreate(cur);
    bucket.invoiceReceipts.push({
      id: inv.id,
      label: inv.invoice_number,
      date: inv.date,
      amount: Number(inv.total),
    });
    bucket.receiptsTotal += Number(inv.total);
  }

  for (const txn of txnReceipts) {
    const cur = (txn.currency || 'USD').toUpperCase();
    const bucket = getOrCreate(cur);
    bucket.txnReceipts.push({
      id: txn.wise_id,
      label: txn.description || txn.sender_name || '—',
      date: txn.date,
      amount: Number(txn.amount_value),
    });
    bucket.receiptsTotal += Number(txn.amount_value);
  }

  for (const exp of expenses) {
    const cur = (exp.currency || 'USD').toUpperCase();
    const bucket = getOrCreate(cur);
    bucket.expenses.push({
      id: exp.wise_id,
      label: exp.description || exp.sender_name || '—',
      date: exp.date,
      amount: Math.abs(Number(exp.amount_value)), // store as positive for display
    });
    bucket.expensesTotal += Math.abs(Number(exp.amount_value));
  }

  for (const bucket of Object.values(currencyMap)) {
    bucket.netIncome = bucket.receiptsTotal - bucket.expensesTotal;
  }

  const currencies = Object.values(currencyMap).sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );

  return {
    period,
    from: start,
    to: end,
    currencies,
  };
}

function buildReportHtml(report) {
  const fmt = (amount, currency) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US') : '—');

  const periodLabels = {
    this_month: 'This Month',
    this_year: 'This Year',
    all_time: 'All Time (Current Year)',
  };

  const sections = report.currencies
    .map((cur) => {
      const invRows = cur.invoiceReceipts
        .map(
          (r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${r.label}</td>
            <td style="color:#16a34a">Invoice Receipt</td>
            <td style="text-align:right">${fmt(r.amount, cur.currency)}</td>
          </tr>`,
        )
        .join('');

      const txnRows = cur.txnReceipts
        .map(
          (r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${r.label}</td>
            <td style="color:#0ea5e9">Bank Receipt</td>
            <td style="text-align:right">${fmt(r.amount, cur.currency)}</td>
          </tr>`,
        )
        .join('');

      const expRows = cur.expenses
        .map(
          (r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${r.label}</td>
            <td style="color:#dc2626">Expense</td>
            <td style="text-align:right">(${fmt(r.amount, cur.currency)})</td>
          </tr>`,
        )
        .join('');

      const netColor = cur.netIncome >= 0 ? '#16a34a' : '#dc2626';
      const netLabel =
        cur.netIncome >= 0
          ? 'Excess of Receipts over Expenses'
          : 'Excess of Expenses over Receipts';

      return `
        <div class="section">
          <h2>${cur.currency}</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th style="text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invRows}
              ${txnRows}
              <tr class="subtotal-row">
                <td colspan="3">Total Receipts</td>
                <td style="text-align:right">${fmt(cur.receiptsTotal, cur.currency)}</td>
              </tr>
              ${expRows}
              <tr class="subtotal-row">
                <td colspan="3">Total Expenses</td>
                <td style="text-align:right">(${fmt(cur.expensesTotal, cur.currency)})</td>
              </tr>
              <tr class="net-row">
                <td colspan="3">${netLabel}</td>
                <td style="text-align:right;color:${netColor}">${fmt(Math.abs(cur.netIncome), cur.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    })
    .join('');

  const fromLabel = formatDate(report.from);
  const toLabel = report.to ? formatDate(report.to) : 'Present';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 40px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #555; margin-bottom: 28px; }
  .section { margin-bottom: 36px; }
  .section h2 { font-size: 14px; font-weight: bold; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  .subtotal-row td { font-weight: 600; border-top: 1px solid #d1d5db; background: #f9fafb; }
  .net-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #374151; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <h1>Statement of Excess of Receipts over Expenses</h1>
  <div class="subtitle">Period: ${periodLabels[report.period] || report.period} &nbsp;|&nbsp; ${fromLabel} – ${toLabel}</div>
  ${sections || '<p style="color:#6b7280">No transactions found for this period.</p>'}
</body>
</html>`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/net-income?period=this_month|this_year|all_time
router.get('/', async (req, res, next) => {
  try {
    const period = ['this_month', 'this_year', 'all_time'].includes(req.query.period)
      ? req.query.period
      : 'this_year';
    const data = await buildReportData(period);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/net-income/pdf?period=this_month|this_year|all_time
router.get('/pdf', async (req, res, next) => {
  let browser;
  try {
    const period = ['this_month', 'this_year', 'all_time'].includes(req.query.period)
      ? req.query.period
      : 'this_year';
    const data = await buildReportData(period);
    const html = buildReportHtml(data);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

    const filename = `net-income-${period}-${new Date().getFullYear()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    next(err);
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
