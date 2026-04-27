import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Users, X } from 'lucide-react';
import { customers as customersApi } from '../api.js';

const EMPTY_FORM = {
  name: '', email: '', phone: '',
  address: '', city: '', state: '', zip: '', country: '',
  notes: '', currency: 'USD',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          ><X size={18} strokeWidth={1.75} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';

function CustomerForm({ defaultValues, onSubmit, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Name *" error={errors.name?.message}>
        <input className={inputCls} {...register('name', { required: 'Name is required' })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" error={errors.email?.message}>
          <input type="email" className={inputCls} {...register('email')} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} {...register('phone')} />
        </Field>
      </div>
      <Field label="Address">
        <input className={inputCls} placeholder="Street address" {...register('address')} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <input className={inputCls} {...register('city')} />
        </Field>
        <Field label="State / Province">
          <input className={inputCls} {...register('state')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="ZIP / Postal">
          <input className={inputCls} {...register('zip')} />
        </Field>
        <Field label="Country">
          <input className={inputCls} {...register('country')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency">
          <select className={inputCls} {...register('currency')}>
            {['USD','EUR','GBP','CAD','AUD','CHF','JPY','NZD','SEK','NOK','DKK'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={`${inputCls} resize-none h-20`} {...register('notes')} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-[var(--accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </form>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', customer }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');

  const load = () =>
    customersApi.list()
      .then((r) => setCustomers(r.data))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = customers.filter((c) =>
    [c.name, c.email, c.city].some((f) => f?.toLowerCase().includes(search.toLowerCase())),
  );

  async function handleSave(data) {
    try {
      if (modal.mode === 'add') {
        await customersApi.create(data);
        toast.success('Customer added');
      } else {
        await customersApi.update(modal.customer.id, data);
        toast.success('Customer updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save customer');
      throw err;
    }
  }

  async function handleDelete(id) {
    try {
      await customersApi.delete(id);
      toast.success('Customer deleted');
      setDeleteTarget(null);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error('Failed to delete customer');
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Customers</h1>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + Add Customer
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, email, or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading customers…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500">
            <Users size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>{search ? 'No customers match your search.' : 'No customers yet.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3">ID</th>
                <th className="text-left px-6 py-3">Name</th>
                <th className="text-left px-6 py-3">Email</th>
                <th className="text-left px-6 py-3">Phone</th>
                <th className="text-left px-6 py-3">City</th>
                <th className="text-left px-6 py-3">Country</th>
                <th className="text-left px-6 py-3">Currency</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">{c.customer_number || '—'}</td>
                  <td className="px-6 py-3 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{c.email || '—'}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{c.phone || '—'}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{c.city || '—'}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{c.country || '—'}</td>
                  <td className="px-6 py-3">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{c.currency || 'USD'}</span>
                  </td>
                  <td className="px-6 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => setModal({ mode: 'edit', customer: c })}
                      className="text-[var(--accent)] hover:underline text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="text-red-500 hover:underline text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Customer' : `Edit ${modal.customer.name}`}
          onClose={() => setModal(null)}
        >
          <CustomerForm
            defaultValues={modal.mode === 'edit' ? modal.customer : EMPTY_FORM}
            onSubmit={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal title="Delete Customer" onClose={() => setDeleteTarget(null)}>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deleteTarget.id)}
              className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
