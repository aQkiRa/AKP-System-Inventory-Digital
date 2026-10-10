import React, { useEffect, useState } from 'react';
import { Plus, KeyRound } from 'lucide-react';
import api from '../api/client';
import { Button, Card, Table, Modal, Input, Select, Badge, PageHeader } from '../components/ui';

const ROLES = [
  ['master_admin', 'Master Admin'],
  ['management', 'Owner / Management'],
  ['co_produksi', 'Co. Produksi'],
  ['tim_produksi', 'Tim Produksi'],
  ['co_driver', 'Co. Driver'],
  ['driver', 'Driver'],
  ['stock_keeper', 'Stock Keeper'],
  ['marketing', 'Marketing'],
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', name: '', role: 'tim_produksi', password: '' });
  const [error, setError] = useState('');

  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  function load() {
    api.get('/users').then(({ data }) => setUsers(data));
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', form);
      setOpen(false);
      setForm({ username: '', email: '', name: '', role: 'tim_produksi', password: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan pengguna');
    }
  }

  async function toggleActive(u) {
    if (u.active) {
      await api.delete(`/users/${u.id}`);
    } else {
      await api.patch(`/users/${u.id}`, { active: true });
    }
    load();
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetError('');
    try {
      await api.patch(`/users/${resetTarget.id}`, { password: resetPassword });
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Gagal mereset password');
    }
  }

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Kelola akun dan hak akses berdasarkan peran"
        actions={<Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Tambah Pengguna</Button>}
      />

      <Card>
        <Table
          columns={[
            { key: 'username', header: 'Username' },
            { key: 'email', header: 'Email' },
            { key: 'name', header: 'Nama' },
            { key: 'role_label', header: 'Peran' },
            { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>) },
            {
              key: 'actions',
              header: 'Aksi',
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => toggleActive(r)}>
                    {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => { setResetTarget(r); setResetPassword(''); setResetError(''); }}>
                    <KeyRound size={12} className="inline mr-1" /> Reset Password
                  </Button>
                </div>
              ),
            },
          ]}
          rows={users}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Pengguna">
        <form onSubmit={handleSubmit}>
          <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Email (tidak dapat diubah setelah dibuat)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Nama Lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Peran" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2 mb-3">
            Minimal 8 karakter, mengandung kombinasi huruf besar dan angka.
          </p>
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset Password: ${resetTarget?.name || ''}`}>
        <form onSubmit={handleResetPassword}>
          <Input
            label="Password Baru"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2 mb-3">
            Minimal 8 karakter, mengandung kombinasi huruf besar dan angka.
          </p>
          {resetError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{resetError}</p>}
          <Button type="submit" className="w-full">Simpan Password Baru</Button>
        </form>
      </Modal>
    </div>
  );
}
