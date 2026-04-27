import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';
import { invoices as invoicesApi } from '../api.js';

const STATUSES = ['all', 'draft', 'sent', 'paid', 'overdue'];

const STATUS_STYLES = {
  draft:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  sent:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  paid:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue'];

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = (status) =>
    invoicesApi.list(status && status !== 'all' ? { status } : {})
      .then((r) => setInvoices(r.data))
      .finally(() => setLoading(false));

  useEffect(() => { load(filter); }, [filter]);

  async function handleStatusChange(id, status) {
    try {
      await invoicesApi.updateStatus(id, status);
      setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      toast.success(`Status updated to ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function handleDelete(id) {
    try {
      await invoicesApi.delete(id);
      toast.success('Invoice deleted');
      setDeleteTarget(null);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('Failed to delete invoice');
    }
  }

  async function handleDownloadPdf(id, number) {
    try {
      const link = document.createElement('a');
      link.href = invoicesApi.pdfUrl(id);
      link.download = `${number}.pdf`;
      link.click();
    } catch {
      toast.error('Failed to download PDF');
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
        <Link
          to="/invoices/new"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + New Invoice
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setLoading(true); setFilter(s); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize
              ${filter === s
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 animate-pulse">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500">
            <FileText size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>No invoices {filter !== 'all' ? `with status "${filter}"` : 'yet'}.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3">Invoice #</th>
                <th className="text-left px-6 py-3">Customer</th>
                <th className="text-left px-6 py-3">Issue Date</th>
                <th className="text-left px-6 py-3">Due Date</th>
                <th className="text-right px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-3 font-medium">
                    <Link to={`/invoices/${inv.id}/edit`} className="text-[var(--accent)] hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-700 dark:text-gray-300">{inv.customer_name || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{inv.issue_date?.slice(0, 10)}</td>
                  <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{inv.due_date?.slice(0, 10)}</td>
                  <td className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">${Number(inv.total).toFixed(2)}</td>
                  <td className="px-6 py-3">
                    <select
                      value={inv.status}
                      onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${STATUS_STYLES[inv.status]}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap space-x-2">
                    <Link
                      to={`/invoices/${inv.id}/edit`}
                      className="text-[var(--accent)] hover:underline text-xs font-medium"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDownloadPdf(inv.id, inv.invoice_number)}
                      className="text-gray-500 dark:text-gray-400 hover:underline text-xs font-medium"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => setDeleteTarget(inv)}
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

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg mb-3">Delete Invoice</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Delete invoice <strong>{deleteTarget.invoice_number}</strong>? This cannot be undone.
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
          </div>
        </div>
      )}
    </div>
  );
}
