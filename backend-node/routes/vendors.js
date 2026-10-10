const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

const MANAGE_ROLES = ['master_admin', 'stock_keeper'];
const FIELDS = ['company_name', 'nickname', 'vendor_type', 'country', 'address', 'phone'];

function pickFields(body) {
  const out = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '').trim();
  }
  return out;
}

function validate(v) {
  if (v.company_name !== undefined && !v.company_name) return 'Nama perusahaan wajib diisi';
  if (v.vendor_type !== undefined && !db.VENDOR_TYPES.includes(v.vendor_type)) return 'Jenis vendor tidak valid';
  if (v.country !== undefined && !v.country) return 'Asal negara wajib diisi';
  if (v.phone !== undefined && v.phone && !/^[0-9+()\-\s]{6,20}$/.test(v.phone)) return 'Nomor telepon tidak valid';
  return null;
}

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.vendor_type) filter.vendor_type = req.query.vendor_type;
  const vendors = await db.getDb().collection('vendors').find(filter).sort({ company_name: 1 }).toArray();
  res.json(vendors);
});

router.post('/', auth.requireRole(...MANAGE_ROLES), async (req, res) => {
  const fields = pickFields(req.body || {});
  const vendor = {
    company_name: '',
    nickname: '',
    vendor_type: '',
    country: 'Indonesia',
    address: '',
    phone: '',
    ...fields,
  };
  const err = validate(vendor);
  if (err) return res.status(400).json({ detail: err });

  const doc = { _id: randomUUID(), ...vendor, active: true, created_at: new Date().toISOString() };
  await db.getDb().collection('vendors').insertOne(doc);
  await auth.audit(req, 'create', 'vendor', doc._id, { company_name: doc.company_name, vendor_type: doc.vendor_type });
  res.status(201).json(doc);
});

router.patch('/:id', auth.requireRole(...MANAGE_ROLES), async (req, res) => {
  const update = pickFields(req.body || {});
  if (req.body?.active !== undefined) update.active = !!req.body.active;
  const err = validate(update);
  if (err) return res.status(400).json({ detail: err });

  const result = await db
    .getDb()
    .collection('vendors')
    .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
  const doc = result?.value ?? result;
  if (!doc) return res.status(404).json({ detail: 'Vendor tidak ditemukan' });
  await auth.audit(req, 'update', 'vendor', req.params.id, update);
  res.json(doc);
});

module.exports = router;
