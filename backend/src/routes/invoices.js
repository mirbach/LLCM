const express = require('express');
const router = express.Router();
const pool = require('../db');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getFullInvoice(id) {
  const { rows: [invoice] } = await pool.query(
    `SELECT i.*,
            c.name            AS customer_name,
            c.email           AS customer_email,
            c.phone           AS customer_phone,
            c.address         AS customer_address,
            c.city            AS customer_city,
            c.state           AS customer_state,
            c.zip             AS customer_zip,
            c.country         AS customer_country,
            c.customer_number AS customer_number
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.id = $1`,
    [id],
  );
  if (!invoice) return null;
  const { rows: items } = await pool.query(
    'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id',
    [id],
  );
  return { ...invoice, items };
}

function calcTotals(items, taxRate) {
  const subtotal = (items || []).reduce(
    (s, item) => s + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0,
  );
  const tax_amount = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + tax_amount;
  return { subtotal, tax_amount, total };
}

function buildInvoiceHtml(invoice, company, bankAccounts = []) {
  const port = process.env.PORT || 4000;
  const logoTag = company.logo_path
    ? `<img src="http://localhost:${port}${company.logo_path}" style="max-height:80px;max-width:200px;object-fit:contain;" />`
    : '';

  const fmt = (n) => Number(n || 0).toFixed(2);

  const companyAddr = [company.address, company.city, company.state, company.zip, company.country]
    .filter(Boolean).join(', ');
  const customerAddr = [
    invoice.customer_address, invoice.customer_city,
    invoice.customer_state, invoice.customer_zip, invoice.customer_country,
  ].filter(Boolean).join(', ');

  const statusColor = {
    draft: '#6b7280',
    sent: '#1e40af',
    paid: '#065f46',
    overdue: '#991b1b',
  };
  const statusBg = {
    draft: '#f3f4f6',
    sent: '#dbeafe',
    paid: '#d1fae5',
    overdue: '#fee2e2',
  };

  const currency = invoice.currency || 'USD';
  const fmtAmt = (n) => `${currency} ${fmt(n)}`;

  const itemRows = (invoice.items || []).map((item) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;">${item.description || ''}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${Number(item.quantity)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtAmt(item.unit_price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtAmt(item.amount)}</td>
    </tr>`).join('');

  const taxRow = Number(invoice.tax_rate) > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;">Tax (${invoice.tax_rate}%)</td><td style="padding:6px 0;text-align:right;">${fmtAmt(invoice.tax_amount)}</td></tr>`
    : '';

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const bankBlock = bankAccounts.length > 0 ? `
  <div style="padding:5mm 20mm 6mm 25mm;border-top:0.5pt solid #d1d5db;">
    <div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-weight:600;margin-bottom:3mm;">Payment Details</div>
    ${bankAccounts.map((b) => `
    <div style="margin-bottom:3mm;">
      <div style="font-size:10pt;font-weight:700;color:#111827;">${b.account_name}</div>
      ${b.bank_name    ? `<div style="font-size:9pt;font-weight:600;color:#374151;">${b.bank_name}</div>` : ''}
      ${b.bank_address ? `<div style="font-size:8pt;color:#4b5563;">${b.bank_address}</div>` : ''}
      <div style="font-size:8pt;color:#6b7280;margin-top:1mm;">
        ${b.iban           ? `<span style="margin-right:6mm;">IBAN: ${b.iban}</span>` : ''}
        ${b.account_number ? `<span style="margin-right:6mm;">Account #: ${b.account_number}</span>` : ''}
        ${b.sort_code      ? `<span style="margin-right:6mm;">Sort Code: ${b.sort_code}</span>` : ''}
        ${b.routing_number ? `<span style="margin-right:6mm;">Routing #: ${b.routing_number}</span>` : ''}
        ${b.bic_swift      ? `<span>BIC/SWIFT: ${b.bic_swift}</span>` : ''}
      </div>
    </div>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; width: 210mm; }
    .page { width: 210mm; min-height: 297mm; display: flex; flex-direction: column; position: relative; }
    /* Letterhead 0–27 mm */
    .lh { height: 27mm; padding: 5mm 20mm 0 25mm; display: flex; justify-content: space-between; align-items: flex-start; }
    .co-name { font-size: 14pt; font-weight: 700; color: #1e40af; }
    .co-contact { font-size: 7.5pt; color: #6b7280; line-height: 1.6; text-align: right; }
    /* Address zone 45–90 mm, left 20 mm (envelope window) */
    .lh-gap { height: 18mm; }
    .az { padding: 0 20mm 0 20mm; display: flex; justify-content: space-between; align-items: flex-start; min-height: 45mm; }
    .az-left { width: 85mm; }
    .sender-ref { font-size: 6pt; color: #6b7280; border-bottom: 0.25pt solid #aaa; padding-bottom: 1.5mm; margin-bottom: 2mm; white-space: nowrap; overflow: hidden; }
    .recipient { font-size: 10pt; line-height: 1.5; }
    .recipient-name { font-weight: 600; }
    .az-right { text-align: right; }
    .inv-title { font-size: 24pt; font-weight: 800; color: #1e40af; letter-spacing: -0.5pt; }
    .inv-num { font-size: 10pt; color: #6b7280; margin-top: 1mm; }
    .s-badge { display: inline-block; margin-top: 3mm; padding: 2pt 10pt; border-radius: 4pt; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
    /* Reference line ~97 mm */
    .rl-gap { height: 7mm; }
    .rl { padding: 2.5mm 20mm; border-top: 0.5pt solid #d1d5db; border-bottom: 0.5pt solid #d1d5db; display: flex; }
    .rf { flex: 1; padding-right: 4mm; }
    .rf:last-child { padding-right: 0; }
    .rf-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #9ca3af; font-weight: 600; margin-bottom: 1mm; }
    .rf-value { font-size: 9pt; font-weight: 600; color: #111827; }
    /* Subject ~103 mm */
    .subj-gap { height: 5mm; }
    .subj { padding: 0 20mm 0 25mm; font-size: 11pt; font-weight: 700; color: #111827; }
    /* Main content */
    .main { flex: 1; padding: 6mm 20mm 0 25mm; }
    .items { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    .items th { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #6b7280; padding: 2mm 0; border-bottom: 0.75pt solid #111827; font-weight: 600; }
    .items th:not(:first-child) { text-align: right; }
    .items td { padding: 2mm 0; font-size: 9pt; border-bottom: 0.25pt solid #e5e7eb; vertical-align: top; }
    .items td:not(:first-child) { text-align: right; }
    .totals-wrap { display: flex; justify-content: flex-end; }
    .totals { width: 65mm; border-collapse: collapse; }
    .totals td { padding: 1.5mm 0; font-size: 9.5pt; }
    .totals td:last-child { text-align: right; }
    .tot-muted { color: #6b7280; }
    .tot-row td { font-size: 11pt; font-weight: 700; border-top: 0.75pt solid #111827; padding-top: 2.5mm; }
    .notes { margin-top: 5mm; }
    .sec-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #9ca3af; font-weight: 600; margin-bottom: 1.5mm; }
    .notes p { font-size: 9pt; color: #374151; white-space: pre-wrap; }
    .footer-sec { padding: 3mm 20mm 6mm 25mm; border-top: 0.25pt solid #e5e7eb; text-align: center; font-size: 7.5pt; color: #9ca3af; }
    .fold { position: absolute; left: 5mm; width: 4mm; border-top: 0.25pt solid #ccc; }
  </style>
</head>
<body>
<div class="page">
  <div class="fold" style="top:105mm;"></div>
  <div class="fold" style="top:210mm;"></div>

  <!-- Letterhead: 0–27 mm -->
  <div class="lh">
    <div>
      ${logoTag}
      <div class="co-name">${company.name || ''}</div>
    </div>
    <div class="co-contact">
      ${company.address ? `<div>${company.address}</div>` : ''}
      ${[company.city, company.state, company.zip].filter(Boolean).join(', ') ? `<div>${[company.city, company.state, company.zip].filter(Boolean).join(', ')}</div>` : ''}
      ${company.phone   ? `<div>${company.phone}</div>` : ''}
      ${company.email   ? `<div>${company.email}</div>` : ''}
      ${company.website ? `<div>${company.website}</div>` : ''}
      ${company.tax_id  ? `<div>Tax ID: ${company.tax_id}</div>` : ''}
    </div>
  </div>

  <!-- Reserved gap: 27–45 mm -->
  <div class="lh-gap"></div>

  <!-- Address zone: 45–90 mm -->
  <div class="az">
    <div class="az-left">
      <div class="sender-ref">${company.name || ''}${companyAddr ? ` · ${companyAddr}` : ''}</div>
      <div class="recipient">
        <div class="recipient-name">${invoice.customer_name || '—'}</div>
        ${invoice.customer_number ? `<div style="font-size:8pt;color:#9ca3af;">${invoice.customer_number}</div>` : ''}
        ${customerAddr          ? `<div>${customerAddr}</div>` : ''}
        ${invoice.customer_email ? `<div>${invoice.customer_email}</div>` : ''}
        ${invoice.customer_phone ? `<div>${invoice.customer_phone}</div>` : ''}
      </div>
    </div>
    <div class="az-right">
      <div class="inv-title">INVOICE</div>
      <div class="inv-num">#${invoice.invoice_number}</div>
      <div><span class="s-badge" style="background:${statusBg[invoice.status] || statusBg.draft};color:${statusColor[invoice.status] || statusColor.draft};">${invoice.status}</span></div>
    </div>
  </div>

  <!-- Gap → reference line (~97 mm) -->
  <div class="rl-gap"></div>

  <!-- Reference fields line -->
  <div class="rl">
    <div class="rf"><div class="rf-label">Customer</div><div class="rf-value">${invoice.customer_name || '—'}</div></div>
    ${invoice.customer_number ? `<div class="rf"><div class="rf-label">Customer No.</div><div class="rf-value">${invoice.customer_number}</div></div>` : ''}
    <div class="rf"><div class="rf-label">Invoice No.</div><div class="rf-value">${invoice.invoice_number}</div></div>
    <div class="rf"><div class="rf-label">Issue Date</div><div class="rf-value">${formatDate(invoice.issue_date)}</div></div>
    <div class="rf"><div class="rf-label">Due Date</div><div class="rf-value">${formatDate(invoice.due_date)}</div></div>
  </div>

  <!-- Subject line (~103 mm) -->
  <div class="subj-gap"></div>
  <div class="subj">Invoice No. ${invoice.invoice_number}</div>

  <!-- Main content -->
  <div class="main">
    <table class="items">
      <thead>
        <tr>
          <th style="text-align:left;">Description</th>
          <th style="width:40pt;">Qty</th>
          <th style="width:70pt;">Unit Price</th>
          <th style="width:70pt;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals-wrap">
      <table class="totals">
        <tr><td class="tot-muted">Subtotal</td><td>${fmtAmt(invoice.subtotal)}</td></tr>
        ${taxRow}
        <tr class="tot-row"><td>Total</td><td>${fmtAmt(invoice.total)}</td></tr>
      </table>
    </div>
    ${invoice.notes ? `<div class="notes"><div class="sec-label">Notes</div><p>${invoice.notes}</p></div>` : ''}
  </div>

  ${bankBlock}

  ${(invoice.footer_text || company.footer_text) ? `<div class="footer-sec">${invoice.footer_text || company.footer_text}</div>` : ''}
</div>
</body>
</html>`;
}

async function generatePdf(invoice, company, bankAccounts = []) {
  const html = buildInvoiceHtml(invoice, company, bankAccounts);
  const browser = await puppeteer.launch({
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    }),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  return pdf;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET all invoices (optional ?status= filter)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE i.status=$1';
  }
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email, c.customer_number AS customer_number
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     ${where}
     ORDER BY i.created_at DESC`,
    params,
  );
  res.json(rows);
});

// GET single invoice with items
router.get('/:id', async (req, res) => {
  const invoice = await getFullInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// POST create invoice
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomically read + increment invoice number
    const { rows: [company] } = await client.query(
      'SELECT invoice_prefix, next_invoice_number FROM company_settings FOR UPDATE',
    );
    const year = new Date().getFullYear();
    const invoiceNumber = `${company.invoice_prefix}${year}-${String(company.next_invoice_number).padStart(4, '0')}`;
    await client.query('UPDATE company_settings SET next_invoice_number = next_invoice_number + 1');

    const { customer_id, issue_date, due_date, notes, footer_text, tax_rate, items } = req.body;
    const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

    // Inherit currency from customer
    let currency = 'USD';
    if (customer_id) {
      const { rows: [cust] } = await client.query('SELECT currency FROM customers WHERE id=$1', [customer_id]);
      if (cust?.currency) currency = cust.currency;
    }

    const { rows: [invoice] } = await client.query(
      `INSERT INTO invoices (invoice_number, customer_id, issue_date, due_date, notes, footer_text, subtotal, tax_rate, tax_amount, total, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [invoiceNumber, customer_id || null, issue_date, due_date, notes, footer_text, subtotal, tax_rate || 0, tax_amount, total, currency],
    );

    for (const item of (items || [])) {
      await client.query(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
        [invoice.id, item.description, item.quantity, item.unit_price, Number(item.quantity) * Number(item.unit_price)],
      );
    }

    await client.query('COMMIT');
    const full = await getFullInvoice(invoice.id);
    res.status(201).json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT update invoice
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { customer_id, status, issue_date, due_date, notes, footer_text, tax_rate, items } = req.body;
    const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

    const { rows: [invoice] } = await client.query(
      `UPDATE invoices
       SET customer_id=$1, status=$2, issue_date=$3, due_date=$4,
           notes=$5, footer_text=$6, subtotal=$7, tax_rate=$8, tax_amount=$9, total=$10, updated_at=NOW()
       WHERE id=$11
       RETURNING *`,
      [customer_id || null, status, issue_date, due_date, notes, footer_text, subtotal, tax_rate || 0, tax_amount, total, req.params.id],
    );
    if (!invoice) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await client.query('DELETE FROM invoice_items WHERE invoice_id=$1', [req.params.id]);
    for (const item of (items || [])) {
      await client.query(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
        [invoice.id, item.description, item.quantity, item.unit_price, Number(item.quantity) * Number(item.unit_price)],
      );
    }

    await client.query('COMMIT');
    const full = await getFullInvoice(invoice.id);
    res.json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH update status only
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['draft', 'sent', 'paid', 'overdue'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }
  const { rows } = await pool.query(
    'UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [status, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

// DELETE invoice
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM invoices WHERE id=$1', [req.params.id]);
  res.status(204).send();
});

// GET invoice as PDF download
router.get('/:id/pdf', async (req, res) => {
  const invoice = await getFullInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const invCurrency = invoice.currency || 'USD';
  const [{ rows: [company] }, { rows: bankAccounts }] = await Promise.all([
    pool.query('SELECT * FROM company_settings LIMIT 1'),
    pool.query('SELECT * FROM bank_accounts WHERE show_on_invoice=true AND currency=$1 ORDER BY id', [invCurrency]),
  ]);
  const pdf = await generatePdf(invoice, company, bankAccounts);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  res.send(pdf);
});

// POST send invoice by email
router.post('/:id/send', async (req, res) => {
  const invoice = await getFullInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!invoice.customer_email) {
    return res.status(400).json({ error: 'Customer has no email address on file' });
  }

  const invCurrency = invoice.currency || 'USD';
  const [{ rows: [company] }, { rows: bankAccounts }] = await Promise.all([
    pool.query('SELECT * FROM company_settings LIMIT 1'),
    pool.query('SELECT * FROM bank_accounts WHERE show_on_invoice=true AND currency=$1 ORDER BY id', [invCurrency]),
  ]);
  const pdf = await generatePdf(invoice, company, bankAccounts);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || company.email,
    to: invoice.customer_email,
    subject: `Invoice ${invoice.invoice_number} from ${company.name}`,
    text: `Please find your invoice ${invoice.invoice_number} attached.\n\nAmount due: $${Number(invoice.total).toFixed(2)}\nDue date: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}\n\nThank you for your business.`,
    attachments: [
      { filename: `${invoice.invoice_number}.pdf`, content: pdf },
    ],
  });

  // Advance status from draft → sent automatically
  if (invoice.status === 'draft') {
    await pool.query("UPDATE invoices SET status='sent', updated_at=NOW() WHERE id=$1", [req.params.id]);
  }

  res.json({ success: true });
});

module.exports = router;
