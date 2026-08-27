import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { BACKEND_URL, SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Select, Input, Textarea, Badge, DateInput, PageHeader } from '../components/ui';

const ICE_TYPES = ['Tube', 'Serut'];
const SIZES = [5, 10, 15, 20];
const CAN_ADD_ROLES = ['master_admin', 'co_produksi', 'tim_produksi'];

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function Stock() {
  const { user } = useAuth();
  const [summary, setSummary] = useState([]);
  const [batches, setBatches] = useState([]);
  const [machines, setMachines] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ machine_code: '', ice_type: ICE_TYPES[0], size: SIZES[0], sacks: '', shift: '', notes: '' });
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const loadBatches = useCallback(() => {
    api
      .get('/stock/batches', { params: { from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` } })
      .then(({ data }) => setBatches(data));
  }, [dateFrom, dateTo]);

  const load = useCallback(() => {
    api.get('/stock/summary').then(({ data }) => setSummary(data));
    loadBatches();
    api.get('/machines').then(({ data }) => setMachines(data));
  }, [loadBatches]);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('stock:updated', load);
    return () => socket.close();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/stock/batches', form);
      setOpen(false);
      setForm({ machine_code: '', ice_type: ICE_TYPES[0], size: SIZES[0], sacks: '', shift: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan data produksi');
    }
  }

  const canAdd = CAN_ADD_ROLES.includes(user.role);

  return (
    <div>
      <PageHeader
        title="Produksi & Stok"
        subtitle="Catat hasil produksi dan pantau stok es"
        actions={
          <>
            <a href={`${BACKEND_URL}/api/export/stock.xlsx`} target="_blank" rel="noreferrer">
              <Button variant="secondary"><Download size={16} className="inline mr-1" /> Export</Button>
            </a>
            {canAdd && (
              <Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Catat Produksi</Button>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Ringkasan Stok</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Kebutuhan minimum dihitung otomatis dari surat jalan yang belum terkirim &mdash; stok di bawah kebutuhan tersebut ditandai rendah
        </p>
        <Table
          columns={[
            { key: 'ice_type', header: 'Jenis' },
            { key: 'size', header: 'Ukuran', render: (r) => `${r.size} kg` },
            { key: 'produced', header: 'Total Produksi' },
            { key: 'delivered', header: 'Total Terkirim' },
            { key: 'stock', header: 'Stok Sekarang' },
            { key: 'min_required_stock', header: 'Kebutuhan Minimum' },
            { key: 'status', header: 'Status', render: (r) => (r.low_stock ? <Badge tone="red">Stok Rendah</Badge> : <Badge tone="green">Aman</Badge>) },
          ]}
          rows={summary}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Riwayat Produksi</h3>
          <div className="flex items-end gap-2">
            <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} wrapperClassName="mb-0" />
            <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} wrapperClassName="mb-0" />
            <Button variant="secondary" onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()); }}>
              Hari Ini
            </Button>
          </div>
        </div>
        <Table
          columns={[
            { key: 'entered_at', header: 'Tanggal', render: (r) => new Date(r.entered_at).toLocaleString('id-ID') },
            { key: 'machine_name', header: 'Mesin' },
            { key: 'ice_type', header: 'Jenis' },
            { key: 'size', header: 'Ukuran', render: (r) => `${r.size} kg` },
            { key: 'sacks', header: 'Karung' },
            { key: 'weight_kg', header: 'Berat', render: (r) => `${r.weight_kg} kg` },
            { key: 'entered_by_name', header: 'Dicatat oleh' },
          ]}
          rows={batches}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Catat Produksi">
        <form onSubmit={handleSubmit}>
          <Select label="Mesin" value={form.machine_code} onChange={(e) => setForm({ ...form, machine_code: e.target.value })} required>
            <option value="">Pilih mesin</option>
            {machines.map((m) => (
              <option key={m.code} value={m.code}>{m.name}</option>
            ))}
          </Select>
          <Select label="Jenis Es" value={form.ice_type} onChange={(e) => setForm({ ...form, ice_type: e.target.value })}>
            {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Ukuran (kg)" value={form.size} onChange={(e) => setForm({ ...form, size: Number(e.target.value) })}>
            {SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
          </Select>
          <Input label="Jumlah Karung" type="number" min="1" value={form.sacks} onChange={(e) => setForm({ ...form, sacks: e.target.value })} required />
          <Input label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} placeholder="Contoh: Pagi" />
          <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>
    </div>
  );
}
