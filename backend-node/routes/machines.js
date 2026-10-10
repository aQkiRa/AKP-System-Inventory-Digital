const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/', async (req, res) => {
  const machines = await db.getDb().collection('machines').find({}).sort({ code: 1 }).toArray();
  res.json(machines);
});

router.post('/', auth.requireRole('master_admin', 'co_produksi'), async (req, res) => {
  const { code, name, avg_sacks_per_harvest } = req.body || {};
  if (!code || !name) return res.status(400).json({ detail: 'Kode dan nama mesin wajib diisi' });
  const existing = await db.getDb().collection('machines').findOne({ code });
  if (existing) return res.status(409).json({ detail: 'Kode mesin sudah digunakan' });

  const machine = {
    _id: randomUUID(),
    code,
    name,
    avg_sacks_per_harvest: Number(avg_sacks_per_harvest) || 0,
    active: true,
    status: 'running',
    status_changed_at: new Date().toISOString(),
  };
  await db.getDb().collection('machines').insertOne(machine);
  await auth.audit(req, 'create', 'machine', machine._id, { code, name });
  res.status(201).json(machine);
});

const MACHINE_STATUSES = ['running', 'maintenance'];

router.patch('/:id', auth.requireRole('master_admin', 'co_produksi'), async (req, res) => {
  const { name, avg_sacks_per_harvest, active, status } = req.body || {};
  const update = {};
  if (name !== undefined) update.name = name;
  if (avg_sacks_per_harvest !== undefined) update.avg_sacks_per_harvest = Number(avg_sacks_per_harvest) || 0;
  if (active !== undefined) update.active = !!active;
  if (status !== undefined) {
    if (!MACHINE_STATUSES.includes(status)) return res.status(400).json({ detail: 'Status mesin tidak valid' });
    update.status = status;
    update.status_changed_at = new Date().toISOString();
  }

  const result = await db
    .getDb()
    .collection('machines')
    .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
  const doc = result?.value ?? result;
  if (!doc) return res.status(404).json({ detail: 'Mesin tidak ditemukan' });
  await auth.audit(req, 'update', 'machine', req.params.id, update);
  res.json(doc);
});

module.exports = router;
