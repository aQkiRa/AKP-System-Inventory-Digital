const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

function formatDMYHM(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function auditNote(detail) {
  if (!detail) return '';
  const text = detail.reason || detail.return_reason || detail.notes;
  if (text) return text;
  return Object.entries(detail)
    .filter(([k, v]) => !['password_hash', 'updated_at', 'status_changed_at'].includes(k) && v !== null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

async function writeLetterhead(sheet, title, columnCount) {
  const settings = await db.getDb().collection('settings').findOne({ _id: 'global' });
  const last = String.fromCharCode(64 + columnCount); // column letter, e.g. 9 -> 'I'

  sheet.mergeCells(`A1:${last}1`);
  sheet.getCell('A1').value = settings ? settings.company_name : 'AKP Inventory Digital';
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.mergeCells(`A2:${last}2`);
  sheet.getCell('A2').value = settings ? settings.company_address : '';
  sheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };

  sheet.mergeCells(`A3:${last}3`);
  sheet.getCell('A3').value = title;
  sheet.getCell('A3').font = { bold: true, size: 12 };

  sheet.mergeCells(`A4:${last}4`);
  sheet.getCell('A4').value = `Dicetak pada: ${formatDMYHM(new Date().toISOString())}`;
  sheet.getCell('A4').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  sheet.addRow([]);
}

router.get('/stock.xlsx', auth.requireRole('master_admin', 'management', 'co_produksi', 'tim_produksi', 'stock_keeper'), async (req, res) => {
  const { from, to, ice_type, machine_code, source, size } = req.query;
  const filter = {};
  if (ice_type) filter.ice_type = ice_type;
  if (size) filter.size = Number(size);
  if (machine_code) filter.machine_code = machine_code;
  if (source) filter.source = source;
  if (from || to) {
    filter.entered_at = {};
    if (from) filter.entered_at.$gte = new Date(from).toISOString();
    if (to) filter.entered_at.$lte = new Date(to).toISOString();
  }
  const batches = await db.getDb().collection('stock_batches').find(filter).sort({ entered_at: -1 }).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Produksi');
  await writeLetterhead(sheet, 'Laporan Produksi', 10);

  const headerRowIdx = sheet.lastRow.number + 1;
  sheet.getRow(headerRowIdx).values = [
    'Kode Batch', 'Tanggal', 'Mesin', 'Jenis Es', 'Ukuran (kg)', 'Sak', 'Berat (kg)', 'Sumber', 'Dicatat oleh', 'Catatan',
  ];
  sheet.getRow(headerRowIdx).font = { bold: true };
  sheet.columns = [
    { key: 'batch_code', width: 20 },
    { key: 'entered_at', width: 22 },
    { key: 'machine_name', width: 14 },
    { key: 'ice_type', width: 12 },
    { key: 'size', width: 12 },
    { key: 'sacks', width: 10 },
    { key: 'weight_kg', width: 12 },
    { key: 'source', width: 14 },
    { key: 'entered_by_name', width: 18 },
    { key: 'notes', width: 24 },
  ];
  batches.forEach((b) => sheet.addRow({ ...b, batch_code: b.batch_code || '-' }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-produksi.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

router.get(
  '/delivery.xlsx',
  auth.requireRole('master_admin', 'management', 'marketing', 'co_driver', 'driver', 'stock_keeper'),
  async (req, res) => {
  const { search, status, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ sj_no: re }, { customer_name: re }, { order_no: re }, { driver_name: re }];
  }
  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = new Date(from).toISOString();
    if (to) filter.created_at.$lte = new Date(to).toISOString();
  }
  const orders = await db.getDb().collection('delivery_orders').find(filter).sort({ created_at: -1 }).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Surat Jalan');
  await writeLetterhead(sheet, 'Laporan Surat Jalan', 10);

  const headerRowIdx = sheet.lastRow.number + 1;
  sheet.getRow(headerRowIdx).values = [
    'No. SJ', 'Tanggal', 'Pelanggan', 'Driver', 'Total Berat (kg)', 'Total Harga (Rp)', 'Status', 'Dibuat oleh', 'Waktu Terkirim',
  ];
  sheet.getRow(headerRowIdx).font = { bold: true };
  sheet.columns = [
    { key: 'sj_no', width: 20 },
    { key: 'created_at', width: 22 },
    { key: 'customer_name', width: 22 },
    { key: 'driver_name', width: 16 },
    { key: 'total_weight_kg', width: 16 },
    { key: 'total_price', width: 18 },
    { key: 'status', width: 14 },
    { key: 'created_by_name', width: 18 },
    { key: 'delivered_at', width: 22 },
  ];
  orders.forEach((o) => sheet.addRow(o));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-surat-jalan.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/audit.xlsx', auth.requireRole('master_admin', 'management'), async (req, res) => {
  const { entity, username, from, to } = req.query;
  const filter = {};
  if (entity) filter.entity = entity;
  if (username) filter.username = username;
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from).toISOString();
    if (to) filter.at.$lte = new Date(to).toISOString();
  }
  const logs = await db.getDb().collection('audit_logs').find(filter).sort({ at: -1 }).limit(2000).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Log Aktivitas');
  await writeLetterhead(sheet, 'Log Aktivitas', 7);

  const headerRowIdx = sheet.lastRow.number + 1;
  sheet.getRow(headerRowIdx).values = ['Waktu', 'Pengguna', 'Aksi', 'Entitas', 'ID', 'Catatan', 'IP'];
  sheet.getRow(headerRowIdx).font = { bold: true };
  sheet.columns = [
    { key: 'at', width: 22 },
    { key: 'username', width: 16 },
    { key: 'action', width: 16 },
    { key: 'entity', width: 16 },
    { key: 'entity_id', width: 24 },
    { key: 'note', width: 40 },
    { key: 'ip', width: 16 },
  ];
  logs.forEach((l) => sheet.addRow({ ...l, at: formatDMYHM(l.at), note: auditNote(l.detail) }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="log-aktivitas.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
