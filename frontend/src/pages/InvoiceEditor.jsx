import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { invoices as invoicesApi, customers as customersApi, company as companyApi, bankAccount as bankAccountApi } from '../api.js';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { ArrowLeft, Download, Mail, X, Plus } from 'lucide-react';

const inputCls  = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls  = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const EMPTY_ITEM = { description: '', quantity: 1, unit_price: 0 };

const DEFAULT_FORM = {
  customer_id: '',
  status: 'draft',
  issue_date: today(),
  due_date: daysFromNow(30),
  notes: '',
  footer_text: '',
  tax_rate: 0,
  currency: 'USD',
  items: [{ ...EMPTY_ITEM }],
};

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue'];

export default function InvoiceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [customerList, setCustomerList] = useState([]);
  const [company, setCompany]           = useState({});
  const [bankAccounts, setBankAccounts] = useState([]);
  const [saving, setSaving]             = useState(false);
  const [sending, setSending]           = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: DEFAULT_FORM,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Watch everything for live preview
  const watchedValues = useWatch({ control });

  // Resolve selected customer for preview
  const selectedCustomer = customerList.find(
    (c) => String(c.id) === String(watchedValues.customer_id),
  ) || null;

  // Load customers + company + bank accounts on mount
  useEffect(() => {
    Promise.all([customersApi.list(), companyApi.get(), bankAccountApi.list()])
      .then(([cr, co, ba]) => {
        setCustomerList(cr.data);
        setCompany(co.data);
        setBankAccounts(ba.data.filter((b) => b.show_on_invoice)); // full list, filtered reactively by currency
      })
      .catch(() => toast.error('Failed to load data'));
  }, []);

  // Load existing invoice when editing
  useEffect(() => {
    if (!isNew) {
      invoicesApi.get(id).then((r) => {
        const inv = r.data;
        setInvoiceNumber(inv.invoice_number);
        reset({
          customer_id:  String(inv.customer_id ?? ''),
          status:       inv.status,
          issue_date:   inv.issue_date?.slice(0, 10) ?? today(),
          due_date:     inv.due_date?.slice(0, 10) ?? daysFromNow(30),
          notes:        inv.notes ?? '',
          footer_text:  inv.footer_text ?? '',
          tax_rate:     inv.tax_rate ?? 0,
          currency:     inv.currency ?? 'USD',
          items:        inv.items?.length ? inv.items : [{ ...EMPTY_ITEM }],
        });
      }).catch(() => toast.error('Failed to load invoice'));
    }
  }, [id, isNew, reset]);

  // When customer changes, auto-populate currency from that customer's profile
  const watchedCustomerId = watchedValues.customer_id;
  useEffect(() => {
    if (!watchedCustomerId) return;
    const cust = customerList.find((c) => String(c.id) === String(watchedCustomerId));
    if (cust?.currency) setValue('currency', cust.currency);
  }, [watchedCustomerId, customerList, setValue]);

  const onSubmit = useCallback(async (data) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        customer_id: data.customer_id || null,
        tax_rate: Number(data.tax_rate),
        items: data.items.map((item) => ({
          description: item.description,
          quantity:    Number(item.quantity),
          unit_price:  Number(item.unit_price),
        })),
      };

      let result;
      if (isNew) {
        result = await invoicesApi.create(payload);
        toast.success(`Invoice ${result.data.invoice_number} created`);
        navigate(`/invoices/${result.data.id}/edit`, { replace: true });
      } else {
        result = await invoicesApi.update(id, payload);
        toast.success('Invoice saved');
        setInvoiceNumber(result.data.invoice_number);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  }, [id, isNew, navigate]);

  async function handleSend() {
    if (isNew) return toast.error('Save the invoice first');
    setSending(true);
    try {
      await invoicesApi.send(id);
      toast.success('Invoice sent by email');
      setValue('status', 'sent');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  function handleDownloadPdf() {
    if (isNew) return toast.error('Save the invoice first');
    window.open(invoicesApi.pdfUrl(id), '_blank');
  }

  // Build preview object from live form values
  const previewInvoice = {
    ...watchedValues,
    invoice_number: isNew ? `${company.invoice_prefix || 'INV-'}XXXX` : invoiceNumber,
    currency: watchedValues.currency || selectedCustomer?.currency || 'USD',
    items: (watchedValues.items || []).map((item) => ({
      ...item,
      quantity:   Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
    })),
  };

  // Only show bank accounts whose currency matches the invoice currency
  const previewCurrency = previewInvoice.currency || 'USD';
  const filteredBankAccounts = bankAccounts.filter((b) => b.currency === previewCurrency);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Back to invoices"><ArrowLeft size={16} strokeWidth={1.75} /></Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {isNew ? 'New Invoice' : `Invoice ${invoiceNumber}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Download size={14} strokeWidth={1.75} /> PDF
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1.5 border border-[var(--accent)]/50 text-[var(--accent)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--accent)]/10 disabled:opacity-60"
              >
                <Mail size={14} strokeWidth={1.75} />{sending ? 'Sending…' : 'Send Email'}
              </button>
            </>
          )}
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={saving}
            className="bg-[var(--accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : isNew ? 'Create Invoice' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Form ─────────────────────────────── */}
        <div className="w-1/2 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6 border-r border-gray-200 dark:border-gray-700">
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>

            {/* Customer + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Customer</label>
                <select className={inputCls} {...register('customer_id')}>
                  <option value="">— No customer —</option>
                  {customerList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                  <Link to="/customers" className="text-xs text-[var(--accent)] hover:underline mt-1 block">
                    + Add new customer
                  </Link>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} {...register('status')}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Issue Date</label>
                <input type="date" className={inputCls} {...register('issue_date', { required: 'Required' })} />
                {errors.issue_date && <p className="text-red-500 text-xs mt-1">{errors.issue_date.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" className={inputCls} {...register('due_date', { required: 'Required' })} />
                {errors.due_date && <p className="text-red-500 text-xs mt-1">{errors.due_date.message}</p>}
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Line Items</label>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-4 py-2 font-semibold">Description</th>
                      <th className="text-right px-3 py-2 font-semibold w-16">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold w-24">Unit Price</th>
                      <th className="text-right px-3 py-2 font-semibold w-24">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty   = Number(watchedValues.items?.[index]?.quantity || 0);
                      const price = Number(watchedValues.items?.[index]?.unit_price || 0);
                      return (
                        <tr key={field.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-2">
                            <input
                              className="w-full border-0 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 bg-transparent dark:text-gray-100"
                              placeholder="Item description"
                              {...register(`items.${index}.description`)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="w-full border-0 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 bg-transparent dark:text-gray-100"
                              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border-0 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 bg-transparent dark:text-gray-100"
                              {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                            ${(qty * price).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 transition-colors"
                              title="Remove row"
                            ><X size={13} strokeWidth={2} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => append({ ...EMPTY_ITEM })}
                    className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline font-medium"
                  >
                    <Plus size={14} strokeWidth={2} /> Add line item
                  </button>
                </div>
              </div>
            </div>

            {/* Tax Rate */}
            <div className="flex items-center gap-4">
              <div className="w-40">
                <label className={labelCls}>Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={inputCls}
                  {...register('tax_rate', { valueAsNumber: true })}
                />
              </div>
              <div className="text-sm text-gray-500 mt-5">
                Tax amount: $
                {(() => {
                  const sub = (watchedValues.items || []).reduce(
                    (s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0),
                    0,
                  );
                  return (sub * ((Number(watchedValues.tax_rate) || 0) / 100)).toFixed(2);
                })()}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes <span className="font-normal text-gray-400 normal-case">(shown on invoice)</span></label>
              <textarea
                rows={3}
                placeholder="Payment instructions, thank-you message, etc."
                className={`${inputCls} resize-none`}
                {...register('notes')}
              />
            </div>

            {/* Footer Text */}
            <div>
              <label className={labelCls}>Invoice Footer <span className="font-normal text-gray-400 normal-case">(overrides company default)</span></label>
              <textarea
                rows={2}
                placeholder={company.footer_text || 'Leave empty to use the company default footer'}
                className={`${inputCls} resize-none`}
                {...register('footer_text')}
              />
            </div>

          </form>
        </div>

        {/* ── Right: Live Preview ─────────────────────── */}
        <div className="w-1/2 overflow-y-auto bg-gray-100 dark:bg-gray-950 p-6">
          {/* A4 paper ratio: 210×297mm */}
          <div className="rounded-xl overflow-hidden shadow-lg" style={{aspectRatio:'210/297'}}>
            <InvoicePreview
              invoice={previewInvoice}
              customer={selectedCustomer}
              company={company}
              bankAccounts={filteredBankAccounts}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
