import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui';

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

// Indonesian amount-in-words for the "Terbilang" line.
function terbilang(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} Belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} Puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `Seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} Ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `Seribu ${terbilang(n - 1000)}`.trim();
  if (n < 1e6) return `${terbilang(Math.floor(n / 1000))} Ribu ${terbilang(n % 1000)}`.trim();
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} Juta ${terbilang(n % 1e6)}`.trim();
  return `${terbilang(Math.floor(n / 1e9))} Miliar ${terbilang(n % 1e9)}`.trim();
}

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
  while (rows.length < 3) rows.push(null);
  const totalQty = order.items.reduce((sum, it) => sum + it.qty, 0);

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

  function formatRupiah(n) {
    return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
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

      <div className={`mx-auto p-6 ${isDotMatrix ? 'max-w-[9in] text-[11px] leading-tight' : 'max-w-[820px] text-sm'}`}>
        <div className="flex justify-between items-start gap-6 pb-3 mb-3 border-b-2 border-black">
          <div>
            <p className="font-bold text-lg uppercase">{settings.company_name}</p>
            <p className="text-xs max-w-sm">{settings.company_address}</p>
            {settings.company_phone && <p className="text-xs">Telp/WA: {settings.company_phone}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-xl tracking-wide">SURAT JALAN &amp; INVOICE</p>
            <p className="text-[10px] tracking-wider">DELIVERY ORDER &amp; INVOICE</p>
            <p className="inline-block mt-2 border border-black px-3 py-1 font-bold">No. {order.sj_no}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 border border-black mb-3">
          <div className="p-2 border-r border-black">
            <InfoRow label="Tanggal DO" value={<b>{tanggal}</b>} />
            <InfoRow label="No. Order" value={order.order_no || '-'} />
            <InfoRow label="No. Polisi" value=".........................." />
            <InfoRow label="Nama Supir" value={order.driver_name || '..........................'} />
          </div>
          <div className="p-2">
            <InfoRow label="Kepada Yth." value={<b>{order.customer_name}</b>} />
            <InfoRow label="Alamat Kirim" value={order.customer_address || '-'} />
            <InfoRow label="Kontak / WA" value={order.customer_phone || '-'} />
            <InfoRow label="Est. Tiba" value={formatDMYHM(order.expected_arrival_at)} />
          </div>
        </div>

        <table className="w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black p-1.5 w-10">NO</th>
              <th className="border border-black p-1.5 text-left">DESKRIPSI BARANG</th>
              <th className="border border-black p-1.5 text-right w-20">QTY (SAK)</th>
              <th className="border border-black p-1.5 text-right w-24">BERAT (KG)</th>
              <th className="border border-black p-1.5 text-right w-28">HARGA (Rp)</th>
              <th className="border border-black p-1.5 text-right w-32">JUMLAH (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => (
              <tr key={idx}>
                <td className="border border-black p-1.5 h-7 text-center">{item ? idx + 1 : ''}</td>
                <td className="border border-black p-1.5 uppercase">{item ? `Es Kristal ${item.ice_type} ${item.size} kg` : ''}</td>
                <td className="border border-black p-1.5 text-right tabular-nums">{item ? item.qty : ''}</td>
                <td className="border border-black p-1.5 text-right tabular-nums">{item ? item.weight_kg.toLocaleString('id-ID') : ''}</td>
                <td className="border border-black p-1.5 text-right tabular-nums">{item && item.price_per_sak ? item.price_per_sak.toLocaleString('id-ID') : ''}</td>
                <td className="border border-black p-1.5 text-right tabular-nums font-semibold">{item && item.subtotal ? item.subtotal.toLocaleString('id-ID') : ''}</td>
              </tr>
            ))}
            <tr>
              <td className="border border-black p-1.5 text-right font-bold" colSpan={2}>TOTAL</td>
              <td className="border border-black p-1.5 text-right font-bold tabular-nums">{totalQty}</td>
              <td className="border border-black p-1.5 text-right font-bold tabular-nums">{order.total_weight_kg.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1.5"></td>
              <td className="border border-black p-1.5 text-right font-bold tabular-nums">{(order.total_price || 0).toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-[1.4fr_1fr] border border-t-0 border-black mb-4">
          <div className="p-2 border-r border-black">
            {order.total_price > 0 && (
              <p><b>Terbilang :</b> # {terbilang(order.total_price)} Rupiah #</p>
            )}
            {order.notes && <p className="mt-1">Catatan: {order.notes}</p>}
          </div>
          <div className="p-2">
            <div className="flex justify-between font-bold">
              <span>TOTAL TAGIHAN</span>
              <span className="tabular-nums">{formatRupiah(order.total_price)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 text-center mt-4">
          {[
            ['Diterima oleh,', 'Penerima / Customer'],
            ['Diantar oleh,', 'Pengirim / Pengemudi'],
            ['Hormat kami,', settings.company_name],
          ].map(([title, caption]) => (
            <div key={title}>
              <p className="mb-16">{title}</p>
              <p className="border-t border-dotted border-black pt-1">( ................................ )</p>
              <p className="text-xs mt-0.5">{caption}</p>
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
