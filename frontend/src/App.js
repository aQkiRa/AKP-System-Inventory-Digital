import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, homePathFor } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Production from './pages/Production';
import Stock from './pages/Stock';
import Delivery from './pages/Delivery';
import DeliveryPrint from './pages/DeliveryPrint';
import Customers from './pages/Customers';
import Machines from './pages/Machines';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';
import Account from './pages/Account';
import Driver from './pages/Driver';
import Vendors from './pages/Vendors';

// Driver and tim_produksi (Production) are deliberately excluded from '/' -
// per the RBAC spec they're the only two roles without a Dashboard menu.
const PAGE_ROLES = {
  '/': ['master_admin', 'management', 'marketing', 'stock_keeper', 'co_driver', 'co_produksi'],
  '/production': ['master_admin', 'management', 'co_produksi', 'tim_produksi'],
  '/stock': ['master_admin', 'management', 'co_produksi', 'tim_produksi', 'stock_keeper'],
  '/delivery': ['master_admin', 'management', 'marketing', 'co_driver', 'driver', 'stock_keeper'],
  '/customers': ['master_admin', 'management', 'marketing'],
  '/vendors': ['master_admin', 'management', 'stock_keeper', 'co_produksi'],
  '/machines': ['master_admin', 'management', 'co_produksi'],
  '/users': ['master_admin'],
  '/settings': ['master_admin', 'management'],
  '/audit': ['master_admin', 'management'],
  '/driver': ['master_admin', 'driver'],
};

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Memuat...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  const roleEntry = Object.entries(PAGE_ROLES).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  if (roleEntry && !roleEntry[1].includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return <Layout>{children}</Layout>;
}

function PrintProtected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-500">Memuat...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!PAGE_ROLES['/delivery'].includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/production" element={<Protected><Production /></Protected>} />
      <Route path="/stock" element={<Protected><Stock /></Protected>} />
      <Route path="/delivery" element={<Protected><Delivery /></Protected>} />
      <Route path="/delivery/:id/print" element={<PrintProtected><DeliveryPrint /></PrintProtected>} />
      <Route path="/vendors" element={<Protected><Vendors /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/machines" element={<Protected><Machines /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/audit" element={<Protected><AuditLog /></Protected>} />
      <Route path="/driver" element={<Protected><Driver /></Protected>} />
      <Route path="/account" element={<Protected><Account /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
