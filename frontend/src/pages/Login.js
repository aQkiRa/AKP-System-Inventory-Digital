import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, homePathFor } from '../context/AuthContext';
import { Button, Card, Input, ThemeToggle } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [suspended, setSuspended] = useState(() => {
    try {
      const notice = sessionStorage.getItem('akp_login_notice');
      sessionStorage.removeItem('akp_login_notice');
      return notice || '';
    } catch (e) {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuspended('');
    setLoading(true);
    try {
      const loggedIn = await login(email, password);
      const home = homePathFor(loggedIn.role);
      const from = location.state?.from;
      navigate(from && from !== '/' ? from : home, { replace: true });
    } catch (err) {
      if (err.response?.data?.code === 'account_suspended') setSuspended(err.response.data.detail);
      else setError(err.response?.data?.detail || 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="AKP" className="w-16 h-16 mb-3" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">AKP Produksi Digital</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500">CV Arthalaya Karya Parama</p>
        </div>
        <form onSubmit={handleSubmit}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" autoFocus required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            required
          />
          {suspended && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 mb-3 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{suspended}</span>
            </div>
          )}
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
