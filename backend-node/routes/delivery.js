const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { emit } = require('../bus');

const router = express.Router();
router.use(auth.requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'pod');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('File harus berupa gambar (JPEG, PNG, atau WebP)'));
    }
    cb(null, true);
  },
});

const STATUSES = ['pending', 'in_transit', 'delivered', 'cancelled'];

router.get('/', async (req, res) => {
  const { status, customer_id } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (customer_id) filter.customer_id = customer_id;
  const orders = await db
    .getDb()
    .collection('delivery_orders')
    .find(filter)
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  res.json(orders);
});

router.get('/mine', async (req, res) => {
  const orders = await db
    .getDb()
    .collection('delivery_orders')
    .find({ driver_id: req.user.id })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
  if (!order) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });
  res.json(order);
});

router.post(
  '/',
  auth.requireRole('master_admin', 'marketing', 'co_driver', 'stock_keeper'),
  async (req, res) => {
    const { customer_id, driver_id, items, notes, order_no, dispatch_at, estimated_duration_hours } = req.body || {};
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ detail: 'Pelanggan dan minimal 1 item wajib diisi' });
    }
    if (!dispatch_at || Number.isNaN(new Date(dispatch_at).getTime())) {
      return res.status(400).json({ detail: 'Tanggal keberangkatan wajib diisi' });
    }
    const customer = await db.getDb().collection('customers').findOne({ _id: customer_id });
    if (!customer) return res.status(400).json({ detail: 'Pelanggan tidak ditemukan' });

    const durationHours = Number(estimated_duration_hours) > 0 ? Number(estimated_duration_hours) : 3;
    const dispatchDate = new Date(dispatch_at);
    const expectedArrival = new Date(dispatchDate.getTime() + durationHours * 3600 * 1000);

    const canAssignDriver = ['master_admin', 'co_driver'].includes(req.user.role);
    let driver = null;
    if (driver_id && canAssignDriver) {
      driver = await db.getDb().collection('users').findOne({ _id: driver_id, role: { $in: ['driver', 'co_driver'] } });
      if (!driver) return res.status(400).json({ detail: 'Driver tidak ditemukan' });
    }

    const cleanItems = [];
    for (const item of items) {
      const ice_type = item.ice_type;
      const size = Number(item.size);
      const qty = Number(item.qty);
      if (!db.ICE_TYPES.includes(ice_type)) return res.status(400).json({ detail: 'Jenis es tidak valid' });
      if (!db.SIZES.includes(size)) return res.status(400).json({ detail: 'Ukuran tidak valid' });
      if (!qty || qty <= 0) return res.status(400).json({ detail: 'Jumlah karung harus lebih dari 0' });
      cleanItems.push({ ice_type, size, qty, weight_kg: size * qty });
    }
    const total_weight_kg = cleanItems.reduce((sum, i) => sum + i.weight_kg, 0);

    const sj_no = await db.nextSjNo();
    const order = {
      _id: randomUUID(),
      sj_no,
      order_no: order_no || '',
      customer_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      driver_id: driver ? driver._id : null,
      driver_name: driver ? driver.name : null,
      items: cleanItems,
      total_weight_kg,
      dispatch_at: dispatchDate.toISOString(),
      estimated_duration_hours: durationHours,
      expected_arrival_at: expectedArrival.toISOString(),
      status: 'pending',
      pod_photo: null,
      notes: notes || '',
      created_by: req.user.id,
      created_by_name: req.user.name,
      created_at: new Date().toISOString(),
      delivered_at: null,
    };
    await db.getDb().collection('delivery_orders').insertOne(order);
    await auth.audit(req, 'create', 'delivery_order', order._id, { sj_no, total_weight_kg });
    emit('delivery:updated', { reason: 'created', order });
    emit('stock:updated', { reason: 'delivery_created' });
    res.status(201).json(order);
  }
);

router.patch(
  '/:id/status',
  auth.requireRole('master_admin', 'co_driver', 'driver'),
  async (req, res) => {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ detail: 'Status tidak valid' });

    const update = { status };
    if (status === 'delivered') update.delivered_at = new Date().toISOString();

    const result = await db
      .getDb()
      .collection('delivery_orders')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const order = result.value || result;
    if (!order) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });

    await auth.audit(req, 'status_change', 'delivery_order', req.params.id, { status });
    emit('delivery:updated', { reason: 'status_change', order });
    if (status === 'cancelled') emit('stock:updated', { reason: 'delivery_cancelled' });
    res.json(order);
  }
);

router.patch('/:id/driver', auth.requireRole('master_admin', 'co_driver'), async (req, res) => {
  const { driver_id } = req.body || {};
  const existing = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
  if (!existing) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });
  if (['delivered', 'cancelled'].includes(existing.status)) {
    return res.status(400).json({ detail: 'Surat jalan yang sudah selesai tidak bisa diubah drivernya' });
  }

  let driver = null;
  if (driver_id) {
    driver = await db
      .getDb()
      .collection('users')
      .findOne({ _id: driver_id, role: { $in: ['driver', 'co_driver'] }, active: true });
    if (!driver) return res.status(400).json({ detail: 'Driver tidak ditemukan' });
  }

  const update = { driver_id: driver ? driver._id : null, driver_name: driver ? driver.name : null };
  const result = await db
    .getDb()
    .collection('delivery_orders')
    .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
  const order = result.value || result;

  await auth.audit(req, 'assign_driver', 'delivery_order', req.params.id, update);
  emit('delivery:updated', { reason: 'driver_assigned', order });
  res.json(order);
});

router.post(
  '/:id/pod',
  auth.requireRole('master_admin', 'co_driver', 'driver'),
  upload.single('photo'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'File foto wajib diupload' });
    const order = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });

    const filename = `${order._id}-${Date.now()}.jpg`;
    await sharp(req.file.buffer).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(
      path.join(UPLOAD_DIR, filename)
    );

    const pod_photo = `/uploads/pod/${filename}`;
    await db.getDb().collection('delivery_orders').updateOne({ _id: order._id }, { $set: { pod_photo } });
    await auth.audit(req, 'upload_pod', 'delivery_order', order._id, {});
    emit('delivery:updated', { reason: 'pod_uploaded', order: { ...order, pod_photo } });
    res.json({ pod_photo });
  }
);

module.exports = router;
