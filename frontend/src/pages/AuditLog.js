import React, { useCallback, useEffect, useState } from 'react';
import { Printer, Download } from 'lucide-react';
import api, { downloadExport } from '../api/client';
import { Card, Table, DateInput, Button, PageHeader } from '../components/ui';

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Free-text the user typed (reason/notes) wins; otherwise summarise the
// changed fields so the column is never just blank for edits.
function auditNote(detail) {
  if (!detail) return '-';
  const text = detail.reason || detail.return_reason || detail.notes;
  if (text) return text;
  const parts = Object.entries(detail)
    .filter(([k, v]) => !['password_hash', 'updated_at', 'status_changed_at'].includes(k) && v !== null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(', ') : '-';
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const load = useCallback(() => {
    const params = {};
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    api.get('/audit', { params }).then(({ data }) => setLogs(data));
  }, [dateFrom, dateTo]);

  useEffect(load, [load]);

  function handleExport() {
    const params = {};
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    downloadExport('/export/audit.xlsx', params, `log-aktivitas-${dateFrom}_${dateTo}.xlsx`);
  }

  return (
    <div>
      <PageHeader
        title="Log Aktivitas"
        subtitle="Riwayat perubahan data oleh pengguna"
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} className="inline mr-1" /> Print
            </Button>
            <Button variant="secondary" onClick={handleExport}><Download size={16} className="inline mr-1" /> Download</Button>
          </>
        }
      />

      <Card>
        <div className="flex items-end gap-2 mb-4 flex-wrap print:hidden">
          <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} wrapperClassName="mb-0" />
          <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} wrapperClassName="mb-0" />
          <Button variant="secondary" onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()); }}>
            Hari Ini
          </Button>
        </div>
        <Table
          columns={[
            { key: 'at', header: 'Waktu', render: (r) => new Date(r.at).toLocaleString('id-ID') },
            { key: 'username', header: 'Pengguna' },
            { key: 'action', header: 'Aksi' },
            { key: 'entity', header: 'Entitas' },
            { key: 'entity_id', header: 'ID' },
            { key: 'detail', header: 'Catatan', render: (r) => <span className="text-xs">{auditNote(r.detail)}</span> },
          ]}
          rows={logs}
        />
      </Card>
    </div>
  );
}
