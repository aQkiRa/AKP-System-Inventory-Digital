const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth, auth.requireRole('master_admin', 'management', 'stock_keeper'));

router.get('/stock.xlsx', async (req, res) => {
  const batches = await db.getDb().collection('stock_batches').find({}).sort({ entered_at: -1 }).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Produksi Stok');
  sheet.columns = [
    { header: 'Tanggal', key: 'entered_at', width: 22 },
    { header: 'Mesin', key: 'machine_name', width: 14 },
    { header: 'Jenis Es', key: 'ice_type', width: 12 },
    { header: 'Ukuran (kg)', key: 'size', width: 12 },
    { header: 'Karung', key: 'sacks', width: 10 },
    { header: 'Berat (kg)', key: 'weight_kg', width: 12 },
    { header: 'Shift', key: 'shift', width: 10 },
    { header: 'Dicatat oleh', key: 'entered_by_name', width: 18 },
    { header: 'Catatan', key: 'notes', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  batches.forEach((b) => sheet.addRow(b));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-produksi-stok.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/delivery.xlsx', async (req, res) => {
  const orders = await db.getDb().collection('delivery_orders').find({}).sort({ created_at: -1 }).toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Surat Jalan');
  sheet.columns = [
    { header: 'No. SJ', key: 'sj_no', width: 20 },
    { header: 'Tanggal', key: 'created_at', width: 22 },
    { header: 'Pelanggan', key: 'customer_name', width: 22 },
    { header: 'Driver', key: 'driver_name', width: 16 },
    { header: 'Total Berat (kg)', key: 'total_weight_kg', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Dibuat oleh', key: 'created_by_name', width: 18 },
    { header: 'Waktu Terkirim', key: 'delivered_at', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  orders.forEach((o) => sheet.addRow(o));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-surat-jalan.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
