import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/client';
import { Button, Card, Table, Modal, Input, Badge } from '../components/ui';

export default function Machines() {
  const [machines, setMachines] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', avg_sacks_per_harvest: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/machines').then(({ data }) => setMachines(data));
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/machines', form);
      setOpen(false);
      setForm({ code: '', name: '', avg_sacks_per_harvest: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan mesin');
    }
  }

  async function toggleActive(m) {
    await api.patch(`/machines/${m._id}`, { active: !m.active });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Mesin Produksi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Daftar mesin es dan kapasitas rata-rata</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Tambah Mesin</Button>
      </div>

      <Card>
        <Table
          columns={[
            { key: 'code', header: 'Kode' },
            { key: 'name', header: 'Nama' },
            { key: 'avg_sacks_per_harvest', header: 'Rata-rata Karung/Panen' },
            { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>) },
            { key: 'actions', header: 'Aksi', render: (r) => (
              <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => toggleActive(r)}>
                {r.active ? 'Nonaktifkan' : 'Aktifkan'}
              </Button>
            ) },
          ]}
          rows={machines}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Mesin">
        <form onSubmit={handleSubmit}>
          <Input label="Kode Mesin" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MESIN-3" required />
          <Input label="Nama Mesin" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Rata-rata Karung / Panen" type="number" value={form.avg_sacks_per_harvest} onChange={(e) => setForm({ ...form, avg_sacks_per_harvest: e.target.value })} />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>
    </div>
  );
}
