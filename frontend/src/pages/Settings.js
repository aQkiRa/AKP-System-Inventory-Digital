import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input } from '../components/ui';

export default function Settings() {
  const { user } = useAuth();
  const readOnly = user.role !== 'master_admin';
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(({ data }) => setForm(data));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const { data } = await api.patch('/settings', form);
    setForm(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!form) return <p className="text-slate-500 dark:text-slate-400">Memuat pengaturan...</p>;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Pengaturan</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Target produksi harian dan informasi perusahaan</p>

      <Card>
        {readOnly && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">Anda memiliki akses lihat saja untuk halaman ini.</p>
        )}
        <form onSubmit={handleSubmit}>
          <Input label="Nama Perusahaan" value={form.company_name} disabled={readOnly} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Input label="Alamat Perusahaan" value={form.company_address} disabled={readOnly} onChange={(e) => setForm({ ...form, company_address: e.target.value })} />
          <Input label="Telepon Perusahaan" value={form.company_phone} disabled={readOnly} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} />
          <Input label="Target Produksi Harian (kg)" type="number" value={form.daily_target_kg} disabled={readOnly} onChange={(e) => setForm({ ...form, daily_target_kg: e.target.value })} />
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Ambang batas stok rendah kini dihitung otomatis dari surat jalan yang belum terkirim, tidak perlu diatur manual.
          </p>
          {saved && <p className="text-sm text-green-600 dark:text-green-400 mb-3">Tersimpan.</p>}
          {!readOnly && <Button type="submit" className="w-full">Simpan Pengaturan</Button>}
        </form>
      </Card>
    </div>
  );
}
