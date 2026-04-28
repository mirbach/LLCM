import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Receipt, ArrowDownLeft, Download, TrendingDown, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { netIncome as netIncomeApi } from '../api.js';

const STATIC_PERIODS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year',  label: 'This Year'  },
];

function getPeriodLabel(period) {
  const found = STATIC_PERIODS.find((p) => p.value === period);
  if (found) return found.label;
  if (period === 'all_time') return 'All Time';
  const m = period.match(/^year_(\d{4})$/);
  return m ? m[1] : period;
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function CurrencySection({ bucket }) {
  const isPositive = bucket.netIncome >= 0;

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
      {/* Currency header */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-lg">
            {bucket.currency}
          </span>
          Currency
        </h2>
        <span
          className={`text-sm font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
        >
          Net: {fmt(Math.abs(bucket.netIncome), bucket.currency)}
          {!isPositive && ' deficit'}
        </span>
      </div>

      {/* Receipts block */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Receipt size={14} strokeWidth={1.75} className="text-green-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Receipts
          </span>
        </div>

        {(bucket.invoiceReceipts.length === 0 && bucket.txnReceipts.length === 0) ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No receipts for this period.</p>
        ) : (
          <div className="rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bucket.invoiceReceipts.map((r) => (
                  <tr
                    key={`inv-${r.id}`}
                    className="border-b border-gray-50 dark:border-gray-700/50"
                  >
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.label}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg">
                        Invoice
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-green-600 dark:text-green-400 font-medium">
                      {fmt(r.amount, bucket.currency)}
                    </td>
                  </tr>
                ))}
                {bucket.txnReceipts.map((r) => (
                  <tr
                    key={`txn-${r.id}`}
                    className="border-b border-gray-50 dark:border-gray-700/50"
                  >
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.label}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-lg">
                        Bank
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-green-600 dark:text-green-400 font-medium">
                      {fmt(r.amount, bucket.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    Total Receipts
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-green-600 dark:text-green-400">
                    {fmt(bucket.receiptsTotal, bucket.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Expenses block */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <ArrowDownLeft size={14} strokeWidth={1.75} className="text-red-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Expenses
          </span>
        </div>

        {bucket.expenses.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No expenses for this period.</p>
        ) : (
          <div className="rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bucket.expenses.map((r) => (
                  <tr
                    key={`exp-${r.id}`}
                    className="border-b border-gray-50 dark:border-gray-700/50"
                  >
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.label}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg">
                        Expense
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-red-500 dark:text-red-400 font-medium">
                      ({fmt(r.amount, bucket.currency)})
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    Total Expenses
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-red-500 dark:text-red-400">
                    ({fmt(bucket.expensesTotal, bucket.currency)})
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Owner's Withdrawals block */}
      {(bucket.withdrawals?.length > 0) && (
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet size={14} strokeWidth={1.75} className="text-purple-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Owner's Withdrawals
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">(not included in net income)</span>
          </div>
          <div className="rounded-lg overflow-hidden border border-purple-100 dark:border-purple-900/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-purple-100 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-900/10">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bucket.withdrawals.map((r) => (
                  <tr key={`wd-${r.id}`} className="border-b border-purple-50 dark:border-purple-900/20">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.label}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-lg">
                        Withdrawal
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-purple-600 dark:text-purple-400 font-medium">
                      ({fmt(r.amount, bucket.currency)})
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-purple-50/50 dark:bg-purple-900/10 border-t border-purple-200 dark:border-purple-800/40">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    Total Withdrawals
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-purple-600 dark:text-purple-400">
                    ({fmt(bucket.withdrawalsTotal, bucket.currency)})
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Net income summary */}
      <div className="mx-6 mb-5 mt-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isPositive
            ? <TrendingUp size={18} strokeWidth={1.75} className="text-green-500" />
            : <TrendingDown size={18} strokeWidth={1.75} className="text-red-500" />}
          <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
            {isPositive ? 'Excess of Receipts over Expenses' : 'Excess of Expenses over Receipts'}
          </span>
        </div>
        <span
          className={`text-lg font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
        >
          {fmt(Math.abs(bucket.netIncome), bucket.currency)}
        </span>
      </div>
    </section>
  );
}

export default function NetIncome() {
  const [period, setPeriod] = useState('this_year');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [years, setYears] = useState([]);

  // Load available years once on mount
  useEffect(() => {
    netIncomeApi.years()
      .then((r) => setYears(r.data))
      .catch(() => {}); // non-critical
  }, []);

  const fetchReport = useCallback(async (p) => {
    setLoading(true);
    try {
      const { data } = await netIncomeApi.report(p);
      setReport(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(period);
  }, [period, fetchReport]);

  const isEmpty = report && report.currencies.length === 0;

  // Build the full tab list: static tabs + one per year + All Time
  const currentYear = new Date().getFullYear();
  const yearTabs = years
    .filter((y) => y !== currentYear) // current year is already covered by "This Year"
    .map((y) => ({ value: `year_${y}`, label: String(y) }));

  return (
    <div className="p-8 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp size={22} strokeWidth={1.75} className="text-[var(--accent)]" />
            Net Income
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Statement of Excess of Receipts over Expenses
          </p>
        </div>
        <a
          href={netIncomeApi.pdfUrl(period)}
          download
          className="flex items-center gap-1.5 border border-[var(--accent)]/50 text-[var(--accent)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--accent)]/10 transition-colors"
        >
          <Download size={14} strokeWidth={1.75} />
          Export PDF
        </a>
      </div>

      {/* Period tab strip */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* Static: This Month, This Year */}
        {STATIC_PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${period === p.value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            {p.label}
          </button>
        ))}

        {/* Separator */}
        {yearTabs.length > 0 && (
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 self-center" />
        )}

        {/* Dynamic year buttons */}
        {yearTabs.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${period === p.value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            {p.label}
          </button>
        ))}

        {/* All Time — always last */}
        <button
          onClick={() => setPeriod('all_time')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${period === 'all_time'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          All Time
        </button>
      </div>

      {/* Report date range hint */}
      {report && !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
          {report.from
            ? `${formatDate(report.from)} – ${report.to ? formatDate(report.to) : 'Present'}`
            : 'All records'}
          {' · '}
          <span className="font-medium">{getPeriodLabel(period)}</span>
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-gray-400 dark:text-gray-500 animate-pulse">
          Loading…
        </div>
      )}

      {/* Empty */}
      {!loading && isEmpty && (
        <div className="py-16 text-center text-gray-400 dark:text-gray-500">
          <TrendingUp size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No transactions found for this period.</p>
        </div>
      )}

      {/* Currency sections */}
      {!loading && report && report.currencies.map((bucket) => (
        <CurrencySection key={bucket.currency} bucket={bucket} />
      ))}
    </div>
  );
}
