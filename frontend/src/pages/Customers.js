import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Input, Badge } from '../components/ui';

const CAN_MANAGE_ROLES = ['master_admin', 'marketing'];

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/customers').then(({ data }) => setCustomers(data));
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/customers', form);
      setOpen(false);
      setForm({ name: '', phone: '', address: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan pelanggan');
    }
  }

  async function toggleActive(c) {
    await api.patch(`/customers/${c._id}`, { active: !c.active });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Pelanggan</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Daftar pelanggan pengiriman es</p>
        </div>
        {CAN_MANAGE_ROLES.includes(user.role) && (
          <Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Tambah Pelanggan</Button>
        )}
      </div>

      <Card>
        <Table
          columns={[
            { key: 'name', header: 'Nama' },
            { key: 'phone', header: 'Telepon' },
            { key: 'address', header: 'Alamat' },
            { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>) },
            ...(CAN_MANAGE_ROLES.includes(user.role)
              ? [{
                  key: 'actions',
                  header: 'Aksi',
                  render: (r) => (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => toggleActive(r)}>
                      {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  ),
                }]
              : []),
          ]}
          rows={customers}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Pelanggan">
        <form onSubmit={handleSubmit}>
          <Input label="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>
    </div>
  );
}
