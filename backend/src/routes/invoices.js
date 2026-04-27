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
  const { rows: textBlockRows } = await pool.query(
    'SELECT text_block_id FROM invoice_text_blocks WHERE invoice_id=$1 ORDER BY sort_order',
    [id],
  );
  const text_block_ids = textBlockRows.map((r) => r.text_block_id);
  return { ...invoice, items, text_block_ids };
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
    ? `<img src="http://localhost:${port}${company.logo_path}" style="max-height:20mm;max-width:60mm;object-fit:contain;display:block;" />`
    : '';

  const fmt = (n) => Number(n || 0).toFixed(2);

  const companyAddr = [company.address, company.city, company.state, company.zip, company.country]
    .filter(Boolean).join(', ');
  const customerAddr = [
    invoice.customer_address, invoice.customer_city,
    invoice.customer_state, invoice.customer_zip, invoice.customer_country,
  ].filter(Boolean).join(', ');

  const statusColor = { draft: '#6b7280', sent: '#1e40af', paid: '#065f46', overdue: '#991b1b' };
  const statusBg    = { draft: '#fef9c3', sent: '#dbeafe', paid: '#d1fae5', overdue: '#fee2e2' };
  const isDraft = !invoice.status || invoice.status === 'draft';

  const currency = invoice.currency || 'USD';
  const fmtAmt = (n) => `${currency} ${fmt(n)}`;

  const itemRows = (invoice.items || []).map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
      <td style="padding:2mm 6pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;color:#111827;">${item.description || ''}</td>
      <td style="padding:2mm 6pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;color:#6b7280;text-align:right;">${Number(item.quantity)}</td>
      <td style="padding:2mm 6pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;color:#6b7280;text-align:right;">${fmtAmt(item.unit_price)}</td>
      <td style="padding:2mm 6pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;color:#111827;font-weight:500;text-align:right;">${fmtAmt(item.amount)}</td>
    </tr>`).join('');

  const taxRow = Number(invoice.tax_rate) > 0
    ? `<tr><td style="padding:1.5mm 0;color:#6b7280;">Tax (${invoice.tax_rate}%)</td><td style="padding:1.5mm 0;text-align:right;">${fmtAmt(invoice.tax_amount)}</td></tr>`
    : '';

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const statusBadge = !isDraft
    ? `<div style="margin-top:3mm;"><span style="display:inline-block;padding:2pt 10pt;border-radius:4pt;font-size:8pt;font-weight:700;text-transform:uppercase;background:${statusBg[invoice.status]};color:${statusColor[invoice.status]};border:1pt solid ${statusColor[invoice.status]}55;">${invoice.status}</span></div>`
    : '';

  const bankBlock = bankAccounts.length > 0 ? `
  <div style="border-top:2pt solid #1e40af;"></div>
  <div style="padding:4mm 20mm 5mm 25mm;background:#f8fafc;">
    <div style="font-size:7.5pt;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;margin-bottom:3mm;">Payment Details</div>
    ${bankAccounts.map((b) => `
    <div style="margin-bottom:4mm;">
      <div style="font-size:10pt;font-weight:700;color:#111827;">${b.account_name}</div>
      ${b.bank_name ? `
      <div style="border-top:0.5pt solid #d1d5db;margin-top:1mm;padding-top:1mm;">
        <div style="font-size:9pt;font-weight:600;color:#374151;">${b.bank_name}</div>
        ${b.bank_address ? `<div style="font-size:8pt;color:#6b7280;">${b.bank_address}</div>` : ''}
      </div>` : ''}
      <div style="font-size:8pt;color:#6b7280;margin-top:1mm;display:flex;flex-wrap:wrap;gap:1mm 6mm;">
        ${b.iban           ? `<span><strong style="color:#374151;">IBAN:</strong> ${b.iban}</span>` : ''}
        ${b.account_number ? `<span><strong style="color:#374151;">Account #:</strong> ${b.account_number}</span>` : ''}
        ${b.routing_number ? `<span><strong style="color:#374151;">Routing #:</strong> ${b.routing_number}</span>` : ''}
        ${b.sort_code      ? `<span><strong style="color:#374151;">Sort Code:</strong> ${b.sort_code}</span>` : ''}
        ${b.bic_swift      ? `<span><strong style="color:#374151;">BIC/SWIFT:</strong> ${b.bic_swift}</span>` : ''}
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
    .page { width: 210mm; min-height: 297mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
    /* Letterhead */
    .lh { padding: 6mm 20mm 0 25mm; display: flex; justify-content: space-between; align-items: flex-start; }
    .co-name { font-size: 15pt; font-weight: 800; color: #1e40af; letter-spacing: -0.3pt; margin-bottom: 2mm; }
    .co-contact { font-size: 8pt; color: #6b7280; line-height: 1.8; }
    /* Address zone */
    .az { padding: 8mm 20mm 0 25mm; }
    .sender-ref { font-size: 6pt; color: #6b7280; border-bottom: 0.25pt solid #aaa; padding-bottom: 1.5mm; margin-bottom: 2mm; white-space: nowrap; overflow: hidden; }
    .recipient { font-size: 10pt; line-height: 1.6; }
    .recipient-name { font-weight: 600; }
    /* Invoice badge */
    .inv-block { padding: 10mm 20mm 0 25mm; }
    .inv-title { font-size: 24pt; font-weight: 800; color: #1e40af; letter-spacing: -0.5pt; }
    .inv-num { font-size: 10pt; color: #374151; font-weight: 500; margin-top: 1mm; }
    /* Reference fields */
    .rl-gap { height: 5mm; }
    .rl-wrap { padding: 0 20mm 0 25mm; }
    .rl { background: #f8fafc; border-top: 2pt solid #1e40af; border-bottom: 0.5pt solid #d1d5db; display: flex; padding: 2.5mm 4mm; }
    .rf { flex: 1; padding-right: 4mm; }
    .rf:last-child { padding-right: 0; }
    .rf-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #6b7280; font-weight: 700; margin-bottom: 1mm; }
    .rf-value { font-size: 9pt; font-weight: 600; color: #111827; }
    /* Main content */
    .main { flex: 1; padding: 6mm 20mm 0 25mm; }
    .items { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    .items thead tr { background: #f1f5f9; border-bottom: 2pt solid #1e40af; }
    .items th { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #374151; padding: 2.5mm 6pt; font-weight: 700; }
    .items th:not(:first-child) { text-align: right; }
    .items td { vertical-align: top; }
    .totals-wrap { display: flex; justify-content: flex-end; }
    .totals { width: 65mm; border-collapse: collapse; border-top: 0.5pt solid #d1d5db; padding-top: 1mm; }
    .totals td { padding: 1.5mm 0; font-size: 9.5pt; }
    .totals td:last-child { text-align: right; }
    .tot-muted { color: #6b7280; }
    .tot-row td { font-size: 11pt; font-weight: 700; border-top: 1pt solid #111827; padding-top: 2.5mm; }
    .notes { margin-top: 5mm; }
    .sec-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #6b7280; font-weight: 700; margin-bottom: 1.5mm; }
    .notes p { font-size: 9pt; color: #374151; white-space: pre-wrap; }
    .thankyou { margin-top: 7mm; padding: 3mm 5mm; border-left: 3pt solid #1e40af; background: #f8fafc; font-size: 9pt; color: #374151; }
    .footer-sec { padding: 2mm 20mm 3mm; border-top: 0.5pt solid #e5e7eb; text-align: center; font-size: 7.5pt; color: #9ca3af; }
    /* DRAFT watermark */
    .watermark { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 100pt; font-weight: 900; color: rgba(0,0,0,0.045); letter-spacing: 8pt; pointer-events: none; user-select: none; white-space: nowrap; z-index: 0; }
  </style>
</head>
<body>
<div class="page">

  ${isDraft ? '<div class="watermark">DRAFT</div>' : ''}

  <!-- Letterhead: company name+address LEFT, logo RIGHT -->
  <div class="lh">
    <div>
      <div class="co-name">${company.name || ''}</div>
      <div class="co-contact">
        ${company.address ? `<div>${company.address}</div>` : ''}
        ${[company.city, company.state, company.zip].filter(Boolean).join(', ') ? `<div>${[company.city, company.state, company.zip].filter(Boolean).join(', ')}</div>` : ''}
        ${company.phone   ? `<div>${company.phone}</div>` : ''}
        ${company.email   ? `<div>${company.email}</div>` : ''}
        ${company.website ? `<div>${company.website}</div>` : ''}
        ${company.tax_id  ? `<div>Tax ID: ${company.tax_id}</div>` : ''}
      </div>
    </div>
    ${logoTag}
  </div>

  <!-- Customer address -->
  <div class="az">
    <div class="sender-ref">${company.name || ''}${companyAddr ? ` · ${companyAddr}` : ''}</div>
    <div class="recipient">
      <div class="recipient-name">${invoice.customer_name || '—'}</div>
      ${customerAddr           ? `<div>${customerAddr}</div>` : ''}
      ${invoice.customer_email ? `<div>${invoice.customer_email}</div>` : ''}
      ${invoice.customer_phone ? `<div>${invoice.customer_phone}</div>` : ''}
    </div>
  </div>

  <!-- Invoice badge: left-aligned, below address -->
  <div class="inv-block">
    <div class="inv-title">INVOICE</div>
    <div class="inv-num">#${invoice.invoice_number}</div>
    ${statusBadge}
  </div>

  <!-- Reference fields -->
  <div class="rl-gap"></div>
  <div class="rl-wrap">
    <div class="rl">
      <div class="rf"><div class="rf-label">Invoice No.</div><div class="rf-value">${invoice.invoice_number}</div></div>
      <div class="rf"><div class="rf-label">Issue Date</div><div class="rf-value">${formatDate(invoice.issue_date)}</div></div>
      <div class="rf"><div class="rf-label">Due Date</div><div class="rf-value">${formatDate(invoice.due_date)}</div></div>
    </div>
  </div>

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
    <div class="thankyou">Thank you for your business. Please don&rsquo;t hesitate to reach out if you have any questions regarding this invoice.</div>
  </div>

  <!-- Spacer to push footer to bottom -->
  <div style="flex:1;"></div>

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

/**
 * Generate a PDF from raw HTML captured from the React preview component.
 * The HTML is the serialized inner A4 div (794×1123 px, all inline styles).
 */
async function generatePdfFromHtml(innerHtml, baseUrl) {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 794px; height: 1123px; overflow: hidden; background: #fff; }
  </style>
</head>
<body>${innerHtml}</body>
</html>`;
  const browser = await puppeteer.launch({
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    }),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });
  await page.setContent(fullHtml, { waitUntil: 'networkidle0', baseURL: baseUrl });
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

    const { customer_id, issue_date, due_date, notes, footer_text, tax_rate, items, text_block_ids } = req.body;
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

    const safeBlockIds = Array.isArray(text_block_ids)
      ? text_block_ids.slice(0, 100).map(Number).filter(Number.isInteger)
      : [];
    for (const [i, blockId] of safeBlockIds.entries()) {
      await client.query(
        'INSERT INTO invoice_text_blocks (invoice_id, text_block_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [invoice.id, blockId, i],
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

    const { customer_id, status, issue_date, due_date, notes, footer_text, tax_rate, items, text_block_ids } = req.body;
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

    await client.query('DELETE FROM invoice_text_blocks WHERE invoice_id=$1', [req.params.id]);
    const safeBlockIds = Array.isArray(text_block_ids)
      ? text_block_ids.slice(0, 100).map(Number).filter(Number.isInteger)
      : [];
    for (const [i, blockId] of safeBlockIds.entries()) {
      await client.query(
        'INSERT INTO invoice_text_blocks (invoice_id, text_block_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [invoice.id, blockId, i],
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

// GET invoice as PDF download (legacy — uses server-side HTML template)
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

// POST generate PDF from React-rendered HTML (same output as the live preview)
router.post('/:id/pdf-from-html', async (req, res) => {
  const { html } = req.body;
  if (!html || typeof html !== 'string') return res.status(400).json({ error: 'html body required' });

  const invoice = await getFullInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const port = process.env.PORT || 4000;
  const baseUrl = `http://localhost:${port}`;
  const pdf = await generatePdfFromHtml(html, baseUrl);

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
