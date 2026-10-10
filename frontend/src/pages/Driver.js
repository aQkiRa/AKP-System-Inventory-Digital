import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { MapPin, Phone, Package, CheckCircle2, Truck, Camera } from 'lucide-react';
import api, { SOCKET_URL, BACKEND_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, Button, PageHeader } from '../components/ui';

const STATUS_LABEL = {
  pending: ['Menunggu', 'yellow'],
  in_transit: ['Dalam Perjalanan', 'blue'],
};

export default function Driver() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [busyIdForError, setBusyIdForError] = useState(null);

  const load = useCallback(() => {
    api.get('/delivery/mine').then(({ data }) => setOrders(data.filter((o) => ['pending', 'in_transit'].includes(o.status))));
  }, []);

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL);
    socket.on('delivery:updated', load);
    return () => socket.close();
  }, [load]);

  async function setStatus(id, status) {
    setBusyId(id);
    try {
      await api.patch(`/delivery/${id}/status`, { status });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function uploadPod(id, file) {
    setUploadingId(id);
    setUploadError('');
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await api.post(`/delivery/${id}/pod`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      setBusyIdForError(id);
      setUploadError(err.response?.data?.detail || 'Gagal mengunggah foto');
    } finally {
      setUploadingId(null);
    }
  }

  const isDriver = user.role === 'driver';

  return (
    <div>
      <PageHeader title="Pengiriman Saya" subtitle="Daftar pelanggan yang harus dikirim hari ini" />

      {orders.length === 0 && (
        <Card>
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Tidak ada pengiriman yang ditugaskan ke Anda saat ini</p>
        </Card>
      )}

      <div className="space-y-4">
        {orders.map((o) => (
          <Card key={o._id}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{o.customer_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{o.sj_no}</p>
              </div>
              <Badge tone={STATUS_LABEL[o.status][1]}>{STATUS_LABEL[o.status][0]}</Badge>
            </div>

            {o.customer_address && (
              <p className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2 mb-1">
                <MapPin size={14} className="mt-0.5 shrink-0" /> {o.customer_address}
              </p>
            )}
            {o.customer_phone && (
              <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2 mb-1">
                <Phone size={14} className="shrink-0" /> {o.customer_phone}
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2 mb-3">
              <Package size={14} className="mt-0.5 shrink-0" />
              {o.items.map((i) => `${i.ice_type} ${i.size}kg x${i.qty} sak`).join(', ')} &middot; {o.total_weight_kg} kg
            </p>

            {isDriver ? (
              <div className="flex flex-wrap gap-2">
                {o.status === 'pending' && (
                  <Button disabled={busyId === o._id} onClick={() => setStatus(o._id, 'in_transit')}>
                    <Truck size={16} className="inline mr-1" /> Mulai Kirim
                  </Button>
                )}
                {o.status === 'in_transit' && (
                  <Button disabled={busyId === o._id} onClick={() => setStatus(o._id, 'delivered')}>
                    <CheckCircle2 size={16} className="inline mr-1" /> Terkirim
                  </Button>
                )}
                <label className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 cursor-pointer flex items-center gap-1.5">
                  <Camera size={16} /> {uploadingId === o._id ? 'Mengunggah...' : o.pod_photo ? 'Ganti Foto' : 'Upload Foto'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files[0] && uploadPod(o._id, e.target.files[0])} />
                </label>
                {o.pod_photo && (
                  <a href={`${BACKEND_URL}${o.pod_photo}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 dark:text-brand-400 underline self-center">Lihat foto</a>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">Tampilan lihat saja — tombol kirim dan upload foto hanya untuk driver.</p>
            )}
            {uploadError && busyIdForError === o._id && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
