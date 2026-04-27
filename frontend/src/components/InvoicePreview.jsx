import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';

/** DIN 5008 Form A live preview — scales to fill its container */
const InvoicePreview = forwardRef(function InvoicePreview({ invoice = {}, customer = null, company = {}, bankAccounts = [], selectedTextBlocks = [] }, ref) {
  const wrapperRef = useRef(null);
  const a4Ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 794));
    obs.observe(el);
    setScale(el.getBoundingClientRect().width / 794);
    return () => obs.disconnect();
  }, []);

  // Expose getHtml() so parent can capture the rendered A4 canvas for PDF generation
  useImperativeHandle(ref, () => ({
    async getHtml() {
      const el = a4Ref.current;
      if (!el) return null;
      // Clone so we can strip the scale transform without mutating the live DOM
      const clone = el.cloneNode(true);
      clone.style.transform = '';
      clone.style.position = 'relative';
      // Embed all images as base64 data URIs so Puppeteer needs no network access
      const imgs = Array.from(clone.querySelectorAll('img[src]'));
      await Promise.all(imgs.map(async (img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => { img.src = reader.result; resolve(); };
            reader.readAsDataURL(blob);
          });
        } catch {
          // leave src as-is if fetch fails
        }
      }));
      return clone.outerHTML;
    },
  }));
  const fmt = (n) => Number(n || 0).toFixed(2);
  const currency = invoice.currency || 'USD';
  const fmtAmt = (n) => `${currency} ${fmt(n)}`;

  // Locale: German if customer country is Germany, English otherwise
  const isDE = customer?.country?.toLowerCase().trim() === 'germany';

  const t = isDE ? {
    invoice:        'RECHNUNG',
    draft:          'ENTWURF',
    invoiceNo:      'Rechnungsnummer',
    issueDate:      'Rechnungsdatum',
    dueDate:        'Fälligkeitsdatum',
    description:    'Beschreibung',
    qty:            'Menge',
    unitPrice:      'Einzelpreis',
    amount:         'Betrag',
    subtotal:       'Zwischensumme',
    tax:            (r) => `MwSt. (${r}%)`,
    total:          'Gesamtbetrag',
    notes:          'Anmerkungen',
    thanks:         'Vielen Dank für Ihr Vertrauen. Bei Fragen zu dieser Rechnung stehen wir Ihnen gerne zur Verfügung.',
    paymentDetails: 'Zahlungsdetails',
    noItems:        'Noch keine Positionen',
    taxId:          'Steuernummer:',
    statuses:       { draft: 'Entwurf', sent: 'Gesendet', paid: 'Bezahlt', overdue: 'Überfällig' },
  } : {
    invoice:        'INVOICE',
    draft:          'DRAFT',
    invoiceNo:      'Invoice No.',
    issueDate:      'Issue Date',
    dueDate:        'Due Date',
    description:    'Description',
    qty:            'Qty',
    unitPrice:      'Unit Price',
    amount:         'Amount',
    subtotal:       'Subtotal',
    tax:            (r) => `Tax (${r}%)`,
    total:          'Total',
    notes:          'Notes',
    thanks:         "Thank you for your business. Please don't hesitate to reach out if you have any questions regarding this invoice.",
    paymentDetails: 'Payment Details',
    noItems:        'No line items yet',
    taxId:          'Tax ID:',
    statuses:       { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue' },
  };

  const items = invoice.items || [];
  const subtotal = items.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0);
  const taxRate = Number(invoice.tax_rate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const companyAddr = [company.address, company.city, company.state, company.zip].filter(Boolean).join(', ');
  const custAddr = customer ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ') : '';

  const statusBg    = { draft: '#fef9c3', sent: '#dbeafe', paid: '#d1fae5', overdue: '#fee2e2' };
  const statusColor = { draft: '#854d0e', sent: '#1e40af', paid: '#065f46', overdue: '#991b1b' };
  const sBg  = statusBg[invoice.status]    || statusBg.draft;
  const sClr = statusColor[invoice.status] || statusColor.draft;
  const isDraft = !invoice.status || invoice.status === 'draft';

  // 1 mm at 96 dpi on A4 (794px = 210 mm)
  const mm = (v) => Math.round(v * 3.7795);

  // Format a date string (YYYY-MM-DD or ISO) for display
  function fmtDate(raw) {
    if (!raw) return '\u2014';
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    if (isDE) {
      // DD.MM.YYYY
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}.${mm}.${d.getUTCFullYear()}`;
    }
    return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  const customerNo = isDE ? 'Kundennummer' : 'Customer No.';
  const refFields = [
    { label: t.invoiceNo,  value: invoice.invoice_number || '\u2014' },
    ...(customer?.customer_number ? [{ label: customerNo, value: customer.customer_number }] : []),
    { label: t.issueDate,  value: fmtDate(invoice.issue_date) },
    { label: t.dueDate,    value: fmtDate(invoice.due_date) },
  ];

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#fff' }}>
      {/* Inner A4 canvas: 794 × 1123 px, scaled to fit wrapper */}
      <div ref={a4Ref} style={{
        width: 794, height: 1123,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        position: 'absolute', top: 0, left: 0,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 10, color: '#000',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* DRAFT diagonal watermark */}
        {isDraft && (
          <div style={{
            position: 'absolute', top: '38%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(-35deg)',
            fontSize: 130, fontWeight: 900,
            color: 'rgba(0,0,0,0.045)',
            letterSpacing: 10, pointerEvents: 'none',
            userSelect: 'none', zIndex: 0, whiteSpace: 'nowrap',
          }}>{t.draft}</div>
        )}

        {/* ── Letterhead: company name+address LEFT, logo RIGHT ── */}
        <div style={{ padding: `${mm(12)}px ${mm(20)}px 0 ${mm(25)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          {/* Left: name + address */}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1e40af', letterSpacing: -0.5, marginBottom: 5 }}>{company.name || 'Your Company'}</div>
            <div style={{ fontSize: 8.5, color: '#6b7280', lineHeight: 1.8 }}>
              {company.address && <div>{company.address}</div>}
              {[company.city, company.state, company.zip].filter(Boolean).length > 0 && <div>{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</div>}
              {company.phone   && <div>{company.phone}</div>}
              {company.email   && <div>{company.email}</div>}
              {company.website && <div>{company.website}</div>}
              {company.tax_id  && <div>{t.taxId} {company.tax_id}</div>}
            </div>
          </div>
          {/* Right: logo */}
          {company.logo_path && (
            <img src={company.logo_path} alt="" style={{ maxHeight: mm(20), maxWidth: mm(60), objectFit: 'contain', display: 'block' }} />
          )}
        </div>



        {/* ── Gap after header ── */}
        <div style={{ height: mm(8), flexShrink: 0 }} />

        {/* ── Address zone: customer address only ── */}
        <div style={{ padding: `0 ${mm(20)}px 0 ${mm(25)}px`, flexShrink: 0 }}>
          {/* Absenderzeile — sender reference line */}
          <div style={{ fontSize: 7, color: '#6b7280', borderBottom: '0.5px solid #bbb', paddingBottom: 3, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {company.name}{companyAddr ? ` · ${companyAddr}` : ''}
          </div>
          <div style={{ fontSize: 10, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>{customer?.name || '—'}</div>
            {customer?.contact_person && (() => {
              const titleMap = { Mr: 'Herrn', Mrs: 'Frau', Ms: 'Frau', Dr: 'Dr.', Prof: 'Prof.' };
              const enMap   = { Mr: 'Mr.',  Mrs: 'Mrs.', Ms: 'Ms.', Dr: 'Dr.', Prof: 'Prof.' };
              const map = isDE ? titleMap : enMap;
              const prefix = customer.title ? map[customer.title] || customer.title : '';
              return <div>{prefix ? `${prefix} ` : ''}{customer.contact_person}</div>;
            })()}
            {customer?.address && <div>{customer.address}</div>}
            {(customer?.zip || customer?.city) && (
              <div>{[customer.zip, customer.city].filter(Boolean).join('\u00a0')}</div>
            )}
            {customer?.country && <div>{customer.country}</div>}
          </div>
        </div>

        {/* ── Invoice badge — below address, left-aligned ── */}
        <div style={{ padding: `${mm(10)}px ${mm(20)}px 0 ${mm(25)}px`, flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af', letterSpacing: -1 }}>{t.invoice}</div>
          {invoice.status && invoice.status !== 'draft' && (
            <span style={{
              display: 'inline-block', marginTop: 8,
              padding: '3px 12px', borderRadius: 4,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              background: sBg, color: sClr, border: `1px solid ${sClr}55`,
            }}>
              {t.statuses[invoice.status] || invoice.status}
            </span>
          )}
        </div>

        {/* ── Gap → reference fields ── */}
        <div style={{ height: mm(5), flexShrink: 0 }} />

        {/* ── Reference fields line ── */}
        <div style={{ padding: `0 ${mm(20)}px 0 ${mm(25)}px`, flexShrink: 0 }}>
          <div style={{ padding: `${mm(3)}px ${mm(4)}px`, borderTop: '2px solid #1e40af', borderBottom: '0.5px solid #d1d5db', display: 'flex', background: '#f8fafc' }}>
            {refFields.map(({ label, value }) => (
              <div key={label} style={{ flex: 1, paddingRight: mm(4) }}>
                <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', marginBottom: 3, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#111827' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main content (flex: 1 — grows to fill) ── */}
        <div style={{ flex: 1, padding: `${mm(6)}px ${mm(20)}px 0 ${mm(25)}px`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: mm(4) }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #1e40af' }}>
                {[[t.description, 'left', null], [t.qty, 'right', 50], [t.unitPrice, 'right', 90], [t.amount, 'right', 90]].map(([h, align, w]) => (
                  <th key={h} style={{ textAlign: align, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', padding: '8px 6px', fontWeight: 700, ...(w ? { width: w } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} style={{ padding: '20px 0', textAlign: 'center', color: '#d1d5db', fontSize: 9 }}>{t.noItems}</td></tr>}
              {items.map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '0.5px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 6px', fontSize: 9, color: '#111827' }}>{item.description || '—'}</td>
                  <td style={{ padding: '6px 6px', fontSize: 9, color: '#6b7280', textAlign: 'right' }}>{item.quantity || 0}</td>
                  <td style={{ padding: '6px 6px', fontSize: 9, color: '#6b7280', textAlign: 'right' }}>{fmtAmt(item.unit_price)}</td>
                  <td style={{ padding: '6px 6px', fontSize: 9, color: '#111827', textAlign: 'right', fontWeight: 500 }}>{fmtAmt(Number(item.quantity || 0) * Number(item.unit_price || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 210, borderTop: '0.5px solid #d1d5db', paddingTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 9 }}>
                <span style={{ color: '#6b7280' }}>{t.subtotal}</span><span>{fmtAmt(subtotal)}</span>
              </div>
              {taxRate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 9 }}>
                  <span style={{ color: '#6b7280' }}>{t.tax(taxRate)}</span><span>{fmtAmt(taxAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12, fontWeight: 700, borderTop: '1.5px solid #111827', marginTop: 3 }}>
                <span>{t.total}</span><span>{fmtAmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes — from selected text blocks (preferred) or legacy invoice.notes */}
          {(selectedTextBlocks.length > 0 || invoice.notes) && (
            <div style={{ marginTop: mm(5) }}>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', fontWeight: 700, marginBottom: 4 }}>{t.notes}</div>
              {selectedTextBlocks.length > 0
                ? selectedTextBlocks.map((tb) => {
                    const content = isDE && tb.content_de ? tb.content_de : tb.content;
                    return (
                      <p key={tb.id} style={{ fontSize: 9, color: '#374151', whiteSpace: 'pre-wrap', margin: `0 0 ${mm(4)}px 0` }}>{content}</p>
                    );
                  })
                : <p style={{ fontSize: 9, color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>{invoice.notes}</p>
              }
            </div>
          )}

          {/* Thank you message */}
          <div style={{ marginTop: mm(7), padding: `${mm(3)}px ${mm(5)}px`, borderLeft: '3px solid #1e40af', background: '#f8fafc' }}>
            <p style={{ fontSize: 9, color: '#374151', margin: 0 }}>
              {t.thanks}
            </p>
          </div>

          {/* Spacer — pushes footer to bottom */}
          <div style={{ flex: 1 }} />
        </div>

        {/* ── Payment Details — anchored to page bottom ── */}
        {bankAccounts.length > 0 && (
          <div style={{ padding: `0 ${mm(20)}px ${mm(12)}px ${mm(25)}px`, flexShrink: 0 }}>
          <div style={{ borderTop: '2px solid #1e40af', background: '#f8fafc', padding: `${mm(4)}px 0` }}>
            <div style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', fontWeight: 700, marginBottom: mm(2) }}>{t.paymentDetails}</div>
            {bankAccounts.map((b, i) => (
              <div key={b.id} style={{ marginBottom: i < bankAccounts.length - 1 ? mm(4) : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>{b.account_name}</div>
                {b.bank_name && (
                  <div style={{ borderTop: '0.5px solid #d1d5db', marginTop: 3, paddingTop: 3 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#374151' }}>{b.bank_name}</div>
                    {b.bank_address && <div style={{ fontSize: 8, color: '#6b7280' }}>{b.bank_address}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${mm(1)}px ${mm(6)}px`, fontSize: 8, color: '#6b7280', marginTop: 3 }}>
                  {b.iban           && <span><strong style={{ color: '#374151' }}>IBAN:</strong> {b.iban}</span>}
                  {b.account_number && <span><strong style={{ color: '#374151' }}>Account #:</strong> {b.account_number}</span>}
                  {b.routing_number && <span><strong style={{ color: '#374151' }}>Routing #:</strong> {b.routing_number}</span>}
                  {b.sort_code      && <span><strong style={{ color: '#374151' }}>Sort Code:</strong> {b.sort_code}</span>}
                  {b.bic_swift      && <span><strong style={{ color: '#374151' }}>BIC/SWIFT:</strong> {b.bic_swift}</span>}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}

        {/* ── Footer text ── */}
        {(invoice.footer_text || company.footer_text) && (
          <div style={{ padding: `${mm(2)}px ${mm(20)}px ${mm(3)}px ${mm(20)}px`, borderTop: '0.5px solid #e5e7eb', textAlign: 'center', fontSize: 8, color: '#9ca3af', flexShrink: 0 }}>
            {invoice.footer_text || company.footer_text}
          </div>
        )}
      </div>
    </div>
  );
});

export default InvoicePreview;
