import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDarkMode } from '../hooks/useDarkMode.js';
import {
  LayoutDashboard,
  Users,
  FileText,
  Landmark,
  Settings,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',    label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/customers',    label: 'Customers',    Icon: Users },
  { to: '/invoices',     label: 'Invoices',     Icon: FileText },
  { to: '/bank-account', label: 'Bank Account', Icon: Landmark },
];

export default function Layout() {
  const [dark, setDark] = useDarkMode();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  function handleLogout() {
    // TODO: clear auth token / session here
    navigate('/');
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-200">

      {/* ── Top bar ───────────────────────────────────── */}
      <header className="h-11 shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 transition-colors duration-200">
        {/* Brand */}
        <span
          className="text-sm font-extrabold tracking-tight select-none"
          style={{ color: 'var(--accent)' }}
        >
          LLC Management
        </span>

        {/* Right-side actions */}
        <div className="flex items-center gap-1">
          {/* Settings */}
          <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              `w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150
               ${isActive
                 ? 'text-white'
                 : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`
            }
            style={({ isActive }) => isActive ? { backgroundColor: 'var(--accent)' } : {}}
          >
            <Settings size={16} strokeWidth={1.75} />
          </NavLink>

          {/* Dark / light toggle */}
          <button
            onClick={() => setDark(!dark)}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
          >
            {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Log out"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ───────────────────────────────────── */}
        <aside
          className={`${collapsed ? 'w-14' : 'w-56'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 transition-[width] duration-200 overflow-hidden`}
        >
          <nav className="flex-1 p-2 overflow-y-auto">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors duration-150
                   ${!isActive ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100' : ''}`
                }
                style={({ isActive }) => isActive
                  ? {
                      color: 'var(--accent)',
                      backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    }
                  : {}
                }
              >
                <Icon size={16} strokeWidth={1.75} />
                {!collapsed && label}
              </NavLink>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className={`p-2 border-t border-gray-100 dark:border-gray-700 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-150"
            >
              {collapsed
                ? <PanelLeftOpen size={15} strokeWidth={1.75} />
                : <PanelLeftClose size={15} strokeWidth={1.75} />
              }
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}


