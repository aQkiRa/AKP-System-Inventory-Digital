import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input, ThemeToggle } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Login gagal');
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
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">AKP Inventory Digital</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500">CV Arthalaya Karya Parama</p>
        </div>
        <form onSubmit={handleSubmit}>
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" autoFocus />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
          />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
