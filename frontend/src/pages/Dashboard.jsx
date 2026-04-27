import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';
import { invoices as invoicesApi } from '../api.js';

const STATUS_STYLES = {
  draft:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  sent:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  paid:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

export default function Dashboard() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoicesApi.list()
      .then((r) => setInvoices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    total:   invoices.length,
    draft:   invoices.filter((i) => i.status === 'draft').length,
    paid:    invoices.filter((i) => i.status === 'paid').length,
    overdue: invoices.filter((i) => i.status === 'overdue').length,
    outstanding: invoices
      .filter((i) => ['sent', 'overdue'].includes(i.status))
      .reduce((s, i) => s + Number(i.total), 0),
  };

  const recent = invoices.slice(0, 8);

  if (loading) {
    return <div className="p-8 text-gray-400 dark:text-gray-500 animate-pulse">Loading dashboard…</div>;
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <Link
          to="/invoices/new"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + New Invoice
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Invoices', value: counts.total,   color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Draft',          value: counts.draft,   color: 'text-gray-400 dark:text-gray-500' },
          { label: 'Paid',           value: counts.paid,    color: 'text-green-600 dark:text-green-400' },
          { label: 'Overdue',        value: counts.overdue, color: 'text-red-600 dark:text-red-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Outstanding balance */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-5 mb-8 inline-block">
        <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide font-semibold mb-1">Outstanding Balance</p>
        <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">${counts.outstanding.toFixed(2)}</p>
      </div>

      {/* Recent invoices table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recent Invoices</h2>
          <Link to="/invoices" className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline">View all <ArrowRight size={13} strokeWidth={2} /></Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500">
            <FileText size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>No invoices yet.</p>
            <Link to="/invoices/new" className="text-[var(--accent)] text-sm hover:underline">Create your first invoice</Link>
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
              </tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
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
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
