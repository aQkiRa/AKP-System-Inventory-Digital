import React, { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { Card, Table, DateInput, Button, PageHeader } from '../components/ui';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(() => {
    const params = {};
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    api.get('/audit', { params }).then(({ data }) => setLogs(data));
  }, [dateFrom, dateTo]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader title="Log Aktivitas" subtitle="Riwayat perubahan data oleh pengguna" />

      <Card>
        <div className="flex items-end gap-2 mb-4 flex-wrap">
          <DateInput label="Dari Tanggal" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} wrapperClassName="mb-0" />
          <DateInput label="Sampai Tanggal" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} wrapperClassName="mb-0" />
          {(dateFrom || dateTo) && (
            <Button variant="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Reset
            </Button>
          )}
        </div>
        <Table
          columns={[
            { key: 'at', header: 'Waktu', render: (r) => new Date(r.at).toLocaleString('id-ID') },
            { key: 'username', header: 'Pengguna' },
            { key: 'action', header: 'Aksi' },
            { key: 'entity', header: 'Entitas' },
            { key: 'entity_id', header: 'ID' },
          ]}
          rows={logs}
        />
      </Card>
    </div>
  );
}
