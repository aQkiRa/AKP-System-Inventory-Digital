import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Button, Card, Table, Modal, Select, Input, Textarea, Badge, PageHeader, DateInput,
  QtyCounter, StatCard, SAK_SIZES, DEFAULT_SAK_SIZE,
} from '../components/ui';
import { GroupedBarChart } from '../components/charts';
import { Box, Weight, Factory, Truck, TrendingDown, Activity } from 'lucide-react';

const ICE_TYPES = ['Tube', 'Serut'];
const CAN_ADJUST_ROLES = ['master_admin', 'stock_keeper'];

// Internal source keys keep the original "cool_room" spelling so existing
// records still match; only the labels say "cold room".
const SOURCE_LABEL = {
  harvest: 'Panen',
  repack: 'Repack',
  adjustment: 'Adjustment',
  vendor_purchase: 'Beli Vendor',
  return_cancelled: 'Retur (batal)',
  return_repackage: 'Retur pengiriman (repack)',
  edit_release: 'Revisi (dilepas)',
  return_cool_room_repackage: 'Retur cold room (repack)',
  return_cool_room_damaged_packaging: 'Retur cold room (rusak)',
  return_cool_room_shrinkage: 'Retur cold room (susut)',
};

const RETURN_CONDITION_LABEL = {
  repackage: 'Dikemas Ulang (kembali ke stok)',
  damaged_packaging: 'Kemasan Rusak (hilang dari stok)',
  shrinkage: 'Susut/Meleleh (hilang dari stok)',
};

const STATUS_BADGE = {
  ok: ['Aman', 'green'],
  short: ['Penjualan > Stok', 'yellow'],
  empty: ['Stok Habis', 'red'],
};

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function ageHours(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

function fmt(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function emptyAdjustForm() {
  return {
    category: 'vendor_purchase',
    condition: 'repackage',
    ice_type: ICE_TYPES[0],
    size: DEFAULT_SAK_SIZE,
    sacks: 1,
    vendor_id: '',
    price_per_sak: '',
    reason: '',
  };
}

function SectionHeading({ title, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Stock() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [batches, setBatches] = useState([]);
  const [returns, setReturns] = useState([]);
  const [iceVendors, setIceVendors] = useState([]);

  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [filterSource, setFilterSource] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSize, setFilterSize] = useState('');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm());
  const [adjustError, setAdjustError] = useState('');

  const load = useCallback(() => {
    const params = {
      from: new Date(`${dateFrom}T00:00:00`).toISOString(),
      to: new Date(`${dateTo}T23:59:59`).toISOString(),
    };
    if (filterSource) params.source = filterSource;
    if (filterType) params.ice_type = filterType;
    if (filterSize) params.size = filterSize;
    api.get('/stock/report', { params }).then(({ data }) => setReport(data));

    const batchParams = { sort: 'asc' };
    if (filterSource) batchParams.source = filterSource;
    if (filterType) batchParams.ice_type = filterType;
    if (filterSize) batchParams.size = filterSize;
    api.get('/stock/batches', { params: batchParams }).then(({ data }) => setBatches(data.filter((b) => b.remaining_sacks > 0)));

    api.get('/delivery', { params: { status: 'returned', limit: 10 } }).then(({ data }) => setReturns(data.orders || []));
  }, [dateFrom, dateTo, filterSource, filterType, filterSize]);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('stock:updated', load);
    socket.on('delivery:updated', load);
    return () => socket.close();
  }, [load]);

  useEffect(() => {
    api.get('/vendors', { params: { vendor_type: 'Pabrik Es' } }).then(({ data }) => setIceVendors(data.filter((v) => v.active))).catch(() => {});
  }, []);

  async function handleAdjustSubmit(e) {
    e.preventDefault();
    setAdjustError('');
    const magnitude = Math.abs(Number(adjustForm.sacks) || 0);
    let sacks = Number(adjustForm.sacks) || 0;
    if (adjustForm.category === 'vendor_purchase') sacks = magnitude;
    if (adjustForm.category === 'return_cool_room') sacks = adjustForm.condition === 'repackage' ? magnitude : -magnitude;
    try {
      await api.post('/stock/adjust', { ...adjustForm, sacks });
      setAdjustOpen(false);
      setAdjustForm(emptyAdjustForm());
      load();
    } catch (err) {
      setAdjustError(err.response?.data?.detail || 'Gagal menyimpan penyesuaian stok');
    }
  }

  function resetFilters() {
    setDateFrom(todayStr());
    setDateTo(todayStr());
    setFilterSource('');
    setFilterType('');
    setFilterSize('');
  }

  const canAdjust = CAN_ADJUST_ROLES.includes(user.role);
  const totals = report?.totals;
  const items = report?.items || [];
  const filtersActive = filterSource || filterType || filterSize || dateFrom !== todayStr() || dateTo !== todayStr();

  const stockChartCategories = [...new Set(items.map((r) => r.size))]
    .sort((a, b) => b - a)
    .map((size) => ({
      label: `${size} kg`,
      values: Object.fromEntries(ICE_TYPES.map((t) => [t, items.find((r) => r.size === size && r.ice_type === t)?.available_stock || 0])),
    }));

  const dailyCategories = (report?.daily || []).map((d) => ({
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    values: { inflow: d.inflow, vendor_purchase: d.vendor_purchase, sales: d.sales },
  }));

  return (
    <div>
      <PageHeader
        title="Stok Cold Room"
        subtitle="Posisi stok, mutasi periode, dan batch FIFO"
        actions={canAdjust && <Button onClick={() => { setAdjustForm(emptyAdjustForm()); setAdjustError(''); setAdjustOpen(true); }}>Adjust Stok</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter</h3>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              Reset ke hari ini
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} wrapperClassName="mb-0" />
          <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} wrapperClassName="mb-0" />
          <Select label="Sumber" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} wrapperClassName="mb-0">
            <option value="">Semua Sumber</option>
            <option value="harvest">Panen</option>
            <option value="repack">Repack</option>
            <option value="vendor_purchase">Beli Vendor</option>
            <option value="adjustment">Adjustment</option>
          </Select>
          <Select label="Jenis" value={filterType} onChange={(e) => setFilterType(e.target.value)} wrapperClassName="mb-0">
            <option value="">Semua Jenis</option>
            {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Ukuran" value={filterSize} onChange={(e) => setFilterSize(e.target.value)} wrapperClassName="mb-0">
            <option value="">Semua Ukuran</option>
            {SAK_SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
          </Select>
        </div>
      </Card>

      {totals && (
        <>
          <SectionHeading title="Posisi Stok Terkini" hint="Akhir periode terpilih • tidak terpengaruh filter sumber" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard icon={Box} tone="blue" label="Stok Tersedia (Sak)" value={`${fmt(totals.available_sak)} sak`} sub="Siap kirim dari cold room" />
            <StatCard icon={Weight} tone="blue" label="Stok Tersedia (Kg)" value={`${fmt(totals.available_kg)} kg`} sub="Total bobot es" />
          </div>

          <SectionHeading title="Arus Mutasi — Periode Terpilih" hint="Mengikuti filter tanggal aktif • cocok dengan tabel detail" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard icon={Factory} tone="green" label="Masuk Cold Room" value={`${fmt(totals.inflow)} sak`} sub="Panen + repack internal" />
            <StatCard icon={Truck} tone="violet" label="Pembelian Vendor" value={`${fmt(totals.vendor_purchase)} sak`} sub="Pasokan supplier luar" />
            <StatCard icon={TrendingDown} tone="red" label="Total Keluar (Sales)" value={`${fmt(totals.sales)} sak`} sub="Distribusi penjualan" />
            <StatCard
              icon={Activity}
              tone={totals.net_mutation < 0 ? 'red' : 'green'}
              label="Net Mutasi"
              value={`${totals.net_mutation > 0 ? '+' : ''}${fmt(totals.net_mutation)} sak`}
              sub={totals.net_mutation < 0 ? 'Defisit: keluar lebih besar dari masuk' : 'Surplus arus periode'}
            />
          </div>
        </>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stok Tersedia per Ukuran & Jenis</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Dalam sak, per akhir periode</p>
          <GroupedBarChart
            categories={stockChartCategories}
            series={ICE_TYPES.filter((t) => !filterType || t === filterType).map((t, i) => ({ key: t, label: t, color: ['blue', 'orange'][i] }))}
          />
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Arus Harian</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Masuk cold room, beli vendor, dan penjualan per hari (sak)</p>
          <GroupedBarChart
            categories={dailyCategories}
            series={[
              { key: 'inflow', label: 'Masuk Cold Room', color: 'blue' },
              { key: 'vendor_purchase', label: 'Beli Vendor', color: 'orange' },
              { key: 'sales', label: 'Penjualan', color: 'aqua' },
            ]}
          />
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Detail Stok Tersedia</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Per jenis sak untuk periode terpilih — stok awal dihitung pada awal tanggal "Dari"</p>
        <Table
          columns={[
            { key: 'ice_type', header: 'Jenis Es' },
            { key: 'size', header: 'Ukuran', render: (r) => `${r.size} kg` },
            { key: 'initial_stock', header: 'Stok Awal', render: (r) => <span className="tabular-nums">{fmt(r.initial_stock)}</span> },
            { key: 'harvest', header: 'Panen', render: (r) => <span className="tabular-nums">{fmt(r.harvest)}</span> },
            { key: 'vendor_purchase', header: 'Beli Vendor', render: (r) => <span className="tabular-nums">{fmt(r.vendor_purchase)}</span> },
            { key: 'sales', header: 'Penjualan', render: (r) => <span className="tabular-nums">{fmt(r.sales)}</span> },
            { key: 'available_stock', header: 'Stok Tersedia', render: (r) => <span className="tabular-nums font-semibold">{fmt(r.available_stock)}</span> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_BADGE[r.status][1]}>{STATUS_BADGE[r.status][0]}</Badge> },
          ]}
          rows={items.map((r) => ({ ...r, _id: `${r.ice_type}-${r.size}` }))}
        />
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Batch Aging (FIFO)</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Batch yang masih ada di cold room, tertua di atas — filter tanggal tidak berlaku di sini</p>
        <div className="max-h-80 overflow-y-auto">
          <Table
            columns={[
              { key: 'batch_code', header: 'Kode Batch', render: (r) => <span className="text-xs font-mono">{r.batch_code || r._id}</span> },
              { key: 'ice_type', header: 'Jenis', render: (r) => `${r.ice_type} ${r.size}kg` },
              { key: 'entered_at', header: 'Masuk', render: (r) => new Date(r.entered_at).toLocaleString('id-ID') },
              { key: 'age', header: 'Umur', render: (r) => `${ageHours(r.entered_at)} jam` },
              { key: 'sacks', header: 'Masuk (Sak)' },
              { key: 'remaining_sacks', header: 'Sisa (Sak)', render: (r) => <span className="font-semibold">{r.remaining_sacks}</span> },
              { key: 'source', header: 'Sumber', render: (r) => SOURCE_LABEL[r.source] || r.source || 'Panen' },
            ]}
            rows={batches}
          />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Retur Terakhir</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Barang yang dikembalikan dari surat jalan</p>
        <Table
          columns={[
            { key: 'sj_no', header: 'No. SJ' },
            { key: 'returned_at', header: 'Waktu', render: (r) => new Date(r.returned_at).toLocaleString('id-ID') },
            { key: 'items', header: 'Diretur', render: (r) => (r.returned_items || r.items).map((i) => `${i.ice_type} ${i.size}kg x${i.qty} sak`).join(', ') },
            {
              key: 'return_condition',
              header: 'Kondisi',
              render: (r) => {
                const map = { repackage: ['Dikemas Ulang', 'green'], damaged_packaging: ['Kemasan Rusak', 'red'], shrinkage: ['Susut/Meleleh', 'red'] };
                const [label, tone] = map[r.return_condition] || [r.return_condition, 'slate'];
                return <Badge tone={tone}>{label}</Badge>;
              },
            },
            { key: 'return_reason', header: 'Alasan' },
          ]}
          rows={returns}
          empty="Belum ada retur"
        />
      </Card>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust Stok">
        <form onSubmit={handleAdjustSubmit}>
          <Select label="Jenis Penyesuaian" value={adjustForm.category} onChange={(e) => setAdjustForm({ ...adjustForm, category: e.target.value, sacks: 1 })}>
            <option value="vendor_purchase">Pembelian es dari vendor</option>
            <option value="return_cool_room">Retur langsung dari cold room</option>
            <option value="adjustment">Koreksi umum (opname, selisih hitung)</option>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <Select label="Jenis Es" value={adjustForm.ice_type} onChange={(e) => setAdjustForm({ ...adjustForm, ice_type: e.target.value })}>
              {ICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Ukuran" value={adjustForm.size} onChange={(e) => setAdjustForm({ ...adjustForm, size: Number(e.target.value) })}>
              {SAK_SIZES.map((s) => <option key={s} value={s}>{s} kg</option>)}
            </Select>
          </div>

          {adjustForm.category === 'vendor_purchase' && (
            <>
              <Select label="Vendor (Pabrik Es)" value={adjustForm.vendor_id} onChange={(e) => setAdjustForm({ ...adjustForm, vendor_id: e.target.value })} required>
                <option value="" disabled>{iceVendors.length ? 'Pilih vendor pabrik es' : 'Belum ada vendor Pabrik Es aktif'}</option>
                {iceVendors.map((v) => <option key={v._id} value={v._id}>{v.company_name}{v.nickname ? ` (${v.nickname})` : ''}</option>)}
              </Select>
              {iceVendors.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 -mt-2 mb-3">Tambahkan vendor berjenis Pabrik Es di menu Vendor terlebih dahulu.</p>}
              <QtyCounter required label="Jumlah Sak Dibeli" min={1} value={adjustForm.sacks} onChange={(v) => setAdjustForm({ ...adjustForm, sacks: v })} />
              <Input label="Harga per Sak (Rp, opsional)" type="number" min="0" value={adjustForm.price_per_sak} onChange={(e) => setAdjustForm({ ...adjustForm, price_per_sak: e.target.value })} />
              <Textarea label="Catatan (opsional)" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
            </>
          )}

          {adjustForm.category === 'return_cool_room' && (
            <>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Untuk es yang ditemukan bermasalah langsung di cold room. Retur dari pengiriman dicatat lewat menu Surat Jalan.
              </p>
              <Select label="Kondisi" value={adjustForm.condition} onChange={(e) => setAdjustForm({ ...adjustForm, condition: e.target.value })}>
                {Object.entries(RETURN_CONDITION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <QtyCounter required label="Jumlah Sak" min={1} value={adjustForm.sacks} onChange={(v) => setAdjustForm({ ...adjustForm, sacks: v })} />
              <Textarea label="Alasan" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} required />
            </>
          )}

          {adjustForm.category === 'adjustment' && (
            <>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Gunakan angka negatif untuk mengurangi stok.</p>
              <QtyCounter required label="Jumlah Sak (boleh negatif)" min={-9999} value={adjustForm.sacks} onChange={(v) => setAdjustForm({ ...adjustForm, sacks: v })} />
              <Textarea label="Alasan" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} required />
            </>
          )}

          {adjustError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{adjustError}</p>}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </Modal>
    </div>
  );
}
