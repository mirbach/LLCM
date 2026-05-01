use shared::{BankAccount, CompanySettings, Customer, Invoice, InvoiceStatus, NetIncomeReport, TextBlock};

/// Render an invoice as A4 HTML with inline CSS (DIN 5008 Form A layout).
/// The HTML is passed to chromiumoxide for PDF conversion.
pub fn render_invoice_html(
    invoice: &Invoice,
    customer: Option<&Customer>,
    company: &CompanySettings,
    bank_accounts: &[BankAccount],
    text_blocks: &[TextBlock],
) -> String {
    let is_german = customer
        .map(|c| c.country.to_lowercase() == "germany" || c.country.to_lowercase() == "deutschland")
        .unwrap_or(false);

    let is_draft = invoice.status == InvoiceStatus::Draft;

    // Localised labels
    let label_invoice = if is_german { "RECHNUNG" } else { "INVOICE" };
    let label_invoice_no = if is_german { "Rechnungsnummer" } else { "Invoice No." };
    let label_issue_date = if is_german { "Rechnungsdatum" } else { "Issue Date" };
    let label_due_date = if is_german { "Fälligkeitsdatum" } else { "Due Date" };
    let label_description = if is_german { "Beschreibung" } else { "Description" };
    let label_qty = if is_german { "Menge" } else { "Qty" };
    let label_unit_price = if is_german { "Einzelpreis" } else { "Unit Price" };
    let label_amount = if is_german { "Betrag" } else { "Amount" };
    let label_subtotal = if is_german { "Zwischensumme" } else { "Subtotal" };
    let label_tax = if is_german { "MwSt." } else { "Tax" };
    let label_total = if is_german { "Gesamtbetrag" } else { "Total" };
    let label_bank_details = if is_german { "Bankverbindung" } else { "Payment Details" };
    let label_iban = "IBAN";
    let label_bic = "BIC/SWIFT";
    let label_account = if is_german { "Kontonummer" } else { "Account No." };
    let label_sort = if is_german { "Bankleitzahl" } else { "Sort Code" };
    let label_routing = if is_german { "Routing" } else { "Routing No." };
    let label_status_draft = if is_german { "ENTWURF" } else { "DRAFT" };

    let currency_sym = currency_symbol(&invoice.currency);
    let customer_block = customer.map(|c| {
        let name_line = if !c.contact_person.is_empty() {
            format!("{}<br>{}", html_escape(&c.name), html_escape(&c.contact_person))
        } else {
            html_escape(&c.name)
        };
        format!(
            "{}<br>{}<br>{} {}<br>{}",
            name_line,
            html_escape(&c.address),
            html_escape(&c.zip),
            html_escape(&c.city),
            html_escape(&c.country)
        )
    }).unwrap_or_default();

    // Line items
    let items_html: String = invoice.items.iter().map(|item| {
        format!(
            r#"<tr>
              <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">{}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">{}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">{}{:.2}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">{}{:.2}</td>
            </tr>"#,
            html_escape(&item.description),
            format_number(item.quantity),
            currency_sym,
            item.unit_price,
            currency_sym,
            item.amount,
        )
    }).collect();

    // Bank accounts section
    let banks_html: String = bank_accounts.iter().map(|b| {
        let mut rows = String::new();
        if !b.bank_name.is_empty() {
            rows.push_str(&format!("<div><strong>{}</strong></div>", html_escape(&b.bank_name)));
        }
        if !b.iban.is_empty() {
            rows.push_str(&format!("<div>{}: {}</div>", label_iban, html_escape(&b.iban)));
        }
        if !b.bic_swift.is_empty() {
            rows.push_str(&format!("<div>{}: {}</div>", label_bic, html_escape(&b.bic_swift)));
        }
        if !b.account_number.is_empty() {
            rows.push_str(&format!("<div>{}: {}</div>", label_account, html_escape(&b.account_number)));
        }
        if !b.sort_code.is_empty() {
            rows.push_str(&format!("<div>{}: {}</div>", label_sort, html_escape(&b.sort_code)));
        }
        if !b.routing_number.is_empty() {
            rows.push_str(&format!("<div>{}: {}</div>", label_routing, html_escape(&b.routing_number)));
        }
        format!(r#"<div style="margin-bottom:12px;">{}</div>"#, rows)
    }).collect();

    // Text blocks
    let text_blocks_html: String = text_blocks.iter().map(|tb| {
        let content = if is_german && !tb.content_de.is_empty() {
            &tb.content_de
        } else {
            &tb.content
        };
        format!(
            r#"<div style="margin-bottom:12px;white-space:pre-wrap;font-size:11px;color:#444;">{}</div>"#,
            html_escape(content)
        )
    }).collect();

    // Logo
    let logo_html = if let Some(path) = &company.logo_path {
        format!(
            r#"<img src="{}" style="max-height:60px;max-width:180px;object-fit:contain;" />"#,
            html_escape(path)
        )
    } else {
        String::new()
    };

    // Draft watermark
    let watermark = if is_draft {
        format!(
            r#"<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);
                           font-size:120px;font-weight:900;color:rgba(200,0,0,0.08);
                           pointer-events:none;user-select:none;z-index:9999;white-space:nowrap;">
                 {label_status_draft}
               </div>"#
        )
    } else {
        String::new()
    };

    let tax_display = if invoice.tax_rate > 0.0 {
        format!(
            r#"<tr>
              <td colspan="3" style="text-align:right;padding:4px 8px;color:#555;">{} ({:.0}%)</td>
              <td style="text-align:right;padding:4px 8px;">{}{:.2}</td>
            </tr>"#,
            label_tax, invoice.tax_rate, currency_sym, invoice.tax_amount
        )
    } else {
        String::new()
    };

    let payment_section = if !bank_accounts.is_empty() {
        format!(
            r#"<div style="margin-top:24px;padding:16px;background:#f9f9f9;border-radius:6px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:8px;">{}</div>
              {}
            </div>"#,
            label_bank_details, banks_html
        )
    } else {
        String::new()
    };

    let notes_section = if !invoice.notes.is_empty() {
        format!(
            r#"<div style="margin-top:16px;font-size:11px;color:#555;white-space:pre-wrap;">{}</div>"#,
            html_escape(&invoice.notes)
        )
    } else {
        String::new()
    };

    let footer_section = if !invoice.footer_text.is_empty() {
        format!(
            r#"<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center;">{}</div>"#,
            html_escape(&invoice.footer_text)
        )
    } else if !company.footer_text.is_empty() {
        format!(
            r#"<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center;">{}</div>"#,
            html_escape(&company.footer_text)
        )
    } else {
        String::new()
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
      width: 794px;
      min-height: 1123px;
    }}
    table {{ border-collapse: collapse; width: 100%; }}
    th {{ background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }}
  </style>
</head>
<body>
  {watermark}

  <!-- Letterhead -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <div style="font-size:18px;font-weight:700;color:#111;">{company_name}</div>
      <div style="font-size:11px;color:#666;margin-top:4px;white-space:pre-line;">{company_addr}</div>
      {company_contact}
    </div>
    <div style="text-align:right;">{logo_html}</div>
  </div>

  <!-- Customer address (DIN 5008 window zone) -->
  <div style="margin-bottom:24px;min-height:60px;">
    <div style="font-size:11px;color:#333;line-height:1.6;">{customer_block}</div>
  </div>

  <!-- Invoice title + meta -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">{label_invoice}</div>
    {draft_badge}
  </div>

  <!-- Reference fields -->
  <div style="display:flex;gap:32px;margin-bottom:24px;font-size:11px;color:#555;">
    <div><span style="color:#999;display:block;font-size:10px;text-transform:uppercase;">{label_invoice_no}</span>{invoice_number}</div>
    <div><span style="color:#999;display:block;font-size:10px;text-transform:uppercase;">{label_issue_date}</span>{issue_date}</div>
    <div><span style="color:#999;display:block;font-size:10px;text-transform:uppercase;">{label_due_date}</span>{due_date}</div>
  </div>

  <!-- Line items table -->
  <table style="margin-bottom:8px;">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #eee;">{label_description}</th>
        <th style="text-align:right;padding:8px;border-bottom:2px solid #eee;">{label_qty}</th>
        <th style="text-align:right;padding:8px;border-bottom:2px solid #eee;">{label_unit_price}</th>
        <th style="text-align:right;padding:8px;border-bottom:2px solid #eee;">{label_amount}</th>
      </tr>
    </thead>
    <tbody>
      {items_html}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;padding:8px;border-top:2px solid #eee;color:#555;">{label_subtotal}</td>
        <td style="text-align:right;padding:8px;border-top:2px solid #eee;">{currency_sym}{subtotal:.2}</td>
      </tr>
      {tax_display}
      <tr>
        <td colspan="3" style="text-align:right;padding:8px;font-weight:700;font-size:14px;">{label_total}</td>
        <td style="text-align:right;padding:8px;font-weight:700;font-size:14px;">{currency_sym}{total:.2}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Notes & Text blocks -->
  {notes_section}
  {text_blocks_html}

  <!-- Payment details -->
  {payment_section}

  <!-- Footer -->
  {footer_section}
</body>
</html>"#,
        watermark = watermark,
        company_name = html_escape(&company.name),
        company_addr = format_company_address(company),
        company_contact = format_company_contact(company),
        logo_html = logo_html,
        customer_block = customer_block,
        label_invoice = label_invoice,
        draft_badge = if is_draft {
            format!(r#"<span style="background:#fee2e2;color:#dc2626;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;">{}</span>"#, label_status_draft)
        } else { String::new() },
        label_invoice_no = label_invoice_no,
        invoice_number = html_escape(&invoice.invoice_number),
        label_issue_date = label_issue_date,
        issue_date = invoice.issue_date.format("%d.%m.%Y"),
        label_due_date = label_due_date,
        due_date = invoice.due_date.format("%d.%m.%Y"),
        label_description = label_description,
        label_qty = label_qty,
        label_unit_price = label_unit_price,
        label_amount = label_amount,
        items_html = items_html,
        label_subtotal = label_subtotal,
        currency_sym = currency_sym,
        subtotal = invoice.subtotal,
        tax_display = tax_display,
        label_total = label_total,
        total = invoice.total,
        notes_section = notes_section,
        text_blocks_html = text_blocks_html,
        payment_section = payment_section,
        footer_section = footer_section,
    )
}

/// Render the net income report as printable HTML.
pub fn render_net_income_html(report: &NetIncomeReport, company: &CompanySettings) -> String {
    let rows: String = report.buckets.iter().map(|b| {
        format!(
            r#"<tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">{}</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">{:.2}</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">{:.2}</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">{:.2}</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;">{:.2}</td>
              <td style="padding:8px;text-align:right;font-weight:700;border-bottom:1px solid #eee;">{:.2}</td>
            </tr>"#,
            b.currency,
            b.invoice_receipts,
            b.bank_receipts,
            b.expenses,
            b.owner_withdrawals,
            b.net_income,
        )
    }).collect();

    format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {{ font-family: Arial, sans-serif; padding: 40px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th {{ background: #f5f5f5; text-align: right; padding: 8px; font-size: 11px; text-transform: uppercase; color: #888; }}
    th:first-child {{ text-align: left; }}
  </style>
</head>
<body>
  <h2 style="margin-bottom:4px;">{} — Net Income Report</h2>
  <p style="color:#888;font-size:12px;margin-bottom:24px;">Period: {}</p>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Currency</th>
        <th>Invoice Receipts</th>
        <th>Bank Receipts</th>
        <th>Expenses</th>
        <th>Withdrawals</th>
        <th>Net Income</th>
      </tr>
    </thead>
    <tbody>{}</tbody>
  </table>
</body>
</html>"#,
        html_escape(&company.name),
        html_escape(&report.period),
        rows,
    )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn currency_symbol(currency: &str) -> &'static str {
    match currency.to_uppercase().as_str() {
        "EUR" => "€",
        "GBP" => "£",
        "JPY" => "¥",
        "CHF" => "CHF ",
        "CAD" => "CA$",
        "AUD" => "AU$",
        _ => "$",
    }
}

fn format_number(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{:.0}", n)
    } else {
        format!("{:.2}", n)
    }
}

fn format_company_address(company: &CompanySettings) -> String {
    let mut parts = vec![];
    if !company.address.is_empty() { parts.push(html_escape(&company.address)); }
    let city_zip: Vec<String> = [&company.zip, &company.city]
        .iter().filter(|s| !s.is_empty()).map(|s| html_escape(s)).collect();
    if !city_zip.is_empty() { parts.push(city_zip.join(" ")); }
    if !company.country.is_empty() { parts.push(html_escape(&company.country)); }
    parts.join("<br>")
}

fn format_company_contact(company: &CompanySettings) -> String {
    let mut parts = vec![];
    if !company.email.is_empty() {
        parts.push(format!("<div style='font-size:11px;color:#888;margin-top:4px;'>{}</div>", html_escape(&company.email)));
    }
    if !company.phone.is_empty() {
        parts.push(format!("<div style='font-size:11px;color:#888;'>{}</div>", html_escape(&company.phone)));
    }
    if !company.website.is_empty() {
        parts.push(format!("<div style='font-size:11px;color:#888;'>{}</div>", html_escape(&company.website)));
    }
    if !company.tax_id.is_empty() {
        parts.push(format!("<div style='font-size:11px;color:#888;'>Tax ID: {}</div>", html_escape(&company.tax_id)));
    }
    parts.join("")
}
