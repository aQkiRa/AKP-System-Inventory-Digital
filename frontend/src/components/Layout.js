import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  LayoutDashboard,
  Snowflake,
  Truck,
  Users2,
  Cog,
  Settings as SettingsIcon,
  ScrollText,
  LogOut,
  Wifi,
  WifiOff,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  UserCircle,
  Boxes,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SOCKET_URL } from '../api/client';
import { ThemeToggle } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['master_admin', 'management', 'marketing', 'stock_keeper', 'co_driver', 'co_produksi'] },
  { to: '/production', label: 'Produksi', icon: Snowflake, roles: ['master_admin', 'management', 'co_produksi', 'tim_produksi'] },
  { to: '/stock', label: 'Stok Cold Room', icon: Boxes, roles: ['master_admin', 'management', 'co_produksi', 'tim_produksi', 'stock_keeper'] },
  { to: '/delivery', label: 'Surat Jalan', icon: Truck, roles: ['master_admin', 'management', 'marketing', 'co_driver', 'driver', 'stock_keeper'] },
  { to: '/driver', label: 'Pengiriman Saya', icon: PackageCheck, roles: ['master_admin', 'driver'] },
  { to: '/customers', label: 'Pelanggan', icon: Users2, roles: ['master_admin', 'management', 'marketing'] },
  { to: '/vendors', label: 'Vendor', icon: Building2, roles: ['master_admin', 'management', 'stock_keeper', 'co_produksi'] },
  { to: '/machines', label: 'Mesin', icon: Cog, roles: ['master_admin', 'management', 'co_produksi'] },
  { to: '/users', label: 'Pengguna', icon: Users2, roles: ['master_admin'] },
  { to: '/audit', label: 'Log Aktivitas', icon: ScrollText, roles: ['master_admin', 'management'] },
  { to: '/settings', label: 'Pengaturan', icon: SettingsIcon, roles: ['master_admin', 'management'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('akp_sidebar_collapsed') === '1');

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => socket.close();
  }, []);

  useEffect(() => {
    localStorage.setItem('akp_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const items = NAV.filter((item) => item.roles === 'all' || item.roles.includes(user.role));

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-screen overflow-hidden flex bg-slate-50 dark:bg-slate-950 print:h-auto print:overflow-visible print:block">
      <aside
        className={`print:hidden ${collapsed ? 'w-16' : 'w-64'} shrink-0 transition-all duration-200 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden`}
      >
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="min-w-0 px-2">
              <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">AKP Produksi Digital</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 truncate">CV Arthalaya Karya Parama</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Perluas menu' : 'Sembunyikan menu'}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium ${collapsed ? 'justify-center px-0' : ''} ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 border-r-2 border-brand-500'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
                }`
              }
            >
              <item.icon size={18} />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>
        <div className={`p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500 ${collapsed ? 'justify-center' : ''}`}>
          {connected ? <Wifi size={14} className="text-green-500 dark:text-green-400" /> : <WifiOff size={14} className="text-red-500 dark:text-red-400" />}
          {!collapsed && (connected ? 'Realtime tersambung' : 'Realtime terputus')}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full print:h-auto print:block">
        <header className="print:hidden h-16 shrink-0 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white/60 dark:bg-slate-900/40">
          <div />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/account" className="flex items-center gap-2 group" title="Akun Saya">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500">{user.role_label}</p>
              </div>
              <UserCircle size={22} className="text-slate-400 dark:text-slate-500 group-hover:text-brand-600 dark:group-hover:text-brand-400" />
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-500 dark:hover:text-red-400"
              title="Keluar"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
