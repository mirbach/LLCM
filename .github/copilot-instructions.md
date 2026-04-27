# LLCM – UI Style Guide & Coding Conventions

Apply these rules to every new page, component, or UI change in `frontend/src/`.

---

## After Every Code Change — Mandatory Validation Steps

After making any edit to frontend or backend files, always run these checks **before** declaring the task done:

### Frontend (React / JSX)
1. **Syntax check** — verify the file parses cleanly:
   ```
   docker exec llcm-frontend-1 node --input-type=module < src/components/MyFile.jsx
   ```
   Or use `get_errors` on the changed file to surface any Vite/OXC parse errors.

2. **Full Vite build** — confirm no build-time errors:
   ```
   docker exec llcm-frontend-1 npx vite build --mode development 2>&1 | tail -30
   ```

3. **Check Vite dev server logs** for hot-reload errors:
   ```
   docker logs llcm-frontend-1 2>&1 | tail -20
   ```

### Backend (Node.js)
1. **Syntax check** — run before restarting:
   ```
   node --check backend/src/routes/changedFile.js
   ```

2. **Restart and verify startup**:
   ```
   docker restart llcm-backend-1
   docker logs llcm-backend-1 2>&1 | tail -10
   ```

### Rule
> Never declare a task complete without running at least the syntax check on every file that was modified. If a parse error or build error is found, fix it before finishing.

---

## Tech Stack

- **React 19** + **Vite** (no CRA, no Next.js)
- **Tailwind CSS v4** (CSS-first, `@import "tailwindcss"`) — use arbitrary values like `bg-[var(--accent)]` freely
- **lucide-react** for all icons — no emoji, no unicode symbols, no other icon libraries
- **react-router-dom v7** — `Link`, `NavLink`, `useNavigate`, `useParams`
- **react-hook-form** — all forms use `useForm` / `useFieldArray`
- **react-hot-toast** — all user feedback via `toast.success()` / `toast.error()`
- **axios** — all API calls via `src/api.js` (never use `fetch` directly)

---

## Color System

All interactive accent colors use the CSS variable `--accent`, **never hardcoded Tailwind blue classes** like `blue-500`, `blue-700`, etc.

| Use case | Class |
|---|---|
| Solid primary button | `bg-[var(--accent)] text-white hover:opacity-90` |
| Outlined accent button | `border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)]/10` |
| Text link / icon link | `text-[var(--accent)] hover:underline` |
| Active/selected state | `bg-[var(--accent)] text-white` |
| Focus ring on inputs | `focus:ring-[var(--accent)]` |
| Active nav item bg | `color-mix(in srgb, var(--accent) 12%, transparent)` |

**Status badge colors** (semantic, static — do NOT use `--accent`)  
Keep `bg-blue-100 text-blue-700` for `sent`, `bg-green-100 text-green-700` for `paid`, etc. These represent data state, not UI theme.

Default `--accent` is `#3b82f6` (blue-500). Users can customize it in Settings.

---

## Border Radius

| Element type | Class |
|---|---|
| Buttons (all sizes) | `rounded-lg` |
| Text inputs, selects, textareas | `rounded-lg` |
| Filter/tab toggle buttons | `rounded-lg` |
| Cards, table containers, panels | `rounded-xl` |
| Modal overlays | `rounded-xl` |
| Icon buttons (square) | `rounded-lg` |
| Status badges | `rounded-lg` |

**Rule:** `rounded-full` is never used. All interactive controls (buttons, badges, dropdowns) use `rounded-lg`. All surface containers use `rounded-xl`.

---

## Typography

| Element | Classes |
|---|---|
| Page title | `text-2xl font-bold text-gray-900 dark:text-gray-100` |
| Section heading | `font-semibold text-gray-800 dark:text-gray-200` |
| Body / default | `text-sm text-gray-700 dark:text-gray-300` |
| Muted / helper | `text-sm text-gray-500 dark:text-gray-400` |
| Table column header | `text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500` |
| Input label | `text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1` |
| Code snippet | `bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs font-mono` |

---

## Buttons

```jsx
{/* Primary */}
<button className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
  Save
</button>

{/* Secondary / ghost */}
<button className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
  Cancel
</button>

{/* Accent outline */}
<button className="flex items-center gap-1.5 border border-[var(--accent)]/50 text-[var(--accent)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--accent)]/10 disabled:opacity-60">
  <IconName size={14} strokeWidth={1.75} /> Label
</button>

{/* Danger text */}
<button className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium hover:underline">
  Delete
</button>

{/* Square icon button */}
<button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
  <IconName size={16} strokeWidth={1.75} />
</button>
```

---

## Form Inputs

Use these exact class constants — copy them into each page file:

```js
const inputCls = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';
```

Inputs always pair `label` + `input` in a `<div>` with `<label className={labelCls}>` above.

---

## Cards & Tables

```jsx
{/* Page section card */}
<section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
  ...
</section>

{/* Table container */}
<div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
  <table className="w-full text-sm">
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
        <th className="text-left px-6 py-3">Column</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <td className="px-6 py-3">...</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Dark Mode

- Dark mode is controlled by the `.dark` class on `<html>`.
- Every color must have a `dark:` counterpart. Never use a light-only color class.
- Use `dark:bg-gray-800` / `dark:bg-gray-900` for surfaces, `dark:text-gray-100` for primary text, `dark:text-gray-400` for muted.
- The custom variant is defined in `index.css`: `@custom-variant dark (&:where(.dark, .dark *));`

---

## Icons

- Import from `lucide-react` only.
- **UI controls** (buttons, nav): `size={16} strokeWidth={1.75}`
- **Empty states**: `size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"`
- **Inline with text**: `size={14} strokeWidth={1.75}` inside a `flex items-center gap-1.5`
- Never use emoji or unicode in place of icons.

---

## Page Layout Template

```jsx
export default function PageName() {
  return (
    <div className="p-8 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Page Title</h1>
        <button className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
          + Primary Action
        </button>
      </div>

      {/* Content */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        ...
      </section>
    </div>
  );
}
```

---

## Empty States

```jsx
<div className="py-16 text-center text-gray-400 dark:text-gray-500">
  <SomeIcon size={36} strokeWidth={1.25} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
  <p>Nothing here yet.</p>
  <Link to="/path" className="text-[var(--accent)] text-sm hover:underline mt-2 inline-block">
    Create your first item
  </Link>
</div>
```

---

## Loading States

```jsx
<div className="py-16 text-center text-gray-400 dark:text-gray-500 animate-pulse">
  Loading…
</div>
```

---

## Modals / Dialogs

```jsx
{/* Backdrop */}
<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
  {/* Panel */}
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Title</h2>
      <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
    {/* body */}
    <div className="flex justify-end gap-3 pt-4">
      <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Cancel</button>
      <button className="bg-[var(--accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90">Confirm</button>
    </div>
  </div>
</div>
```

---

## Filter / Tab Toggles

Use `rounded-lg`, not `rounded-full`, to match button style:

```jsx
<div className="flex gap-2 mb-6 flex-wrap">
  {TABS.map((tab) => (
    <button
      key={tab}
      onClick={() => setFilter(tab)}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize
        ${filter === tab
          ? 'bg-[var(--accent)] text-white'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
    >
      {tab}
    </button>
  ))}
</div>
```

---

## API Calls

- All API calls go through `src/api.js`. Add new resource groups there.
- Use `toast.success()` on success, `toast.error(err.response?.data?.error || 'Fallback message')` on failure.
- Handle loading state with a `useState` boolean set before the call and cleared in `finally`.
