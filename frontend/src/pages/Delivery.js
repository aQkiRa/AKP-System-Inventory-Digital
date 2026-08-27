import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Download, Upload, Printer } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { BACKEND_URL, SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Select, Input, Textarea, Badge, PageHeader } from '../components/ui';

const ICE_TYPES = ['Tube', 'Serut'];
const SIZES = [5, 10, 15, 20];
const CAN_CREATE_ROLES = ['master_admin', 'marketing', 'co_driver', 'stock_keeper'];
const CAN_UPDATE_STATUS_ROLES = ['master_admin', 'co_driver', 'driver'];
const CAN_UPLOAD_POD_ROLES = ['master_admin', 'co_driver', 'driver'];
const CAN_ASSIGN_DRIVER_ROLES = ['master_admin', 'co_driver'];

const STATUS_LABEL = {
  pending: ['Menunggu', 'yellow'],
  in_transit: ['Dalam Perjalanan', 'blue'],
  delivered: ['Terkirim', 'green'],
  cancelled: ['Dibatalkan', 'red'],
};

function nowDatetimeLocal() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDMYHM(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Delivery() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customer_id: '',
    driver_id: '',
    order_no: '',
    notes: '',
    dispatch_at: nowDatetimeLocal(),
    estimated_duration_hours: 3,
    items: [{ ice_type: ICE_TYPES[0], size: SIZES[0], qty: '' }],
  });
  const [uploadingId, setUploadingId] = useState(null);

  const load = useCallback(() => {
    api.get('/delivery').then(({ data }) => setOrders(data));
    api.get('/customers').then(({ data }) => setCustomers(data.filter((c) => c.active)));
    api.get('/users/drivers').then(({ data }) => setDrivers(data));
  }, []);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('delivery:updated', load);
    return () => socket.close();
  }, [load]);

  function updateItem(idx, field, value) {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ice_type: ICE_TYPES[0], size: SIZES[0], qty: '' }] });
  }

  function removeItem(idx) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/delivery', form);
      setOpen(false);
      setForm({
        customer_id: '',
        driver_id: '',
        order_no: '',
        notes: '',
        dispatch_at: nowDatetimeLocal(),
        estimated_duration_hours: 3,
        items: [{ ice_type: ICE_TYPES[0], size: SIZES[0], qty: '' }],
      });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal membuat surat jalan');
    }
  }

  async function updateStatus(id, status) {
    await api.patch(`/delivery/${id}/status`, { status });
    load();
  }

  async function assignDriver(id, driverId) {
    await api.patch(`/delivery/${id}/driver`, { driver_id: driverId || null });
    load();
  }

  async function uploadPod(id, file) {
    setUploadingId(id);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await api.post(`/delivery/${id}/pod`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Surat Jalan"
        subtitle="Kelola pengiriman es ke pelanggan"
        actions={
          <>
            <a href={`${BACKEND_URL}/api/export/delivery.xlsx`} target="_blank" rel="noreferrer">
              <Button variant="secondary"><Download size={16} className="inline mr-1" /> Export</Button>
            </a>
            {CAN_CREATE_ROLES.includes(user.role) && (
              <Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Buat Surat Jalan</Button>
            )}
          </>
        }
      />

      <Card>
        <Table
          columns={[
            { key: 'sj_no', header: 'No. SJ' },
            { key: 'created_at', header: 'Tanggal', render: (r) => new Date(r.created_at).toLocaleString('id-ID') },
            { key: 'customer_name', header: 'Pelanggan' },
            {
              key: 'driver_name',
              header: 'Driver',
              render: (r) => {
                const editable = CAN_ASSIGN_DRIVER_ROLES.includes(user.role) && !['delivered', 'cancelled'].includes(r.status);
                if (!editable) return r.driver_name || '-';
                return (
                  <select
                    value={r.driver_id || ''}
                    onChange={(e) => assignDriver(r._id, e.target.value)}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-xs"
                  >
                    <option value="">Belum ditentukan</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                );
              },
            },
            { key: 'total_weight_kg', header: 'Berat', render: (r) => `${r.total_weight_kg} kg` },
            { key: 'dispatch_at', header: 'Berangkat', render: (r) => formatDMYHM(r.dispatch_at) },
            { key: 'expected_arrival_at', header: 'Estimasi Tiba', render: (r) => formatDMYHM(r.expected_arrival_at) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_LABEL[r.status][1]}>{STATUS_LABEL[r.status][0]}</Badge> },
            {
              key: 'actions',
              header: 'Aksi',
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {CAN_UPDATE_STATUS_ROLES.includes(user.role) && r.status === 'pending' && (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => updateStatus(r._id, 'in_transit')}>Kirim</Button>
                  )}
                  {CAN_UPDATE_STATUS_ROLES.includes(user.role) && r.status === 'in_transit' && (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => updateStatus(r._id, 'delivered')}>Selesai</Button>
                  )}
                  {CAN_UPDATE_STATUS_ROLES.includes(user.role) && ['pending', 'in_transit'].includes(r.status) && (
                    <Button variant="danger" className="text-xs px-2 py-1" onClick={() => updateStatus(r._id, 'cancelled')}>Batal</Button>
                  )}
                  {CAN_UPLOAD_POD_ROLES.includes(user.role) && r.status !== 'cancelled' && (
                    <label className="text-xs px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 cursor-pointer flex items-center gap-1">
                      <Upload size={12} /> {uploadingId === r._id ? '...' : 'Foto'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadPod(r._id, e.target.files[0])} />
                    </label>
                  )}
                  <Link to={`/delivery/${r._id}/print`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" className="text-xs px-2 py-1"><Printer size={12} className="inline mr-1" />Cetak</Button>
                  </Link>
                  {r.pod_photo && (
                    <a href={`${BACKEND_URL}${r.pod_photo}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-400 underline self-center">Lihat Bukti</a>
                  )}
                </div>
              ),
            },
          ]}
          rows={orders}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Buat Surat Jalan" wide>
        <form onSubmit={handleSubmit}>
          <Select label="Pelanggan" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
            <option value="">Pilih pelanggan</option>
            {customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          {CAN_ASSIGN_DRIVER_ROLES.includes(user.role) && (
            <Select label="Driver (opsional)" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Belum ditentukan</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
          {!CAN_ASSIGN_DRIVER_ROLES.includes(user.role) && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Driver akan ditentukan oleh Co. Driver setelah surat jalan dibuat.</p>
          )}
          <Input label="No. Order (opsional)" value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} placeholder="Referensi order penjualan" />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Tanggal Berangkat"
              type="datetime-local"
              value={form.dispatch_at}
              onChange={(e) => setForm({ ...form, dispatch_at: e.target.value })}
              required
            />
            <Input
              label="Estimasi Durasi (jam)"
              type="number"
              min="1"
              step="0.5"
              value={form.estimated_duration_hours}
              onChange={(e) => setForm({ ...form, estimated_duration_hours: e.target.value })}
            />
          </div>
          {form.dispatch_at && form.estimated_duration_hours && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
              Estimasi tiba: {formatDMYHM(new Date(new Date(form.dispatch_at).getTime() + Number(form.estimated_duration_hours) * 3600 * 1000).toISOString())}
            </p>
          )}

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Item Pengiriman</p>
          {form.items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-end mb-2">
              <Select value={item.ice_type} onChange={(e) => updateItem(idx, 'ice_type', e.target.value)} className="!mb-0">
                {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select value={item.size} onChange={(e) => updateItem(idx, 'size', Number(e.target.value))} className="!mb-0">
                {SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
              </Select>
              <Input type="number" min="1" placeholder="Karung" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} className="!mb-0" />
              {form.items.length > 1 && (
                <Button type="button" variant="danger" onClick={() => removeItem(idx)}>✕</Button>
              )}
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addItem} className="mb-4">+ Tambah Item</Button>

          <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Buat Surat Jalan</Button>
        </form>
      </Modal>
    </div>
  );
}
