import { useRef, useState, useEffect } from 'react';

/** DIN 5008 Form A live preview — scales to fill its container */
export default function InvoicePreview({ invoice = {}, customer = null, company = {}, bankAccounts = [] }) {
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 794));
    obs.observe(el);
    setScale(el.getBoundingClientRect().width / 794);
    return () => obs.disconnect();
  }, []);
  const fmt = (n) => Number(n || 0).toFixed(2);
  const currency = invoice.currency || 'USD';
  const fmtAmt = (n) => `${currency} ${fmt(n)}`;

  const items = invoice.items || [];
  const subtotal = items.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0);
  const taxRate = Number(invoice.tax_rate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const companyAddr = [company.address, company.city, company.state, company.zip].filter(Boolean).join(', ');
  const custAddr = customer ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ') : '';

  const statusBg   = { draft: '#f3f4f6', sent: '#dbeafe', paid: '#d1fae5', overdue: '#fee2e2' };
  const statusColor = { draft: '#6b7280', sent: '#1e40af', paid: '#065f46', overdue: '#991b1b' };
  const sBg  = statusBg[invoice.status]    || statusBg.draft;
  const sClr = statusColor[invoice.status] || statusColor.draft;

  // 1 mm at 96 dpi on A4 (794px = 210 mm)
  const mm = (v) => Math.round(v * 3.7795);

  const refFields = [
    { label: 'Customer',    value: customer?.name || '—' },
    ...(customer?.customer_number ? [{ label: 'Customer No.', value: customer.customer_number }] : []),
    { label: 'Invoice No.', value: invoice.invoice_number || '—' },
    { label: 'Issue Date',  value: invoice.issue_date || '—' },
    { label: 'Due Date',    value: invoice.due_date   || '—' },
  ];

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#fff' }}>
      {/* Inner A4 canvas: 794 × 1123 px, scaled to fit wrapper */}
      <div style={{
        width: 794, height: 1123,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        position: 'absolute', top: 0, left: 0,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 10, color: '#000',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* DIN fold marks at 105 mm and 210 mm */}
        <div style={{ position: 'absolute', left: mm(5), top: mm(105), width: mm(4), borderTop: '0.5px solid #ccc' }} />
        <div style={{ position: 'absolute', left: mm(5), top: mm(210), width: mm(4), borderTop: '0.5px solid #ccc' }} />

        {/* ── Letterhead: 0–27 mm ── */}
        <div style={{ height: mm(27), padding: `${mm(5)}px ${mm(20)}px 0 ${mm(25)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            {company.logo_path && <img src={company.logo_path} alt="" style={{ maxHeight: mm(13), maxWidth: mm(45), objectFit: 'contain', display: 'block', marginBottom: 3 }} />}
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e40af' }}>{company.name || 'Your Company'}</div>
          </div>
          <div style={{ fontSize: 8, color: '#6b7280', lineHeight: 1.6, textAlign: 'right' }}>
            {company.address && <div>{company.address}</div>}
            {[company.city, company.state, company.zip].filter(Boolean).length > 0 && <div>{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</div>}
            {company.phone   && <div>{company.phone}</div>}
            {company.email   && <div>{company.email}</div>}
            {company.website && <div>{company.website}</div>}
            {company.tax_id  && <div>Tax ID: {company.tax_id}</div>}
          </div>
        </div>

        {/* ── Reserved gap: 27–45 mm ── */}
        <div style={{ height: mm(18), flexShrink: 0 }} />

        {/* ── Address zone: 45–90 mm (left 20 mm for envelope window) ── */}
        <div style={{ padding: `0 ${mm(20)}px 0 ${mm(20)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0, minHeight: mm(45) }}>
          <div style={{ width: mm(85) }}>
            {/* Absenderzeile — sender reference line */}
            <div style={{ fontSize: 7, color: '#6b7280', borderBottom: '0.5px solid #bbb', paddingBottom: 4, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {company.name}{companyAddr ? ` · ${companyAddr}` : ''}
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600 }}>{customer?.name || '—'}</div>
              {customer?.customer_number && <div style={{ fontSize: 8, color: '#9ca3af' }}>{customer.customer_number}</div>}
              {custAddr && <div>{custAddr}</div>}
              {customer?.email && <div>{customer.email}</div>}
              {customer?.phone && <div>{customer.phone}</div>}
            </div>
          </div>
          {/* Invoice badge — top-right of address zone */}
          <div style={{ textAlign: 'right', paddingRight: mm(5) }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1e40af', letterSpacing: -1 }}>INVOICE</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>#{invoice.invoice_number || '—'}</div>
            <span style={{ display: 'inline-block', marginTop: 8, padding: '2px 10px', borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', background: sBg, color: sClr }}>
              {invoice.status || 'draft'}
            </span>
          </div>
        </div>

        {/* ── Gap → reference line (~97 mm) ── */}
        <div style={{ height: mm(7), flexShrink: 0 }} />

        {/* ── Reference fields line (Bezugszeichenzeile) ── */}
        <div style={{ padding: `${mm(2.5)}px ${mm(20)}px`, borderTop: '0.5px solid #d1d5db', borderBottom: '0.5px solid #d1d5db', display: 'flex', flexShrink: 0 }}>
          {refFields.map(({ label, value }) => (
            <div key={label} style={{ flex: 1, paddingRight: mm(4) }}>
              <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4, color: '#9ca3af', marginBottom: 3, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#111827' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Subject line (~103 mm) ── */}
        <div style={{ height: mm(5), flexShrink: 0 }} />
        <div style={{ padding: `0 ${mm(20)}px 0 ${mm(25)}px`, fontSize: 13, fontWeight: 700, color: '#111827', flexShrink: 0 }}>
          Invoice No. {invoice.invoice_number || '—'}
        </div>

        {/* ── Main content (flex: 1 — grows to fill) ── */}
        <div style={{ flex: 1, padding: `${mm(5)}px ${mm(20)}px 0 ${mm(25)}px`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: mm(4) }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #111827' }}>
                {[['Description', 'left', null], ['Qty', 'right', 50], ['Unit Price', 'right', 90], ['Amount', 'right', 90]].map(([h, align, w]) => (
                  <th key={h} style={{ textAlign: align, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', padding: '6px 0', fontWeight: 600, ...(w ? { width: w } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} style={{ padding: '20px 0', textAlign: 'center', color: '#d1d5db', fontSize: 9 }}>No line items yet</td></tr>}
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 0', fontSize: 9, color: '#111827' }}>{item.description || '—'}</td>
                  <td style={{ padding: '5px 0', fontSize: 9, color: '#6b7280', textAlign: 'right' }}>{item.quantity || 0}</td>
                  <td style={{ padding: '5px 0', fontSize: 9, color: '#6b7280', textAlign: 'right' }}>{fmtAmt(item.unit_price)}</td>
                  <td style={{ padding: '5px 0', fontSize: 9, color: '#111827', textAlign: 'right', fontWeight: 500 }}>{fmtAmt(Number(item.quantity || 0) * Number(item.unit_price || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 9 }}>
                <span style={{ color: '#6b7280' }}>Subtotal</span><span>{fmtAmt(subtotal)}</span>
              </div>
              {taxRate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 9 }}>
                  <span style={{ color: '#6b7280' }}>Tax ({taxRate}%)</span><span>{fmtAmt(taxAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12, fontWeight: 700, borderTop: '1px solid #111827', marginTop: 3 }}>
                <span>Total</span><span>{fmtAmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ marginTop: mm(4) }}>
              <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>Notes</div>
              <p style={{ fontSize: 9, color: '#374151', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
            </div>
          )}

          {/* Spacer — pushes bank details to bottom */}
          <div style={{ flex: 1 }} />
        </div>

        {/* ── Payment Details — pinned to page bottom ── */}
        {bankAccounts.length > 0 && (
          <div style={{ padding: `${mm(4)}px ${mm(20)}px ${mm(5)}px ${mm(25)}px`, borderTop: '0.5px solid #d1d5db', flexShrink: 0 }}>
            <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4, color: '#9ca3af', fontWeight: 600, marginBottom: mm(2) }}>Payment Details</div>
            {bankAccounts.map((b, i) => (
              <div key={b.id} style={{ marginBottom: i < bankAccounts.length - 1 ? mm(3) : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>{b.account_name}</div>
                {b.bank_name    && <div style={{ fontSize: 9, fontWeight: 600, color: '#374151' }}>{b.bank_name}</div>}
                {b.bank_address && <div style={{ fontSize: 8, color: '#4b5563' }}>{b.bank_address}</div>}
                <div style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>
                  {b.iban           && <span style={{ marginRight: mm(3) }}>IBAN: {b.iban}</span>}
                  {b.account_number && <span style={{ marginRight: mm(3) }}>Account #: {b.account_number}</span>}
                  {b.sort_code      && <span style={{ marginRight: mm(3) }}>Sort Code: {b.sort_code}</span>}
                  {b.routing_number && <span style={{ marginRight: mm(3) }}>Routing #: {b.routing_number}</span>}
                  {b.bic_swift      && <span>BIC/SWIFT: {b.bic_swift}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        {(invoice.footer_text || company.footer_text) && (
          <div style={{ padding: `${mm(3)}px ${mm(20)}px ${mm(5)}px ${mm(20)}px`, borderTop: '0.5px solid #e5e7eb', textAlign: 'center', fontSize: 8, color: '#9ca3af', flexShrink: 0 }}>
            {invoice.footer_text || company.footer_text}
          </div>
        )}
      </div>
    </div>
  );
}
