import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Download, Pencil } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { SOCKET_URL, downloadExport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Table, Modal, Select, Textarea, DateInput, PageHeader, QtyCounter, SAK_SIZES, DEFAULT_SAK_SIZE } from '../components/ui';

const ICE_TYPES = ['Tube', 'Serut'];
const SIZES = SAK_SIZES;
const CAN_ADD_ROLES = ['master_admin', 'co_produksi', 'tim_produksi'];
const CAN_EDIT_BATCH_ROLES = ['master_admin', 'co_produksi'];
const SOURCE_LABEL = { harvest: 'Panen', repack: 'Repack', adjustment: 'Adjustment', vendor_purchase: 'Beli Vendor' };

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function PickerGroup({ options, value, onChange, render }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`py-3 rounded-lg border text-sm font-semibold transition ${
              active
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            {render ? render(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

export default function Production() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [machines, setMachines] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ machine_code: '', ice_type: ICE_TYPES[0], size: DEFAULT_SAK_SIZE, sacks: 0, repack_sacks: 0, shift: '', notes: '' });
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterIceType, setFilterIceType] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [iceVendors, setIceVendors] = useState([]);

  const loadBatches = useCallback(() => {
    const params = { from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, sort: sortDir };
    if (filterMachine) params.machine_code = filterMachine;
    if (filterSource) params.source = filterSource;
    if (filterIceType) params.ice_type = filterIceType;
    if (filterSize) params.size = filterSize;
    api.get('/stock/batches', { params }).then(({ data }) => setBatches(data));
  }, [dateFrom, dateTo, filterMachine, filterSource, filterIceType, filterSize, sortDir]);

  const load = useCallback(() => {
    loadBatches();
    api.get('/machines').then(({ data }) => setMachines(data.filter((m) => m.active !== false)));
  }, [loadBatches]);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('stock:updated', load);
    return () => socket.close();
  }, [load]);

  useEffect(() => {
    if (machines.length > 0 && !form.machine_code) {
      setForm((f) => ({ ...f, machine_code: machines[0].code }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/stock/batches', form);
      setOpen(false);
      setForm({ machine_code: machines[0]?.code || '', ice_type: ICE_TYPES[0], size: DEFAULT_SAK_SIZE, sacks: 0, repack_sacks: 0, shift: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menyimpan data produksi');
    }
  }

  function openEdit(batch) {
    setEditTarget(batch);
    setEditForm({ ice_type: batch.ice_type, size: batch.size, sacks: batch.sacks, notes: batch.notes || '', ...(batch.source === 'vendor_purchase' ? { vendor_id: batch.vendor_id || '' } : {}) });
    if (batch.source === 'vendor_purchase') {
      api.get('/vendors', { params: { vendor_type: 'Pabrik Es' } }).then(({ data }) => setIceVendors(data.filter((v) => v.active)));
    }
    setEditError('');
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditError('');
    const payload = { ...editForm };
    if (!payload.vendor_id) delete payload.vendor_id;
    try {
      await api.patch(`/stock/batches/${editTarget._id}`, payload);
      setEditTarget(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Gagal menyimpan perubahan batch');
    }
  }

  const canAdd = CAN_ADD_ROLES.includes(user.role);
  const canEditBatch = CAN_EDIT_BATCH_ROLES.includes(user.role);
  function handleExport() {
    const params = { from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` };
    if (filterMachine) params.machine_code = filterMachine;
    if (filterSource) params.source = filterSource;
    if (filterIceType) params.ice_type = filterIceType;
    if (filterSize) params.size = filterSize;
    downloadExport('/export/stock.xlsx', params, `laporan-produksi-${dateFrom}_${dateTo}.xlsx`);
  }

  return (
    <div>
      <PageHeader
        title="Produksi"
        subtitle="Catat hasil panen dan repack harian"
        actions={
          <>
            <Button variant="secondary" onClick={handleExport}><Download size={16} className="inline mr-1" /> Export</Button>
            {canAdd && (
              <Button onClick={() => setOpen(true)}><Plus size={16} className="inline mr-1" /> Input Panen</Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Filter Riwayat Produksi</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} wrapperClassName="mb-0" />
          <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} wrapperClassName="mb-0" />
          <Select label="Mesin" value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)} className="!mb-0">
            <option value="">Semua Mesin</option>
            {machines.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </Select>
          <Select label="Sumber" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="!mb-0">
            <option value="">Semua Sumber</option>
            <option value="harvest">Panen</option>
            <option value="repack">Repack</option>
            <option value="adjustment">Adjustment</option>
            <option value="vendor_purchase">Beli Vendor</option>
          </Select>
          <Select label="Jenis" value={filterIceType} onChange={(e) => setFilterIceType(e.target.value)} className="!mb-0">
            <option value="">Semua Jenis</option>
            {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Ukuran" value={filterSize} onChange={(e) => setFilterSize(e.target.value)} className="!mb-0">
            <option value="">Semua Ukuran</option>
            {SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button variant="secondary" onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()); }}>Hari Ini</Button>
          <Button variant="secondary" onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}>
            Urutkan: {sortDir === 'desc' ? 'Terbaru dulu' : 'Terlama dulu'}
          </Button>
          {(filterMachine || filterSource || filterIceType || filterSize) && (
            <Button variant="secondary" onClick={() => { setFilterMachine(''); setFilterSource(''); setFilterIceType(''); setFilterSize(''); }}>
              Reset Filter
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Riwayat Produksi</h3>
        <Table
          columns={[
            { key: 'batch_code', header: 'Kode Batch', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.batch_code || '-'}</span> },
            { key: 'entered_at', header: 'Tanggal', render: (r) => new Date(r.entered_at).toLocaleString('id-ID') },
            { key: 'machine_name', header: 'Mesin', render: (r) => r.machine_name || '-' },
            { key: 'ice_type', header: 'Jenis' },
            { key: 'size', header: 'Ukuran', render: (r) => `${r.size} kg` },
            { key: 'source', header: 'Sumber', render: (r) => SOURCE_LABEL[r.source] || r.source || 'Panen' },
            { key: 'sacks', header: 'Sak' },
            { key: 'weight_kg', header: 'Berat', render: (r) => `${r.weight_kg} kg` },
            { key: 'entered_by_name', header: 'Dicatat oleh' },
            ...(canEditBatch
              ? [{
                  key: 'actions',
                  header: 'Aksi',
                  render: (r) => (
                    <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => openEdit(r)}>
                      <Pencil size={12} className="inline mr-1" />Edit
                    </Button>
                  ),
                }]
              : []),
          ]}
          rows={batches}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Input Panen">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Waktu panen dicatat otomatis = waktu simpan. Kode batch dibuat otomatis dengan format H/TGL/BLN/THN/JAM/MENIT (contoh: H/10/10/26/21/29).</p>
        <form onSubmit={handleSubmit}>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Mesin<span className="text-red-500 ml-0.5">*</span></p>
          <PickerGroup options={machines.map((m) => m.code)} value={form.machine_code} onChange={(v) => setForm({ ...form, machine_code: v })} render={(code) => machines.find((m) => m.code === code)?.name || code} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Jenis Es<span className="text-red-500 ml-0.5">*</span></p>
              <PickerGroup options={ICE_TYPES} value={form.ice_type} onChange={(v) => setForm({ ...form, ice_type: v })} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Ukuran<span className="text-red-500 ml-0.5">*</span></p>
              <PickerGroup options={SIZES} value={form.size} onChange={(v) => setForm({ ...form, size: v })} render={(s) => `${s} kg`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 mt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Jumlah Sak Panen</p>
              <QtyCounter value={form.sacks} onChange={(v) => setForm({ ...form, sacks: v })} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Repack (Sak dari Bin Ice)</p>
              <QtyCounter value={form.repack_sacks} onChange={(v) => setForm({ ...form, repack_sacks: v })} />
            </div>
          </div>

          <div className="mt-4">
            <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="opsional" />
          </div>
          {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Tutup</Button>
            <Button type="submit">Simpan Panen</Button>
          </div>
        </form>
      </Modal>

      {editForm && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Batch: ${editTarget?.batch_code || editTarget?._id}`}>
          <form onSubmit={handleEditSubmit}>
            <Select label="Jenis Es" value={editForm.ice_type} onChange={(e) => setEditForm({ ...editForm, ice_type: e.target.value })}>
              {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Ukuran (kg)" value={editForm.size} onChange={(e) => setEditForm({ ...editForm, size: Number(e.target.value) })}>
              {SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
            </Select>
            {editTarget?.source === 'vendor_purchase' && (
              <>
              <Select label="Vendor (Pabrik Es)" value={editForm.vendor_id} onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })} required={iceVendors.some((v) => v._id === editTarget.vendor_id)}>
                <option value="" disabled>{iceVendors.length ? 'Pilih vendor pabrik es' : 'Belum ada vendor Pabrik Es aktif'}</option>
                {iceVendors.map((v) => <option key={v._id} value={v._id}>{v.company_name}{v.nickname ? ` (${v.nickname})` : ''}</option>)}
              </Select>
              {editTarget.vendor_name && !iceVendors.some((v) => v._id === editTarget.vendor_id) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 -mt-2 mb-3">Vendor saat ini "{editTarget.vendor_name}" tidak terdaftar atau sudah nonaktif — biarkan kosong untuk mempertahankannya, atau pilih vendor aktif untuk menggantinya.</p>
              )}
              </>
            )}
            <QtyCounter label="Jumlah Sak" required min={1} value={editForm.sacks} onChange={(v) => setEditForm({ ...editForm, sacks: v })} />
            <Textarea label="Catatan" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            {editError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{editError}</p>}
            <Button type="submit" className="w-full">Simpan Perubahan</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
