import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Download, Upload, Printer, RotateCcw, Pencil, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { BACKEND_URL, SOCKET_URL, downloadExport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Select, Input, Textarea, Badge, DateInput, PageHeader, QtyCounter, FieldLabel, SAK_SIZES, DEFAULT_SAK_SIZE } from '../components/ui';

const ICE_TYPES = ['Tube', 'Serut'];
const SIZES = SAK_SIZES;
const DEFAULT_DURATION_HOURS = 3;
const CAN_CREATE_ROLES = ['master_admin', 'marketing'];
const CAN_EDIT_ROLES = ['master_admin', 'marketing'];
// Driver is deliberately narrower than co_driver: only allowed to mark a
// shipment delivered, never dispatch or cancel it (mirrors the backend).
const CAN_START_TRANSIT_ROLES = ['master_admin', 'co_driver'];
const CAN_MARK_DELIVERED_ROLES = ['master_admin', 'co_driver', 'driver'];
const CAN_CANCEL_ROLES = ['master_admin', 'co_driver'];
const CAN_UPLOAD_POD_ROLES = ['master_admin', 'co_driver', 'driver'];
const CAN_ASSIGN_DRIVER_ROLES = ['master_admin', 'co_driver'];
const CAN_RETURN_ROLES = ['master_admin', 'co_driver'];

const STATUS_LABEL = {
  pending: ['Menunggu', 'yellow'],
  in_transit: ['Dalam Perjalanan', 'blue'],
  delivered: ['Terkirim', 'green'],
  cancelled: ['Dibatalkan', 'red'],
  returned: ['Diretur', 'slate'],
};

const RETURN_CONDITION_LABEL = {
  repackage: 'Dikemas Ulang (kembali ke stok)',
  damaged_packaging: 'Kemasan Rusak (hilang dari stok)',
  shrinkage: 'Susut/Meleleh (hilang dari stok)',
};

const SORT_OPTIONS = [
  ['created_at', 'Tanggal Dibuat'],
  ['dispatch_at', 'Tanggal Berangkat'],
  ['total_weight_kg', 'Berat'],
  ['sj_no', 'No. SJ'],
];

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

function formatRupiah(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

function emptyForm() {
  return {
    customer_id: '',
    driver_id: '',
    order_no: '',
    notes: '',
    dispatch_at: nowDatetimeLocal(),
    items: [{ ice_type: ICE_TYPES[0], size: DEFAULT_SAK_SIZE, qty: '', price_per_sak: '' }],
  };
}

export default function Delivery() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [stockSummary, setStockSummary] = useState([]);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('created_at');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const limit = 50;

  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [uploadingId, setUploadingId] = useState(null);

  const [returnTarget, setReturnTarget] = useState(null);
  const [returnForm, setReturnForm] = useState({ condition: 'repackage', reason: '' });
  const [returnError, setReturnError] = useState('');

  const loadOrders = useCallback(() => {
    const params = { page, limit, sort, dir };
    if (search.trim()) params.search = search.trim();
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    api.get('/delivery', { params }).then(({ data }) => {
      setOrders(data.orders);
      setTotal(data.total);
    });
  }, [page, sort, dir, search, dateFrom, dateTo]);

  const load = useCallback(() => {
    loadOrders();
    api.get('/customers').then(({ data }) => setCustomers(data.filter((c) => c.active)));
    api.get('/users/drivers').then(({ data }) => setDrivers(data));
    api.get('/stock/summary').then(({ data }) => setStockSummary(data));
  }, [loadOrders]);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('delivery:updated', load);
    socket.on('stock:updated', load);
    return () => socket.close();
  }, [load]);

  function updateItem(idx, field, value) {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ice_type: ICE_TYPES[0], size: DEFAULT_SAK_SIZE, qty: '', price_per_sak: '' }] });
  }

  function removeItem(idx) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  }

  // Available stock for this ice_type/size, minus whatever this form already
  // asks for it in earlier rows (and, when editing, plus what this order
  // already holds - that stock is released back before re-consumption).
  function availableFor(ice_type, size, idx) {
    const row = stockSummary.find((s) => s.ice_type === ice_type && s.size === size);
    let available = row ? row.available_stock : 0;
    if (editTarget) {
      available += editTarget.items
        .filter((it) => it.ice_type === ice_type && it.size === size)
        .reduce((sum, it) => sum + it.qty, 0);
    }
    const requestedElsewhere = form.items.reduce((sum, it, i) => {
      if (i === idx || it.ice_type !== ice_type || Number(it.size) !== size) return sum;
      return sum + (Number(it.qty) || 0);
    }, 0);
    return available - requestedElsewhere;
  }

  const totalPrice = form.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price_per_sak) || 0), 0);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm());
    setError('');
    setOpen(true);
  }

  function openEdit(order) {
    setEditTarget(order);
    setForm({
      customer_id: order.customer_id,
      driver_id: order.driver_id || '',
      order_no: order.order_no || '',
      notes: order.notes || '',
      dispatch_at: order.dispatch_at ? order.dispatch_at.slice(0, 16) : nowDatetimeLocal(),
      items: order.items.map((it) => ({ ice_type: it.ice_type, size: it.size, qty: it.qty, price_per_sak: it.price_per_sak || '' })),
    });
    setError('');
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, estimated_duration_hours: DEFAULT_DURATION_HOURS };
    try {
      if (editTarget) {
        await api.patch(`/delivery/${editTarget._id}`, payload);
      } else {
        await api.post('/delivery', payload);
      }
      setOpen(false);
      setEditTarget(null);
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan surat jalan');
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

  async function handleReturnSubmit(e) {
    e.preventDefault();
    setReturnError('');
    try {
      await api.patch(`/delivery/${returnTarget._id}/return`, returnForm);
      setReturnTarget(null);
      setReturnForm({ condition: 'repackage', reason: '', returned_qty: [] });
      load();
    } catch (err) {
      setReturnError(err.response?.data?.detail || 'Gagal memproses retur');
    }
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

  function handleExport() {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    downloadExport('/export/delivery.xlsx', params, 'laporan-surat-jalan.xlsx');
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        title="Surat Jalan"
        subtitle="Kelola pengiriman es ke pelanggan"
        actions={
          <>
            <Button variant="secondary" onClick={handleExport}><Download size={16} className="inline mr-1" /> Export</Button>
            {CAN_CREATE_ROLES.includes(user.role) && (
              <Button onClick={openCreate}><Plus size={16} className="inline mr-1" /> Buat Surat Jalan</Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter</h3>
          {(search || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
            >
              Reset filter
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <label className="block sm:col-span-2">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Cari</span>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="No. SJ, pelanggan, driver..."
                className="bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 w-full min-w-0"
              />
            </div>
          </label>
          <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo || undefined} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} wrapperClassName="mb-0" />
          <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom || undefined} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} wrapperClassName="mb-0" />
          <Select label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value)} wrapperClassName="mb-0">
            {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select label="Arah" value={dir} onChange={(e) => setDir(e.target.value)} wrapperClassName="mb-0">
            <option value="desc">Terbaru dulu</option>
            <option value="asc">Terlama dulu</option>
          </Select>
        </div>
      </Card>

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
            { key: 'total_price', header: 'Harga', render: (r) => formatRupiah(r.total_price) },
            { key: 'dispatch_at', header: 'Berangkat', render: (r) => formatDMYHM(r.dispatch_at) },
            { key: 'expected_arrival_at', header: 'Estimasi Tiba', render: (r) => formatDMYHM(r.expected_arrival_at) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_LABEL[r.status][1]}>{STATUS_LABEL[r.status][0]}</Badge> },
            {
              key: 'actions',
              header: 'Aksi',
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {CAN_EDIT_ROLES.includes(user.role) && r.status === 'pending' && (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => openEdit(r)}>
                      <Pencil size={12} className="inline mr-1" />Edit
                    </Button>
                  )}
                  {CAN_START_TRANSIT_ROLES.includes(user.role) && r.status === 'pending' && (
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-1"
                      disabled={!r.driver_id}
                      title={!r.driver_id ? 'Pilih driver terlebih dahulu' : undefined}
                      onClick={() => updateStatus(r._id, 'in_transit')}
                    >
                      Kirim
                    </Button>
                  )}
                  {CAN_MARK_DELIVERED_ROLES.includes(user.role) && r.status === 'in_transit' && (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => updateStatus(r._id, 'delivered')}>Selesai</Button>
                  )}
                  {CAN_CANCEL_ROLES.includes(user.role) && ['pending', 'in_transit'].includes(r.status) && (
                    <Button variant="danger" className="text-xs px-2 py-1" onClick={() => updateStatus(r._id, 'cancelled')}>Batal</Button>
                  )}
                  {CAN_RETURN_ROLES.includes(user.role) && ['pending', 'in_transit'].includes(r.status) && (
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-1"
                      onClick={() => { setReturnTarget(r); setReturnForm({ condition: 'repackage', reason: '', returned_qty: r.items.map((it) => it.qty) }); setReturnError(''); }}
                    >
                      <RotateCcw size={12} className="inline mr-1" />Retur
                    </Button>
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
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500 dark:text-slate-400">
          <span>{total.toLocaleString('id-ID')} surat jalan &middot; halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} className="inline" />
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={16} className="inline" />
            </Button>
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editTarget ? `Edit Surat Jalan: ${editTarget.sj_no}` : 'Buat Surat Jalan'} wide>
        <form onSubmit={handleSubmit}>
          <Select label="Pelanggan" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
            <option value="">Pilih pelanggan</option>
            {customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          {CAN_ASSIGN_DRIVER_ROLES.includes(user.role) ? (
            <Select label="Driver (opsional)" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Belum ditentukan</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Driver akan ditentukan oleh Co. Driver setelah surat jalan dibuat.</p>
          )}
          <Input label="No. Order (opsional)" value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} placeholder="Referensi order penjualan" />

          <Input
            label="Tanggal Berangkat"
            type="datetime-local"
            value={form.dispatch_at}
            onChange={(e) => setForm({ ...form, dispatch_at: e.target.value })}
            required
          />

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Item Pengiriman</p>
          {form.items.map((item, idx) => {
            const qty = Number(item.qty) || 0;
            const remaining = availableFor(item.ice_type, Number(item.size), idx);
            const shortage = qty > 0 && qty > remaining;
            const subtotal = qty * (Number(item.price_per_sak) || 0);
            return (
              <div key={idx} className="mb-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                  <Select label="Jenis" value={item.ice_type} onChange={(e) => updateItem(idx, 'ice_type', e.target.value)} wrapperClassName="mb-0">
                    {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <Select label="Ukuran" value={item.size} onChange={(e) => updateItem(idx, 'size', Number(e.target.value))} wrapperClassName="mb-0">
                    {SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
                  </Select>
                  <Input label="Harga/sak (Rp)" type="number" min="0" value={item.price_per_sak} onChange={(e) => updateItem(idx, 'price_per_sak', e.target.value)} wrapperClassName="mb-0 col-span-2 sm:col-span-1" />
                </div>
                <div className="flex items-end gap-2 mt-2">
                  <div className="flex-1">
                    <FieldLabel required>Jumlah Sak</FieldLabel>
                    <QtyCounter compact min={0} value={item.qty} onChange={(v) => updateItem(idx, 'qty', v)} />
                  </div>
                  {form.items.length > 1 && (
                    <Button type="button" variant="danger" onClick={() => removeItem(idx)} aria-label="Hapus item">✕</Button>
                  )}
                </div>
                <p className={`text-xs mt-1 ${shortage ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {qty > 0 && `${qty} sak × ${item.size}kg = ${qty * item.size} kg`}
                  {qty > 0 && subtotal > 0 && ` · ${formatRupiah(subtotal)}`}
                  {shortage && ` — stok tidak cukup, tersedia ${Math.max(remaining, 0)} sak (kekurangan ${qty - remaining} sak)`}
                </p>
              </div>
            );
          })}
          <Button type="button" variant="secondary" onClick={addItem} className="mb-2">+ Tambah Item</Button>
          {totalPrice > 0 && (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">Total Harga: {formatRupiah(totalPrice)}</p>
          )}

          <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">{editTarget ? 'Simpan Perubahan' : 'Buat Surat Jalan'}</Button>
        </form>
      </Modal>

      <Modal open={!!returnTarget} onClose={() => setReturnTarget(null)} title={`Retur: ${returnTarget?.sj_no || ''}`}>
        <form onSubmit={handleReturnSubmit}>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Untuk barang yang dikembalikan ke pabrik. Kondisi "Dikemas Ulang" akan kembali menjadi stok tersedia,
            sedangkan "Kemasan Rusak" dan "Susut/Meleleh" dianggap hilang dari stok.
          </p>
          <FieldLabel required>Jumlah Sak Diretur</FieldLabel>
          <div className="space-y-2 mb-3">
            {(returnTarget?.items || []).map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 dark:text-slate-300 w-32 shrink-0">{it.ice_type} {it.size}kg <span className="text-xs text-slate-400">/ {it.qty}</span></span>
                <div className="flex-1">
                  <QtyCounter
                    compact
                    min={0}
                    value={returnForm.returned_qty?.[i] ?? 0}
                    onChange={(v) => {
                      const next = [...(returnForm.returned_qty || [])];
                      next[i] = Math.min(Number(v) || 0, it.qty);
                      setReturnForm({ ...returnForm, returned_qty: next });
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400 dark:text-slate-500">Sisanya dianggap terkirim ke pelanggan.</p>
          </div>
          <Select required label="Kondisi Barang" value={returnForm.condition} onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value })}>
            {Object.entries(RETURN_CONDITION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Textarea
            label="Alasan Retur"
            value={returnForm.reason}
            onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
            placeholder="Contoh: es meleleh di perjalanan, pelanggan menolak sebagian barang, dll."
            required
          />
          {returnError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{returnError}</p>}
          <Button type="submit" className="w-full">Simpan Retur</Button>
        </form>
      </Modal>
    </div>
  );
}
