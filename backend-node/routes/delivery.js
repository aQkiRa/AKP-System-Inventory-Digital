const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { emit } = require('../bus');
const { getAvailableStock, consumeStockFIFO, addStockEntry } = require('./stock');

const router = express.Router();
router.use(auth.requireAuth);

async function validateAndPriceItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Minimal 1 item wajib diisi' };
  }
  const cleanItems = [];
  const requestedSoFar = new Map();
  for (const item of items) {
    const ice_type = item.ice_type;
    const size = Number(item.size);
    const qty = Number(item.qty);
    const price_per_sak = Number(item.price_per_sak) || 0;
    if (!db.ICE_TYPES.includes(ice_type)) return { error: 'Jenis es tidak valid' };
    if (!db.SIZES.includes(size)) return { error: 'Ukuran tidak valid' };
    if (!qty || qty <= 0) return { error: 'Jumlah sak harus lebih dari 0' };
    if (price_per_sak < 0) return { error: 'Harga per sak tidak boleh negatif' };

    const stockKey = `${ice_type}-${size}`;
    const alreadyRequested = requestedSoFar.get(stockKey) || 0;
    const available = await getAvailableStock(ice_type, size);
    const remaining = available - alreadyRequested;
    if (qty > remaining) {
      return {
        error: `Stok ${ice_type} ${size}kg tidak cukup: tersedia ${remaining} sak, diminta ${qty} sak (kekurangan ${qty - remaining} sak)`,
      };
    }
    requestedSoFar.set(stockKey, alreadyRequested + qty);

    cleanItems.push({ ice_type, size, qty, weight_kg: size * qty, price_per_sak, subtotal: price_per_sak * qty });
  }
  return {
    cleanItems,
    total_weight_kg: cleanItems.reduce((sum, i) => sum + i.weight_kg, 0),
    total_price: cleanItems.reduce((sum, i) => sum + i.subtotal, 0),
  };
}

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

// 'returned' is deliberately excluded here - it can only be reached through
// the dedicated /:id/return endpoint below, which requires a reason/condition.
const STATUSES = ['pending', 'in_transit', 'delivered', 'cancelled'];
// 'repackage' returns stock to the cold room; 'damaged_packaging' and
// 'shrinkage' are both permanent losses (already excluded from available
// stock since it was consumed at order creation and never returned).
const RETURN_CONDITIONS = ['repackage', 'damaged_packaging', 'shrinkage'];
const RETURN_CONDITIONS_RESTOCK = ['repackage'];
const SORT_FIELDS = { created_at: 'created_at', dispatch_at: 'dispatch_at', total_weight_kg: 'total_weight_kg', sj_no: 'sj_no' };

router.get('/', async (req, res) => {
  const { status, customer_id, search, from, to, sort, dir, page, limit } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (customer_id) filter.customer_id = customer_id;
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ sj_no: re }, { customer_name: re }, { order_no: re }, { driver_name: re }];
  }
  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = new Date(from).toISOString();
    if (to) filter.created_at.$lte = new Date(to).toISOString();
  }

  const sortField = SORT_FIELDS[sort] || 'created_at';
  const sortDir = dir === 'asc' ? 1 : -1;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(limit) || 50));

  const collection = db.getDb().collection('delivery_orders');
  const [orders, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ [sortField]: sortDir })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);
  res.json({ orders, total, page: pageNum, limit: pageSize });
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
  auth.requireRole('master_admin', 'marketing'),
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

    const priced = await validateAndPriceItems(items);
    if (priced.error) return res.status(400).json({ detail: priced.error });
    const { cleanItems, total_weight_kg, total_price } = priced;

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
      total_price,
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
    for (const item of cleanItems) {
      await consumeStockFIFO(item.ice_type, item.size, item.qty);
    }
    await auth.audit(req, 'create', 'delivery_order', order._id, { sj_no, total_weight_kg });
    emit('delivery:updated', { reason: 'created', order });
    emit('stock:updated', { reason: 'delivery_created' });
    res.status(201).json(order);
  }
);

router.patch(
  '/:id',
  auth.requireRole('master_admin', 'marketing'),
  async (req, res) => {
    const existing = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });
    if (existing.status !== 'pending') {
      return res.status(400).json({ detail: 'Surat jalan hanya bisa diedit selama masih berstatus menunggu (belum dikirim)' });
    }

    const { customer_id, items, notes, order_no, dispatch_at } = req.body || {};
    const update = {};

    if (customer_id !== undefined) {
      const customer = await db.getDb().collection('customers').findOne({ _id: customer_id });
      if (!customer) return res.status(400).json({ detail: 'Pelanggan tidak ditemukan' });
      update.customer_id = customer_id;
      update.customer_name = customer.name;
      update.customer_phone = customer.phone;
      update.customer_address = customer.address;
    }
    if (order_no !== undefined) update.order_no = order_no;
    if (notes !== undefined) update.notes = notes;
    if (dispatch_at !== undefined) {
      if (Number.isNaN(new Date(dispatch_at).getTime())) return res.status(400).json({ detail: 'Tanggal keberangkatan tidak valid' });
      const dispatchDate = new Date(dispatch_at);
      update.dispatch_at = dispatchDate.toISOString();
      update.expected_arrival_at = new Date(dispatchDate.getTime() + existing.estimated_duration_hours * 3600 * 1000).toISOString();
    }

    // Editing items releases the old allocation back to stock first, then
    // re-validates and re-consumes against the new item list.
    if (items !== undefined) {
      for (const item of existing.items) {
        await addStockEntry({
          ice_type: item.ice_type,
          size: item.size,
          sacks: item.qty,
          source: 'edit_release',
          notes: `Dilepas untuk revisi surat jalan ${existing.sj_no}`,
          entered_by: req.user.id,
          entered_by_name: req.user.name,
        });
      }
      const priced = await validateAndPriceItems(items);
      if (priced.error) {
        // Put the released stock back exactly as it was before bailing out.
        for (const item of existing.items) {
          await consumeStockFIFO(item.ice_type, item.size, item.qty);
        }
        return res.status(400).json({ detail: priced.error });
      }
      for (const item of priced.cleanItems) {
        await consumeStockFIFO(item.ice_type, item.size, item.qty);
      }
      update.items = priced.cleanItems;
      update.total_weight_kg = priced.total_weight_kg;
      update.total_price = priced.total_price;
    }

    const result = await db
      .getDb()
      .collection('delivery_orders')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const order = result?.value ?? result;

    await auth.audit(req, 'edit', 'delivery_order', req.params.id, update);
    emit('delivery:updated', { reason: 'edited', order });
    emit('stock:updated', { reason: 'delivery_edited' });
    res.json(order);
  }
);

// A driver may start and finish the shipment they carry (from "Pengiriman
// Saya"), but never cancel it - and only on orders assigned to them.
const STATUS_TRANSITION_ROLES = {
  in_transit: ['master_admin', 'co_driver', 'driver'],
  delivered: ['master_admin', 'co_driver', 'driver'],
  cancelled: ['master_admin', 'co_driver'],
};

function isOtherDriversOrder(user, order) {
  return user.role === 'driver' && order.driver_id !== user.id;
}

router.patch(
  '/:id/status',
  auth.requireRole('master_admin', 'co_driver', 'driver'),
  async (req, res) => {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ detail: 'Status tidak valid' });
    if (!STATUS_TRANSITION_ROLES[status].includes(req.user.role)) {
      return res.status(403).json({ detail: 'Akses ditolak untuk role Anda' });
    }

    const existing = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });
    if (isOtherDriversOrder(req.user, existing)) {
      return res.status(403).json({ detail: 'Surat jalan ini tidak ditugaskan ke Anda' });
    }

    if (status === 'in_transit' && !existing.driver_id) {
      return res.status(400).json({ detail: 'Driver harus ditentukan sebelum pengiriman diproses' });
    }
    if (status === 'cancelled' && existing.status === 'cancelled') {
      return res.status(400).json({ detail: 'Surat jalan sudah dibatalkan sebelumnya' });
    }

    const update = { status };
    if (status === 'delivered') update.delivered_at = new Date().toISOString();

    const result = await db
      .getDb()
      .collection('delivery_orders')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const order = result?.value ?? result;

    if (status === 'cancelled') {
      for (const item of existing.items) {
        await addStockEntry({
          ice_type: item.ice_type,
          size: item.size,
          sacks: item.qty,
          source: 'return_cancelled',
          notes: `Dibatalkan dari surat jalan ${existing.sj_no}`,
          entered_by: req.user.id,
          entered_by_name: req.user.name,
        });
      }
    }

    await auth.audit(req, 'status_change', 'delivery_order', req.params.id, { status });
    emit('delivery:updated', { reason: 'status_change', order });
    if (status === 'cancelled') emit('stock:updated', { reason: 'delivery_cancelled' });
    res.json(order);
  }
);

router.patch(
  '/:id/return',
  auth.requireRole('master_admin', 'co_driver'),
  async (req, res) => {
    const { condition, reason, returned_qty } = req.body || {};
    if (!RETURN_CONDITIONS.includes(condition)) {
      return res.status(400).json({
        detail: 'Kondisi retur harus salah satu dari: repackage (dikemas ulang), damaged_packaging (kemasan rusak), atau shrinkage (susut/meleleh)',
      });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ detail: 'Alasan retur wajib diisi' });
    }

    const existing = await db.getDb().collection('delivery_orders').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ detail: 'Surat jalan tidak ditemukan' });
    if (!['pending', 'in_transit'].includes(existing.status)) {
      return res.status(400).json({ detail: 'Hanya surat jalan yang belum selesai yang bisa diretur' });
    }

    // returned_qty is one number per order item (same order as items); omitted
    // means the whole order came back. Whatever isn't returned counts as sold.
    const returnedItems = [];
    for (let i = 0; i < existing.items.length; i++) {
      const item = existing.items[i];
      const qty = Array.isArray(returned_qty) ? Number(returned_qty[i]) || 0 : item.qty;
      if (qty < 0 || qty > item.qty) {
        return res.status(400).json({
          detail: `Jumlah retur ${item.ice_type} ${item.size}kg harus antara 0 dan ${item.qty} sak`,
        });
      }
      if (qty > 0) returnedItems.push({ ice_type: item.ice_type, size: item.size, qty });
    }
    const returnedTotal = returnedItems.reduce((s, i) => s + i.qty, 0);
    if (returnedTotal === 0) {
      return res.status(400).json({ detail: 'Jumlah sak yang diretur wajib diisi' });
    }

    if (RETURN_CONDITIONS_RESTOCK.includes(condition)) {
      for (const item of returnedItems) {
        await addStockEntry({
          ice_type: item.ice_type,
          size: item.size,
          sacks: item.qty,
          source: 'return_repackage',
          notes: `Retur dari surat jalan ${existing.sj_no}: ${reason.trim()}`,
          entered_by: req.user.id,
          entered_by_name: req.user.name,
        });
      }
    }

    const update = {
      status: 'returned',
      return_condition: condition,
      return_reason: reason.trim(),
      returned_items: returnedItems,
      returned_qty: returnedTotal,
      returned_at: new Date().toISOString(),
    };
    const result = await db
      .getDb()
      .collection('delivery_orders')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const order = result?.value ?? result;

    await auth.audit(req, 'return', 'delivery_order', req.params.id, update);
    emit('delivery:updated', { reason: 'returned', order });
    emit('stock:updated', { reason: 'delivery_returned' });
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
  const order = result?.value ?? result;

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
    if (isOtherDriversOrder(req.user, order)) {
      return res.status(403).json({ detail: 'Surat jalan ini tidak ditugaskan ke Anda' });
    }

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
