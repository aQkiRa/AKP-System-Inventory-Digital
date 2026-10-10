import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Input, Select, Textarea, Badge } from '../components/ui';

const CAN_MANAGE_ROLES = ['master_admin', 'stock_keeper'];
const VENDOR_TYPES = [
  ['Pabrik Es', 'Pabrik Es (Ice Factory)', 'blue'],
  ['Plastik', 'Plastik', 'yellow'],
  ['Filter', 'Filter', 'green'],
  ['Peralatan', 'Peralatan (Equipment)', 'slate'],
  ['Lainnya', 'Lainnya', 'slate'],
];
const TYPE_TONE = Object.fromEntries(VENDOR_TYPES.map(([v, , tone]) => [v, tone]));

const emptyForm = () => ({ company_name: '', nickname: '', vendor_type: 'Pabrik Es', country: 'Indonesia', address: '', phone: '' });

export default function Vendors() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE_ROLES.includes(user.role);
  const [vendors, setVendors] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  function load() {
    api.get('/vendors').then(({ data }) => setVendors(data));
  }

  useEffect(load, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (filterType && v.vendor_type !== filterType) return false;
      if (!q) return true;
      return [v.company_name, v.nickname, v.phone, v.address, v.country].some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [vendors, filterType, search]);

  function openCreate() {
    setForm(emptyForm());
    setError('');
    setEditing('new');
  }

  function openEdit(v) {
    setForm({
      company_name: v.company_name,
      nickname: v.nickname || '',
      vendor_type: v.vendor_type,
      country: v.country || '',
      address: v.address || '',
      phone: v.phone || '',
    });
    setError('');
    setEditing(v);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing === 'new') await api.post('/vendors', form);
      else await api.patch(`/vendors/${editing._id}`, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan vendor');
    }
  }

  async function toggleActive(v) {
    await api.patch(`/vendors/${v._id}`, { active: !v.active });
    load();
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Vendor</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pemasok pabrik es, plastik, filter, dan peralatan</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><Plus size={16} className="inline mr-1" /> Tambah Vendor</Button>
        )}
      </div>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input label="Cari" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama, telepon, alamat..." wrapperClassName="mb-0 sm:col-span-2" />
          <Select label="Jenis Vendor" value={filterType} onChange={(e) => setFilterType(e.target.value)} wrapperClassName="mb-0">
            <option value="">Semua Jenis</option>
            {VENDOR_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        <Table
          columns={[
            { key: 'company_name', header: 'Nama Perusahaan', render: (r) => <span className="font-medium">{r.company_name}</span> },
            { key: 'nickname', header: 'Nama Panggilan', render: (r) => r.nickname || '-' },
            { key: 'vendor_type', header: 'Jenis Vendor', render: (r) => <Badge tone={TYPE_TONE[r.vendor_type] || 'slate'}>{r.vendor_type}</Badge> },
            { key: 'country', header: 'Asal Negara', render: (r) => r.country || '-' },
            { key: 'address', header: 'Alamat', render: (r) => r.address || '-' },
            { key: 'phone', header: 'Telepon', render: (r) => r.phone || '-' },
            { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>) },
            ...(canManage
              ? [{
                  key: 'actions',
                  header: 'Aksi',
                  render: (r) => (
                    <div className="flex gap-1">
                      <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => openEdit(r)}>
                        <Pencil size={12} className="inline mr-1" />Edit
                      </Button>
                      <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => toggleActive(r)}>
                        {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  ),
                }]
              : []),
          ]}
          rows={rows}
          empty="Belum ada vendor"
        />
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Tambah Vendor' : 'Edit Vendor'}>
        <form onSubmit={handleSubmit}>
          <Input label="Nama Perusahaan" value={form.company_name} onChange={set('company_name')} placeholder="PT Es Kristal Sejahtera" required />
          <Input label="Nama Panggilan" value={form.nickname} onChange={set('nickname')} placeholder="opsional, mis. Es Sejahtera" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2">
            <Select label="Jenis Vendor" value={form.vendor_type} onChange={set('vendor_type')} required>
              {VENDOR_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
            <Input label="Asal Negara" value={form.country} onChange={set('country')} required />
          </div>
          <Textarea label="Alamat" value={form.address} onChange={set('address')} />
          <Input label="Nomor Telepon" type="tel" value={form.phone} onChange={set('phone')} placeholder="0812xxxxxxx" />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>
    </div>
  );
}
