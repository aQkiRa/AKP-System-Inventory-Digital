import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui';

function InfoRow({ label, value }) {
  return (
    <div className="flex text-sm mb-0.5">
      <span className="w-28 shrink-0">{label}</span>
      <span className="mr-1">:</span>
      <span>{value}</span>
    </div>
  );
}

export default function DeliveryPrint() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState('normal');

  useEffect(() => {
    api.get(`/delivery/${id}`).then(({ data }) => setOrder(data));
    api.get('/settings').then(({ data }) => setSettings(data));
  }, [id]);

  if (!order || !settings) return <p className="p-6 text-slate-500">Memuat...</p>;

  const rows = [...order.items];
  while (rows.length < 4) rows.push(null);

  const tanggal = new Date(order.created_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  function formatDMYHM(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const isDotMatrix = mode === 'dotmatrix';

  return (
    <div style={{ background: '#fff', color: '#000', minHeight: '100vh' }} className={isDotMatrix ? 'font-mono' : ''}>
      <div className="print:hidden sticky top-0 z-10 bg-slate-100 border-b border-slate-300 p-3 flex items-center gap-2 flex-wrap">
        <Link to="/delivery">
          <Button variant="secondary">
            <ArrowLeft size={16} className="inline mr-1" /> Kembali
          </Button>
        </Link>
        <div className="flex items-center gap-1 ml-2 border border-slate-300 rounded-lg p-0.5 bg-white">
          <button
            onClick={() => setMode('normal')}
            className={`px-3 py-1.5 rounded-md text-sm ${mode === 'normal' ? 'bg-brand-500 text-white' : 'text-slate-600'}`}
          >
            Normal
          </button>
          <button
            onClick={() => setMode('dotmatrix')}
            className={`px-3 py-1.5 rounded-md text-sm ${mode === 'dotmatrix' ? 'bg-brand-500 text-white' : 'text-slate-600'}`}
          >
            Dot Matrix
          </button>
        </div>
        <span className="text-xs text-slate-500">
          {isDotMatrix ? 'Untuk printer dot matrix / kertas continuous form' : 'Untuk printer laser / inkjet biasa'}
        </span>
        <Button onClick={() => window.print()} className="ml-auto">
          <Printer size={16} className="inline mr-1" /> Cetak
        </Button>
      </div>

      <div className={`mx-auto p-6 ${isDotMatrix ? 'max-w-[9in] text-[11px] leading-tight' : 'max-w-[800px] text-sm'}`}>
        <div className="flex justify-between items-start border-b-4 border-black pb-3 mb-4">
          <div>
            <p className="font-bold text-lg">{settings.company_name}</p>
            <p className="text-xs max-w-xs">{settings.company_address}</p>
            {settings.company_phone && <p className="text-xs">Telp: {settings.company_phone}</p>}
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl tracking-wide">SURAT JALAN</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 mb-4">
          <div>
            <InfoRow label="Nama" value={order.customer_name} />
            <InfoRow label="No. Telp" value={order.customer_phone || '-'} />
            <InfoRow label="Alamat" value={order.customer_address || '-'} />
          </div>
          <div>
            <InfoRow label="No. Surat Jalan" value={order.sj_no} />
            <InfoRow label="No. Order" value={order.order_no || '-'} />
            <InfoRow label="Tanggal" value={tanggal} />
            <InfoRow label="Berangkat" value={`(${formatDMYHM(order.dispatch_at)})`} />
            <InfoRow label="Estimasi Tiba" value={`(${formatDMYHM(order.expected_arrival_at)})`} />
          </div>
        </div>

        <table className="w-full border-collapse border border-black mb-8">
          <thead>
            <tr>
              <th className="border border-black p-1.5 text-left">Ukuran</th>
              <th className="border border-black p-1.5 text-left">Qty</th>
              <th className="border border-black p-1.5 text-left">Keterangan</th>
              <th className="border border-black p-1.5 text-left">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => (
              <tr key={idx}>
                <td className="border border-black p-1.5 h-7">{item ? `${item.ice_type} ${item.size} kg` : ' '}</td>
                <td className="border border-black p-1.5">{item ? `${item.qty} karung` : ''}</td>
                <td className="border border-black p-1.5">{item ? `Es ${item.ice_type}` : ''}</td>
                <td className="border border-black p-1.5">{idx === 0 ? order.notes : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-4 gap-4 text-center">
          {['Penerima', 'Pengirim', 'Gudang', 'Marketing'].map((role) => (
            <div key={role}>
              <p className="mb-16">{role}</p>
              <p className="border-t border-dotted border-black pt-1">(...............)</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: ${isDotMatrix ? '9.5in 11in' : 'A4'}; margin: ${isDotMatrix ? '0.25in' : '0.5in'}; }
        }
      `}</style>
    </div>
  );
}
