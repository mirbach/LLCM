import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Landmark, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { bankAccount as bankAccountApi } from '../api.js';

const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','CHF','JPY','NZD','SEK','NOK','DKK'];

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';

const EMPTY_ACCOUNT = {
  account_name: '', bank_name: '', bank_address: 'Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium', iban: '', account_number: '',
  sort_code: '', routing_number: '', bic_swift: '', currency: 'USD', show_on_invoice: true,
};

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Bank Account Form ────────────────────────────────────────────────────────

function AccountForm({ defaultValues, onSubmit, onClose }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Account Name *</label>
          <input className={inputCls} placeholder="e.g. Main USD Account" {...register('account_name', { required: true })} />
        </div>
        <div>
          <label className={labelCls}>Bank Name</label>
          <input className={inputCls} placeholder="e.g. Chase, Wise" {...register('bank_name')} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Bank Address</label>
        <input className={inputCls} placeholder="Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium" {...register('bank_address')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Currency</label>
          <select className={inputCls} {...register('currency')}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>BIC / SWIFT</label>
          <input className={inputCls} {...register('bic_swift')} />
        </div>
      </div>
      <div>
        <label className={labelCls}>IBAN</label>
        <input className={inputCls} placeholder="e.g. GB29NWBK60161331926819" {...register('iban')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Account Number</label>
          <input className={inputCls} {...register('account_number')} />
        </div>
        <div>
          <label className={labelCls}>Sort Code</label>
          <input className={inputCls} placeholder="e.g. 60-16-13" {...register('sort_code')} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Routing Number (ABA)</label>
        <input className={inputCls} {...register('routing_number')} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 rounded accent-[var(--accent)]" {...register('show_on_invoice')} />
        <span className="text-sm text-gray-700 dark:text-gray-300">Show on invoices</span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Cancel</button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-[var(--accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save Account'}
        </button>
      </div>
    </form>
  );
}

// ─── Bank Accounts Section ────────────────────────────────────────────────────

function BankAccountsSection() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', account }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () =>
    bankAccountApi.list()
      .then((r) => setAccounts(r.data))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function handleSave(data) {
    try {
      if (modal.mode === 'add') {
        await bankAccountApi.create(data);
        toast.success('Bank account added');
      } else {
        await bankAccountApi.update(modal.account.id, data);
        toast.success('Bank account updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save bank account');
      throw err;
    }
  }

  async function handleDelete(id) {
    try {
      await bankAccountApi.delete(id);
      toast.success('Bank account deleted');
      setDeleteTarget(null);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error('Failed to delete bank account');
    }
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Bank Accounts</h2>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + Add Account
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="py-10 text-center text-gray-400 dark:text-gray-500">
          <Landmark size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No bank accounts yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Account Name</th>
                <th className="text-left px-5 py-3">Bank</th>
                <th className="text-left px-5 py-3">Currency</th>
                <th className="text-left px-5 py-3">IBAN / Account #</th>
                <th className="text-left px-5 py-3">BIC/SWIFT</th>
                <th className="text-left px-5 py-3">On Invoice</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{a.account_name}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{a.bank_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{a.currency}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{a.iban || a.account_number || '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{a.bic_swift || '—'}</td>
                  <td className="px-5 py-3">
                    {a.show_on_invoice
                      ? <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Yes</span>
                      : <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">No</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => setModal({ mode: 'edit', account: a })} className="text-[var(--accent)] hover:underline text-xs font-medium">Edit</button>
                    <button onClick={() => setDeleteTarget(a)} className="text-red-500 hover:underline text-xs font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Bank Account' : `Edit ${modal.account.account_name}`}
          onClose={() => setModal(null)}
        >
          <AccountForm
            defaultValues={modal.mode === 'edit' ? modal.account : EMPTY_ACCOUNT}
            onSubmit={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete Bank Account" onClose={() => setDeleteTarget(null)}>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Delete <strong>{deleteTarget.account_name}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">Cancel</button>
            <button
              onClick={() => handleDelete(deleteTarget.id)}
              className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700"
            >Delete</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ─── Wise Config Section ──────────────────────────────────────────────────────

function WiseConfigSection() {
  const [keySaved, setKeySaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { wise_api_key: '', wise_profile_id: '' },
  });

  useEffect(() => {
    bankAccountApi.getWiseConfig().then((r) => {
      setKeySaved(r.data.wise_api_key_saved);
      reset({ wise_api_key: '', wise_profile_id: r.data.wise_profile_id ?? '' });
    });
  }, [reset]);

  async function onSave(data) {
    try {
      await bankAccountApi.saveWiseConfig(data);
      toast.success('Wise config saved');
      setKeySaved(true);
      reset({ wise_api_key: '', wise_profile_id: data.wise_profile_id });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save Wise config');
      throw err;
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await bankAccountApi.testWise();
      const fetched = r.data.profiles || [];
      setProfiles(fetched);
      toast.success(`Connected — ${fetched.length} profile(s) found`);
      // Auto-select the business profile if present
      const business = fetched.find((p) => p.type === 'business') || fetched[0];
      if (business) setValue('wise_profile_id', String(business.id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  const profileLabel = (p) => {
    const name = p.details?.name || p.details?.firstName || '';
    return `${name ? `${name} — ` : ''}${p.type === 'business' ? 'Business' : 'Personal'} (ID: ${p.id})`;
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
      <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Wise API Configuration</h2>
      <form onSubmit={handleSubmit(onSave)} className="space-y-4 max-w-lg">
        <div>
          <label className={labelCls}>API Key {keySaved && <span className="text-green-600 dark:text-green-400 normal-case font-normal">(saved)</span>}</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={keySaved ? 'Leave blank to keep existing key' : 'Paste your Wise API key'}
              className={`${inputCls} pr-10`}
              {...register('wise_api_key')}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showKey ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Generate a read-only key at{' '}
            <span className="font-mono">wise.com → Settings → API tokens</span>
          </p>
        </div>
        <div>
          <label className={labelCls}>Business Profile</label>
          {profiles.length > 0 ? (
            <select className={inputCls} {...register('wise_profile_id', { required: true })}>
              {profiles.map((p) => (
                <option key={p.id} value={String(p.id)}>{profileLabel(p)}</option>
              ))}
            </select>
          ) : (
            <input className={inputCls} placeholder="Click Test Connection to pick from a list" {...register('wise_profile_id', { required: true })} />
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Click <strong>Test Connection</strong> to load your profiles and select the right one.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 border border-[var(--accent)]/50 text-[var(--accent)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--accent)]/10 disabled:opacity-60"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={testing ? 'animate-spin' : ''} />
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Transactions Section ─────────────────────────────────────────────────────

function TransactionsSection() {
  const [currency, setCurrency] = useState('EUR');
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    bankAccountApi.getSavedTransactions({ currency })
      .then((r) => {
        setTransactions(r.data);
        setLoaded(true);
      })
      .catch(() => {
        // Keep quiet here; user can still fetch directly from Wise.
      });
  }, [currency]);

  async function handleLoad() {
    setLoading(true);
    try {
      const r = await bankAccountApi.getTransactions({ currency, start, end });
      setTransactions(r.data);
      setLoaded(true);
      if (r.data.length === 0) toast.success('No transactions found for this period');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Wise Transactions</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className={labelCls}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="flex items-center gap-1.5 bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Load Transactions'}
        </button>
      </div>

      {/* Table */}
      {!loaded ? (
        <div className="py-12 text-center text-gray-400 dark:text-gray-500">
          <Landmark size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>Select filters and click Load Transactions.</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="py-12 text-center text-gray-400 dark:text-gray-500">No transactions found.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Type</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Sender / Reference</th>
                <th className="text-left px-5 py-3">Matched Invoice</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const amount = tx.amount?.value ?? 0;
                const amountCurrency = tx.amount?.currency ?? currency;
                const isCredit = (tx.type || '').toUpperCase() === 'CREDIT';

                return (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg ${isCredit ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {isCredit ? 'CREDIT' : 'DEBIT'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {amountCurrency} {Number(amount).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{tx.description || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{tx.senderName || tx.referenceNumber || '—'}</td>
                    <td className="px-5 py-3">
                      {tx.matched_invoice ? (
                        <Link
                          to={`/invoices/${tx.matched_invoice.id}/edit`}
                          className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          {tx.matched_invoice.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankAccount() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bank Account</h1>
      </div>
      <BankAccountsSection />
      <WiseConfigSection />
      <TransactionsSection />
    </div>
  );
}
