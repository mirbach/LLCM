import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Download, Upload, AlertTriangle, Building2 } from 'lucide-react';
import { company as companyApi, backup as backupApi } from '../api.js';

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';

const COLOR_PRESETS = [
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Teal',   value: '#14b8a6' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Rose',   value: '#f43f5e' },
  { label: 'Amber',  value: '#f59e0b' },
  { label: 'Slate',  value: '#64748b' },
];

function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  try { localStorage.setItem('accentColor', color); } catch {}
}

export default function Settings() {
  const [loading, setLoading]   = useState(true);
  const [logoUrl, setLogoUrl]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [backing, setBacking]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const fileInputRef = useRef(null);
  const restoreInputRef = useRef(null);

  function handleAccentChange(color) {
    setAccentColor(color);
    applyAccent(color);
  }

  const { register, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm();

  useEffect(() => {
    companyApi.get().then((r) => {
      const data = r.data;
      setLogoUrl(data.logo_path || null);
      const accent = data.accent_color || '#3b82f6';
      setAccentColor(accent);
      applyAccent(accent);
      reset({
        name:                 data.name || '',
        address:              data.address || '',
        city:                 data.city || '',
        state:                data.state || '',
        zip:                  data.zip || '',
        country:              data.country || '',
        phone:                data.phone || '',
        email:                data.email || '',
        website:              data.website || '',
        tax_id:               data.tax_id || '',
        invoice_prefix:       data.invoice_prefix || 'INV-',
        footer_text:          data.footer_text || '',
      });
    }).catch(() => toast.error('Failed to load company settings'))
      .finally(() => setLoading(false));
  }, [reset]);

  async function onSubmit(data) {
    try {
      await companyApi.update({ ...data, accent_color: accentColor });
      toast.success('Company settings saved');
      reset(data); // mark form as clean
    } catch {
      toast.error('Failed to save settings');
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await companyApi.uploadLogo(file);
      setLogoUrl(r.data.logo_path);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteLogo() {
    try {
      await companyApi.deleteLogo();
      setLogoUrl(null);
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    }
  }

  async function handleBackup() {
    setBacking(true);
    try {
      const r = await backupApi.download();
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `llcm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Backup failed');
    } finally {
      setBacking(false);
    }
  }

  function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version || !data.exported_at) {
          toast.error('Invalid backup file');
          return;
        }
        setPendingRestore(data);
        setConfirmRestore(true);
      } catch {
        toast.error('Could not read backup file');
      }
    };
    reader.readAsText(file);
    if (restoreInputRef.current) restoreInputRef.current.value = '';
  }

  async function confirmAndRestore() {
    if (!pendingRestore) return;
    setRestoring(true);
    setConfirmRestore(false);
    try {
      const r = await backupApi.restore(pendingRestore);
      const { customers, invoices, invoice_items } = r.data.restored;
      toast.success(`Restored: ${customers} customers, ${invoices} invoices, ${invoice_items} line items`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Restore failed');
    } finally {
      setRestoring(false);
      setPendingRestore(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-400 dark:text-gray-500 animate-pulse">Loading settings…</div>;
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>
      {/* ── Appearance ─────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Appearance</h2>
        <label className={labelCls}>Accent Color</label>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {COLOR_PRESETS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => handleAccentChange(value)}
              className="w-7 h-7 rounded-full transition-all duration-150 focus:outline-none"
              style={{
                backgroundColor: value,
                boxShadow: accentColor === value
                  ? `0 0 0 2px white, 0 0 0 4px ${value}`
                  : '0 0 0 1px rgba(0,0,0,0.1)',
              }}
            />
          ))}
          {/* Custom color picker */}
          <div className="relative" title="Custom color">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
            <div
              className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-500 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs font-bold pointer-events-none"
            >+</div>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Current:{' '}
          <span
            className="inline-flex items-center gap-1.5 font-mono bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5"
          >
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
            {accentColor}
          </span>
          {' '}— saved with Company Settings.
        </p>
      </section>
      {/* ── Company Logo ──────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Company Logo</h2>
        <div className="flex items-start gap-6">
          <div className="shrink-0 w-36 h-24 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="max-h-full max-w-full object-contain p-2" />
            ) : (
              <Building2 size={32} strokeWidth={1.25} className="text-gray-300 dark:text-gray-600" />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Upload a PNG, JPG, SVG or WebP — max 5 MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleDeleteLogo}
                className="ml-2 text-red-500 text-sm hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Company Info ──────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-5">Company Information</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Company Name *</label>
            <input className={inputCls} {...register('name', { required: true })} />
          </div>
          <div>
            <label className={labelCls}>Street Address</label>
            <input className={inputCls} {...register('address')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} {...register('city')} />
            </div>
            <div>
              <label className={labelCls}>State / Province</label>
              <input className={inputCls} {...register('state')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>ZIP / Postal Code</label>
              <input className={inputCls} {...register('zip')} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls} {...register('country')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} {...register('phone')} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} {...register('email')} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} placeholder="https://example.com" {...register('website')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tax ID / EIN</label>
              <input className={inputCls} {...register('tax_id')} />
            </div>
            <div>
              <label className={labelCls}>Invoice Number Prefix</label>
              <input className={inputCls} placeholder="INV-" {...register('invoice_prefix')} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Default Invoice Footer</label>
            <textarea
              rows={2}
              placeholder="e.g. Thank you for your business! Payment due within 30 days."
              className={`${inputCls} resize-none`}
              {...register('footer_text')}
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="bg-[var(--accent)] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Email / SMTP ──────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Email Configuration</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          SMTP credentials are configured via environment variables in your <code className="bg-gray-100 px-1 rounded">.env</code> file.
          Copy <code className="bg-gray-100 px-1 rounded">.env.example</code> to <code className="bg-gray-100 px-1 rounded">.env</code> and fill in your SMTP details.
        </p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p>SMTP_HOST=smtp.gmail.com</p>
          <p>SMTP_PORT=587</p>
          <p>SMTP_USER=your@email.com</p>
          <p>SMTP_PASS=your-app-password</p>
          <p>SMTP_FROM=Your Name &lt;your@email.com&gt;</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Tip: For Gmail, use an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">App Password</a> rather than your regular password.
        </p>
      </section>

      {/* ── Backup & Restore ──────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Backup &amp; Restore</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Download a full JSON snapshot of all your data (customers, invoices, company settings).
          You can restore it on any instance of this app.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleBackup}
            disabled={backing}
            className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            <Download size={15} strokeWidth={2} />
            {backing ? 'Downloading…' : 'Download Backup'}
          </button>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreFile}
          />
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
          >
            <Upload size={15} strokeWidth={2} />
            {restoring ? 'Restoring…' : 'Restore from Backup'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          <AlertTriangle size={13} strokeWidth={1.75} className="inline mr-1 text-amber-500" /> Restoring will overwrite all existing customers and invoices.
        </p>
      </section>

      {/* ── Confirm Restore Modal ─────────────────────── */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Confirm Restore</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              This will <strong>replace all</strong> current customers and invoices with the data from the backup.
            </p>
            {pendingRestore && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
                Backup from {new Date(pendingRestore.exported_at).toLocaleString()} —{' '}
                {pendingRestore.customers?.length ?? 0} customers,{' '}
                {pendingRestore.invoices?.length ?? 0} invoices
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirmRestore(false); setPendingRestore(null); }}
                className="px-4 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndRestore}
                className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 font-semibold"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
