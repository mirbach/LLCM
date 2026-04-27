import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { invoices as invoicesApi, customers as customersApi, company as companyApi, bankAccount as bankAccountApi, textBlocks as textBlocksApi } from '../api.js';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { ArrowLeft, Download, Mail, X, Plus, FileText, Trash2, ChevronDown, ChevronUp, Star, CheckCircle2, Loader2 } from 'lucide-react';

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
  text_block_ids: [],
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
  const [downloading, setDownloading]   = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [textBlocks, setTextBlocks]     = useState([]);
  const [tbOpen, setTbOpen]             = useState(false);
  const [newTb, setNewTb]               = useState({ title: '', content: '', content_de: '' });
  const [savingTb, setSavingTb]         = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const previewRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const isReadyRef = useRef(false); // true after initial invoice load, prevents save on mount

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

  // Load customers + company + bank accounts + text blocks on mount
  useEffect(() => {
    Promise.all([customersApi.list(), companyApi.get(), bankAccountApi.list(), textBlocksApi.list()])
      .then(([cr, co, ba, tb]) => {
        setCustomerList(cr.data);
        setCompany(co.data);
        setBankAccounts(ba.data.filter((b) => b.show_on_invoice));
        setTextBlocks(tb.data);
        // Pre-check default blocks for new invoices
        if (isNew) {
          const defaults = tb.data.filter((t) => t.is_default).map((t) => t.id);
          if (defaults.length) setValue('text_block_ids', defaults);
        }
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
          customer_id:     String(inv.customer_id ?? ''),
          status:          inv.status,
          issue_date:      inv.issue_date?.slice(0, 10) ?? today(),
          due_date:        inv.due_date?.slice(0, 10) ?? daysFromNow(30),
          notes:           inv.notes ?? '',
          footer_text:     inv.footer_text ?? '',
          tax_rate:        inv.tax_rate ?? 0,
          currency:        inv.currency ?? 'USD',
          items:           inv.items?.length ? inv.items : [{ ...EMPTY_ITEM }],
          text_block_ids:  inv.text_block_ids ?? [],
        });
        // Allow auto-save after a tick so the reset doesn't trigger it
        setTimeout(() => { isReadyRef.current = true; }, 200);
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

  // Auto-save: debounce 1.5s after any form change (existing invoices only)
  useEffect(() => {
    if (isNew || !isReadyRef.current) return;
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSubmit(async (data) => {
        setAutoSaveStatus('saving');
        try {
          const payload = {
            ...data,
            customer_id: data.customer_id || null,
            tax_rate: Number(data.tax_rate),
            text_block_ids: data.text_block_ids || [],
            items: data.items.map((item) => ({
              description: item.description,
              quantity:    Number(item.quantity),
              unit_price:  Number(item.unit_price),
            })),
          };
          const result = await invoicesApi.update(id, payload);
          setInvoiceNumber(result.data.invoice_number);
          setAutoSaveStatus('saved');
          // Reset to idle after 3s
          setTimeout(() => setAutoSaveStatus('idle'), 3000);
        } catch {
          setAutoSaveStatus('idle');
        }
      })();
    }, 1500);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [watchedValues, isNew, id]);

  function handleToggleTb(id) {
    const current = watchedValues.text_block_ids || [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setValue('text_block_ids', next);
  }

  async function handleToggleDefault(id) {
    try {
      const res = await textBlocksApi.setDefault(id);
      setTextBlocks((prev) => prev.map((t) => t.id === id ? res.data : t));
    } catch {
      toast.error('Failed to update default');
    }
  }

  async function handleSaveTb() {
    if (!newTb.title.trim() || !newTb.content.trim()) return toast.error('Title and English content required');
    setSavingTb(true);
    try {
      const res = await textBlocksApi.create(newTb);
      setTextBlocks((prev) => [...prev, res.data].sort((a, b) => a.title.localeCompare(b.title)));
      setNewTb({ title: '', content: '', content_de: '' });
      toast.success('Text block saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save text block');
    } finally {
      setSavingTb(false);
    }
  }

  async function handleDeleteTb(id) {
    try {
      await textBlocksApi.delete(id);
      setTextBlocks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Text block deleted');
    } catch {
      toast.error('Failed to delete text block');
    }
  }

  const onSubmit = useCallback(async (data) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        customer_id: data.customer_id || null,
        tax_rate: Number(data.tax_rate),
        text_block_ids: data.text_block_ids || [],
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

  async function handleDownloadPdf() {
    if (isNew) return toast.error('Save the invoice first');
    const html = await previewRef.current?.getHtml();
    if (!html) return toast.error('Preview not ready');
    setDownloading(true);
    try {
      const res = await invoicesApi.pdfFromHtml(id, html);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }

  // Build preview object from live form values
  const selectedTextBlocks = (watchedValues.text_block_ids || [])
    .map((id) => textBlocks.find((t) => t.id === id))
    .filter(Boolean);

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
          {/* Auto-save status */}
          {!isNew && autoSaveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Loader2 size={12} className="animate-spin" />Saving…
            </span>
          )}
          {!isNew && autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 size={12} />Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
              >
                <Download size={14} strokeWidth={1.75} /> {downloading ? 'Generating…' : 'PDF'}
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

            {/* Text Blocks */}
            <div>
              <button
                type="button"
                onClick={() => setTbOpen((o) => !o)}
                className="flex items-center gap-2 w-full text-left"
              >
                <FileText size={14} strokeWidth={1.75} className="text-[var(--accent)]" />
                <span className={labelCls + ' mb-0 cursor-pointer'}>
                  Text Blocks
                  {(watchedValues.text_block_ids?.length > 0) && (
                    <span className="ml-2 normal-case font-normal text-[var(--accent)]">({watchedValues.text_block_ids.length} selected)</span>
                  )}
                </span>
                {tbOpen ? <ChevronUp size={14} className="ml-auto text-gray-400" /> : <ChevronDown size={14} className="ml-auto text-gray-400" />}
              </button>

              {tbOpen && (
                <div className="mt-3 space-y-3">
                  {/* Saved text blocks — checkboxes */}
                  {textBlocks.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                      {textBlocks.map((tb) => {
                        const isDE = selectedCustomer?.country?.toLowerCase().trim() === 'germany';
                        const preview = isDE && tb.content_de ? tb.content_de : tb.content;
                        const checked = (watchedValues.text_block_ids || []).includes(tb.id);
                        return (
                          <div
                            key={tb.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-[var(--accent)]/5 dark:bg-[var(--accent)]/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                            onClick={() => handleToggleTb(tb.id)}
                          >
                            {/* Checkbox */}
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-gray-300 dark:border-gray-600'}`}>
                              {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                {tb.title}
                                {tb.is_default && <Star size={11} strokeWidth={2} className="text-yellow-500 fill-yellow-400" />}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{preview}</div>
                            </div>
                            {/* Default toggle */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleToggleDefault(tb.id); }}
                              className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${tb.is_default ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400'}`}
                              title={tb.is_default ? 'Remove as default' : 'Set as default (auto-checked on new invoices)'}
                            ><Star size={13} strokeWidth={2} className={tb.is_default ? 'fill-yellow-400' : ''} /></button>
                            {/* Delete */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteTb(tb.id); }}
                              className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Delete"
                            ><Trash2 size={13} strokeWidth={1.75} /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No saved text blocks yet.</p>
                  )}

                  {/* New text block form */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    <p className={labelCls + ' mb-0'}>Save new text block</p>
                    <div>
                      <label className={labelCls}>Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Payment Instructions"
                        className={inputCls}
                        value={newTb.title}
                        onChange={(e) => setNewTb((p) => ({ ...p, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Content (English)</label>
                      <textarea
                        rows={3}
                        placeholder="Text that will appear on the invoice…"
                        className={`${inputCls} resize-none`}
                        value={newTb.content}
                        onChange={(e) => setNewTb((p) => ({ ...p, content: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Content (German) <span className="font-normal normal-case text-gray-400">— used for German customers</span></label>
                      <textarea
                        rows={3}
                        placeholder="Deutschen Text für deutsche Kunden…"
                        className={`${inputCls} resize-none`}
                        value={newTb.content_de}
                        onChange={(e) => setNewTb((p) => ({ ...p, content_de: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingTb}
                      onClick={handleSaveTb}
                      className="flex items-center gap-1.5 bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                    >
                      <Plus size={13} strokeWidth={2} />{savingTb ? 'Saving…' : 'Save to library'}
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden notes + text_block_ids fields */}
              <input type="hidden" {...register('notes')} />
              <input type="hidden" {...register('text_block_ids')} />
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
              ref={previewRef}
              invoice={previewInvoice}
              customer={selectedCustomer}
              company={company}
              bankAccounts={filteredBankAccounts}
              selectedTextBlocks={selectedTextBlocks}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
