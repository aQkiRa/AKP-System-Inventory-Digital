const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/', async (req, res) => {
  const customers = await db.getDb().collection('customers').find({}).sort({ name: 1 }).toArray();
  res.json(customers);
});

router.post(
  '/',
  auth.requireRole('master_admin', 'management', 'marketing'),
  async (req, res) => {
    const { name, phone, address } = req.body || {};
    if (!name) return res.status(400).json({ detail: 'Nama pelanggan wajib diisi' });

    const customer = { _id: randomUUID(), name, phone: phone || '', address: address || '', active: true };
    await db.getDb().collection('customers').insertOne(customer);
    await auth.audit(req, 'create', 'customer', customer._id, { name });
    res.status(201).json(customer);
  }
);

router.patch(
  '/:id',
  auth.requireRole('master_admin', 'management', 'marketing'),
  async (req, res) => {
    const { name, phone, address, active } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (active !== undefined) update.active = !!active;

    const result = await db
      .getDb()
      .collection('customers')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const doc = result.value || result;
    if (!doc) return res.status(404).json({ detail: 'Pelanggan tidak ditemukan' });
    await auth.audit(req, 'update', 'customer', req.params.id, update);
    res.json(doc);
  }
);

router.delete(
  '/:id',
  auth.requireRole('master_admin', 'management', 'marketing'),
  async (req, res) => {
    const result = await db
      .getDb()
      .collection('customers')
      .findOneAndUpdate({ _id: req.params.id }, { $set: { active: false } }, { returnDocument: 'after' });
    const doc = result.value || result;
    if (!doc) return res.status(404).json({ detail: 'Pelanggan tidak ditemukan' });
    await auth.audit(req, 'deactivate', 'customer', req.params.id, {});
    res.json(doc);
  }
);

module.exports = router;
