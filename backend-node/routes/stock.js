const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { emit } = require('../bus');

const router = express.Router();
router.use(auth.requireAuth);

async function computeStockSummary() {
  const database = db.getDb();
  const produced = await database
    .collection('stock_batches')
    .aggregate([{ $group: { _id: { ice_type: '$ice_type', size: '$size' }, sacks: { $sum: '$sacks' } } }])
    .toArray();
  const delivered = await database
    .collection('delivery_orders')
    .aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: { ice_type: '$items.ice_type', size: '$items.size' }, sacks: { $sum: '$items.qty' } } },
    ])
    .toArray();
  const demanded = await database
    .collection('delivery_orders')
    .aggregate([
      { $match: { status: { $in: ['pending', 'in_transit'] } } },
      { $unwind: '$items' },
      { $group: { _id: { ice_type: '$items.ice_type', size: '$items.size' }, sacks: { $sum: '$items.qty' } } },
    ])
    .toArray();

  const map = new Map();
  const key = (t, s) => `${t}-${s}`;
  for (const type of db.ICE_TYPES) {
    for (const size of db.SIZES) {
      map.set(key(type, size), { ice_type: type, size, produced: 0, delivered: 0, demand: 0, stock: 0 });
    }
  }
  for (const p of produced) {
    const k = key(p._id.ice_type, p._id.size);
    if (!map.has(k)) map.set(k, { ice_type: p._id.ice_type, size: p._id.size, produced: 0, delivered: 0, demand: 0, stock: 0 });
    map.get(k).produced = p.sacks;
  }
  for (const d of delivered) {
    const k = key(d._id.ice_type, d._id.size);
    if (!map.has(k)) map.set(k, { ice_type: d._id.ice_type, size: d._id.size, produced: 0, delivered: 0, demand: 0, stock: 0 });
    map.get(k).delivered = d.sacks;
  }
  for (const d of demanded) {
    const k = key(d._id.ice_type, d._id.size);
    if (!map.has(k)) map.set(k, { ice_type: d._id.ice_type, size: d._id.size, produced: 0, delivered: 0, demand: 0, stock: 0 });
    map.get(k).demand = d.sacks;
  }
  const rows = [...map.values()].map((r) => ({ ...r, stock: r.produced - r.delivered }));
  rows.sort((a, b) => (a.ice_type === b.ice_type ? a.size - b.size : a.ice_type.localeCompare(b.ice_type)));
  return rows;
}

router.get('/summary', async (req, res) => {
  const rows = await computeStockSummary();
  res.json(rows.map((r) => ({ ...r, min_required_stock: r.demand, low_stock: r.stock < r.demand })));
});

router.get('/batches', async (req, res) => {
  const { from, to, machine_code } = req.query;
  const filter = {};
  if (machine_code) filter.machine_code = machine_code;
  if (from || to) {
    filter.entered_at = {};
    if (from) filter.entered_at.$gte = new Date(from).toISOString();
    if (to) filter.entered_at.$lte = new Date(to).toISOString();
  }
  const batches = await db
    .getDb()
    .collection('stock_batches')
    .find(filter)
    .sort({ entered_at: -1 })
    .limit(500)
    .toArray();
  res.json(batches);
});

router.post(
  '/batches',
  auth.requireRole('master_admin', 'co_produksi', 'tim_produksi'),
  async (req, res) => {
    const { machine_code, ice_type, size, sacks, shift, notes } = req.body || {};
    if (!machine_code || !ice_type || !size || !sacks) {
      return res.status(400).json({ detail: 'Mesin, jenis es, ukuran, dan jumlah karung wajib diisi' });
    }
    if (!db.ICE_TYPES.includes(ice_type)) return res.status(400).json({ detail: 'Jenis es tidak valid' });
    const sizeNum = Number(size);
    if (!db.SIZES.includes(sizeNum)) return res.status(400).json({ detail: 'Ukuran tidak valid' });
    const sacksNum = Number(sacks);
    if (!sacksNum || sacksNum <= 0) return res.status(400).json({ detail: 'Jumlah karung harus lebih dari 0' });

    const machine = await db.getDb().collection('machines').findOne({ code: machine_code });
    if (!machine) return res.status(400).json({ detail: 'Mesin tidak ditemukan' });

    const batch = {
      _id: randomUUID(),
      machine_code,
      machine_name: machine.name,
      ice_type,
      size: sizeNum,
      sacks: sacksNum,
      weight_kg: sizeNum * sacksNum,
      shift: shift || '-',
      notes: notes || '',
      entered_by: req.user.id,
      entered_by_name: req.user.name,
      entered_at: new Date().toISOString(),
    };
    await db.getDb().collection('stock_batches').insertOne(batch);
    await auth.audit(req, 'create', 'stock_batch', batch._id, { ice_type, size: sizeNum, sacks: sacksNum });
    emit('stock:updated', { reason: 'batch_created', batch });
    res.status(201).json(batch);
  }
);

module.exports = router;
