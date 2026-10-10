import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Card, StatCard, Badge, Table } from '../components/ui';
import { HourlyBarChart, TrendLineChart, DonutChart } from '../components/charts';
import api, { SOCKET_URL } from '../api/client';

const DELIVERY_STATUS_META = {
  delivered: { label: 'Delivered', color: 'blue' },
  in_transit: { label: 'On Delivery', color: 'aqua' },
  pending: { label: 'Pending', color: 'yellow' },
  returned: { label: 'Retur/Issue', color: 'red' },
  cancelled: { label: 'Dibatalkan', color: 'slate' },
};

const FLEET_STATUS_LABEL = {
  pending: ['Pending', 'yellow'],
  in_transit: ['On Delivery', 'blue'],
  delivered: ['Delivered', 'green'],
  returned: ['Retur/Issue', 'red'],
};

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const day = now.toLocaleDateString('id-ID', { weekday: 'long' });
  const date = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="text-right">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{day}, {date}</p>
      <p className="text-lg font-bold text-brand-600 dark:text-brand-400 tabular-nums">{time}</p>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [stock, setStock] = useState([]);

  const load = useCallback(() => {
    api.get('/dashboard/summary').then(({ data }) => setSummary(data));
    api.get('/stock/summary').then(({ data }) => setStock(data));
  }, []);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('stock:updated', load);
    socket.on('delivery:updated', load);
    return () => socket.close();
  }, [load]);

  if (!summary) return <p className="text-slate-500 dark:text-slate-400">Memuat dashboard...</p>;

  const donutSlices = ['delivered', 'in_transit', 'pending', 'returned']
    .map((status) => {
      const row = summary.delivery_status_today.find((s) => s.status === status);
      const meta = DELIVERY_STATUS_META[status];
      return { key: status, label: meta.label, color: meta.color, value: row ? row.sacks : 0 };
    });

  const trendData = summary.weekly_trend.map((d) => ({
    label: new Date(d.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    produced: d.produced_sacks,
    delivered: d.delivered_sacks,
    stok_akhir: d.stok_akhir_sacks,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="AKP" className="w-9 h-9" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ringkasan produksi, stok, dan pengiriman hari ini</p>
          </div>
        </div>
        <LiveClock />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Produksi Hari Ini" value={`${summary.today_production_kg.toLocaleString('id-ID')} kg`} sub={`Target: ${summary.daily_target_kg.toLocaleString('id-ID')} kg (${summary.target_progress_pct}%)`} />
        <StatCard label="Permintaan Pelanggan" value={`${summary.customer_demand_kg.toLocaleString('id-ID')} kg`} sub="Surat jalan belum terkirim" tone="yellow" />
        <StatCard label="Menunggu Kirim" value={summary.pending_deliveries} tone="yellow" />
        <StatCard label="Dalam Perjalanan" value={summary.in_transit_deliveries} tone="blue" />
        <StatCard label="Terkirim Hari Ini" value={summary.delivered_today} tone="green" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Produksi per Jam</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Sak dipanen tiap jam, hari ini</p>
          <HourlyBarChart data={summary.hourly_production} height={120} />
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status Pengiriman</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Surat jalan berangkat hari ini</p>
          <DonutChart slices={donutSlices} size={130} />
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status Mesin</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
            Downtime hari ini: {summary.machines.reduce((s, m) => s + m.downtime_hours_today, 0).toLocaleString('id-ID')} jam
          </p>
          <div className="space-y-2">
            {summary.machines.map((m) => (
              <div key={m.code} className="flex items-center justify-between text-sm py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.status === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="text-slate-700 dark:text-slate-300 truncate">{m.name}</span>
                  <span className={`text-xs shrink-0 ${m.status === 'running' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                    {m.status === 'running' ? 'Running' : 'Maintenance'}
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 shrink-0">{m.sacks_today} sak</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tren 7 Hari</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Produksi, terkirim, dan stok akhir per hari (sak)</p>
          <TrendLineChart
            data={trendData}
            height={140}
            series={[
              { key: 'produced', label: 'Produksi (sak)', color: 'blue' },
              { key: 'delivered', label: 'Delivered (sak)', color: 'orange' },
              { key: 'stok_akhir', label: 'Stok Akhir (sak)', color: 'aqua' },
            ]}
          />
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status Stok</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Tersedia (dialokasikan)</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {stock.map((s) => (
              <div key={`${s.ice_type}-${s.size}`} className="flex items-center justify-between text-sm py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-slate-700 dark:text-slate-300">{s.ice_type} {s.size}kg</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {s.available_stock} <span className="text-slate-400 dark:text-slate-500 font-normal">({s.reserved})</span>
                  </span>
                  {s.low_stock && <Badge tone="red">Rendah</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status Armada &amp; Pengiriman</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Surat jalan yang berangkat hari ini</p>
        <div className="max-h-64 overflow-y-auto">
          <Table
            columns={[
              { key: 'sj_no', header: 'No. SJ' },
              { key: 'driver_name', header: 'Driver', render: (r) => r.driver_name || '-' },
              { key: 'customer_name', header: 'Tujuan' },
              { key: 'sacks', header: 'Muatan', render: (r) => `${r.sacks} sak` },
              { key: 'dispatch_at', header: 'Berangkat', render: (r) => new Date(r.dispatch_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
              { key: 'expected_arrival_at', header: 'Est. Tiba', render: (r) => new Date(r.expected_arrival_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={FLEET_STATUS_LABEL[r.status]?.[1] || 'slate'}>{FLEET_STATUS_LABEL[r.status]?.[0] || r.status}</Badge> },
            ]}
            rows={summary.fleet}
            empty="Belum ada surat jalan yang berangkat hari ini"
          />
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Produksi per Variasi Sak</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Rincian produksi hari ini</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {summary.production_today_breakdown.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Belum ada produksi tercatat hari ini</p>
            )}
            {summary.production_today_breakdown.map((p) => (
              <div key={`${p.ice_type}-${p.size}`} className="flex items-center justify-between text-sm py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-slate-700 dark:text-slate-300">{p.ice_type} {p.size}kg</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  {p.sacks} sak <span className="text-slate-400 dark:text-slate-500 font-normal">({p.kg.toLocaleString('id-ID')} kg)</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ritase per Pengguna</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Surat jalan dibuat tiap pengguna hari ini</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {summary.ritase_per_user.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Belum ada surat jalan dibuat hari ini</p>
            )}
            {summary.ritase_per_user.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between text-sm py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-slate-700 dark:text-slate-300">{r.user_name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 dark:text-slate-500">{r.total_weight_kg.toLocaleString('id-ID')} kg</span>
                  <Badge tone="blue">{r.count} ritase</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
