import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Card, StatCard, Badge } from '../components/ui';
import api, { SOCKET_URL } from '../api/client';

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

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <img src="/logo.png" alt="AKP" className="w-10 h-10" />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ringkasan produksi, stok, dan pengiriman hari ini</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Produksi Hari Ini" value={`${summary.today_production_kg.toLocaleString('id-ID')} kg`} sub={`Target: ${summary.daily_target_kg.toLocaleString('id-ID')} kg (${summary.target_progress_pct}%)`} />
        <StatCard label="Permintaan Pelanggan" value={`${summary.customer_demand_kg.toLocaleString('id-ID')} kg`} sub="Surat jalan belum terkirim" tone="yellow" />
        <StatCard label="Menunggu Kirim" value={summary.pending_deliveries} tone="yellow" />
        <StatCard label="Dalam Perjalanan" value={summary.in_transit_deliveries} tone="blue" />
        <StatCard label="Terkirim Hari Ini" value={summary.delivered_today} tone="green" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Produksi per Mesin (Hari Ini)</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Rata-rata per panen dihitung ulang otomatis setiap hari (total karung &divide; jumlah panen)</p>
          <div className="space-y-3">
            {summary.machines.map((m) => (
              <div key={m.code}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 dark:text-slate-300">{m.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {m.kg_today.toLocaleString('id-ID')} kg <span className="text-slate-400 dark:text-slate-600">({m.sacks_today} karung, {m.harvest_count_today}x panen)</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Rata-rata: {m.avg_sacks_per_harvest_today} karung/panen
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Status Stok</h3>
          <div className="space-y-2">
            {stock.map((s) => (
              <div key={`${s.ice_type}-${s.size}`} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-slate-700 dark:text-slate-300">{s.ice_type} {s.size}kg</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-800 dark:text-slate-200 font-medium">{s.stock} karung</span>
                  {s.low_stock && <Badge tone="red">Stok Rendah</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Ritase per Pengguna (Hari Ini)</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Jumlah surat jalan yang dibuat tiap pengguna hari ini, otomatis terhitung ulang setiap hari</p>
        <div className="space-y-2">
          {summary.ritase_per_user.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Belum ada surat jalan dibuat hari ini</p>
          )}
          {summary.ritase_per_user.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="text-slate-700 dark:text-slate-300">{r.user_name}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">{r.total_weight_kg.toLocaleString('id-ID')} kg</span>
                <Badge tone="blue">{r.count} ritase</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
