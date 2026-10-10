const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { emit } = require('../bus');
const { batchCode } = require('../batchCode');

const router = express.Router();
router.use(auth.requireAuth);

function emptyRow(ice_type, size) {
  return { ice_type, size, produced: 0, delivered: 0, reserved: 0, damaged: 0, available_stock: 0 };
}

async function sumItemsByStatus(database, matchStatus, field = '$items') {
  return database
    .collection('delivery_orders')
    .aggregate([
      { $match: matchStatus },
      { $project: { lines: field } },
      { $unwind: '$lines' },
      { $group: { _id: { ice_type: '$lines.ice_type', size: '$lines.size' }, sacks: { $sum: '$lines.qty' } } },
    ])
    .toArray();
}

// Quantity of an order line that actually came back on a return. Returns made
// before partial returns existed have no returned_items and were full returns.
function returnedQtyFor(order, item) {
  if (order.status !== 'returned') return 0;
  if (!Array.isArray(order.returned_items)) return item.qty;
  const match = order.returned_items.find((r) => r.ice_type === item.ice_type && r.size === item.size);
  return match ? match.qty : 0;
}

// available_stock is the live sum of what's still physically sitting in the
// cold room per batch (remaining_sacks), not a derived produced-minus-delivered
// figure - every consumption/return/adjustment mutates the batches directly so
// this always matches the "Batch Aging" table.
async function computeStockSummary() {
  const database = db.getDb();
  const produced = await database
    .collection('stock_batches')
    .aggregate([{ $group: { _id: { ice_type: '$ice_type', size: '$size' }, sacks: { $sum: '$sacks' } } }])
    .toArray();
  const remaining = await database
    .collection('stock_batches')
    .aggregate([{ $group: { _id: { ice_type: '$ice_type', size: '$size' }, sacks: { $sum: '$remaining_sacks' } } }])
    .toArray();
  const delivered = await sumItemsByStatus(database, { status: 'delivered' });
  const reserved = await sumItemsByStatus(database, { status: { $in: ['pending', 'in_transit'] } });
  const damaged = await sumItemsByStatus(
    database,
    { status: 'returned', return_condition: { $in: ['damaged_packaging', 'shrinkage'] } },
    { $ifNull: ['$returned_items', '$items'] }
  );

  const map = new Map();
  const key = (t, s) => `${t}-${s}`;
  for (const type of db.ICE_TYPES) {
    for (const size of db.SIZES) {
      map.set(key(type, size), emptyRow(type, size));
    }
  }
  const apply = (rows, field) => {
    for (const r of rows) {
      const k = key(r._id.ice_type, r._id.size);
      if (!map.has(k)) map.set(k, emptyRow(r._id.ice_type, r._id.size));
      map.get(k)[field] = r.sacks;
    }
  };
  for (const p of produced) {
    const k = key(p._id.ice_type, p._id.size);
    if (!map.has(k)) map.set(k, emptyRow(p._id.ice_type, p._id.size));
    map.get(k).produced = p.sacks;
  }
  apply(delivered, 'delivered');
  apply(reserved, 'reserved');
  apply(damaged, 'damaged');
  for (const r of remaining) {
    const k = key(r._id.ice_type, r._id.size);
    if (!map.has(k)) map.set(k, emptyRow(r._id.ice_type, r._id.size));
    map.get(k).available_stock = r.sacks;
  }

  const rows = [...map.values()];
  rows.sort((a, b) => (a.ice_type === b.ice_type ? a.size - b.size : a.ice_type.localeCompare(b.ice_type)));
  return rows;
}

async function getAvailableStock(ice_type, size) {
  const database = db.getDb();
  const result = await database
    .collection('stock_batches')
    .aggregate([{ $match: { ice_type, size } }, { $group: { _id: null, sacks: { $sum: '$remaining_sacks' } } }])
    .toArray();
  return result[0] ? result[0].sacks : 0;
}

// FIFO: draws from the oldest batches first. Caller must have already
// validated total availability - this does not re-check and will happily
// walk remaining_sacks down to 0 across as many batches as it takes.
async function consumeStockFIFO(ice_type, size, qty) {
  const database = db.getDb();
  const batches = await database
    .collection('stock_batches')
    .find({ ice_type, size, remaining_sacks: { $gt: 0 } })
    .sort({ entered_at: 1 })
    .toArray();
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(b.remaining_sacks, left);
    await database.collection('stock_batches').updateOne({ _id: b._id }, { $inc: { remaining_sacks: -take } });
    left -= take;
  }
}

// Cancellations, repackaged returns, and manual adjustments all re-enter
// stock the same way: as a fresh batch dated "now", not backdated into
// whichever batch it originally came from (we don't track that lineage).
async function addStockEntry({ ice_type, size, sacks, source, notes, entered_by, entered_by_name, idPrefix, extra }) {
  const database = db.getDb();
  const batch = {
    ...(extra || {}),
    _id: idPrefix ? `${idPrefix}-${Date.now()}` : randomUUID(),
    machine_code: null,
    machine_name: null,
    ice_type,
    size,
    sacks,
    remaining_sacks: sacks,
    weight_kg: size * sacks,
    shift: '-',
    notes: notes || '',
    source,
    entered_by,
    entered_by_name,
    entered_at: new Date().toISOString(),
  };
  await database.collection('stock_batches').insertOne(batch);
  emit('stock:updated', { reason: `stock_entry_${source}`, batch });
  return batch;
}

const ICE_VENDOR_TYPE = 'Pabrik Es';

// Vendor purchases must name a registered, active ice-factory vendor; the
// company name is snapshotted on the batch so later vendor edits don't
// rewrite history.
async function resolveIceVendor(vendorId) {
  if (!vendorId) return { error: 'Vendor pabrik es wajib dipilih' };
  const vendor = await db.getDb().collection('vendors').findOne({ _id: vendorId });
  if (!vendor) return { error: 'Vendor tidak ditemukan' };
  if (vendor.vendor_type !== ICE_VENDOR_TYPE) return { error: 'Vendor harus berjenis Pabrik Es' };
  if (!vendor.active) return { error: 'Vendor sudah nonaktif' };
  return { vendor };
}

router.get('/summary', async (req, res) => {
  const rows = await computeStockSummary();
  res.json(rows.map((r) => ({ ...r, low_stock: r.available_stock <= 0 })));
});

const COLD_ROOM_INFLOW_SOURCES = ['harvest', 'repack'];
const CONSUMING_STATUSES = ['pending', 'in_transit', 'delivered', 'cancelled', 'returned'];
const SALES_STATUSES = ['pending', 'in_transit', 'delivered'];

function localDayKey(iso) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Stock at any past moment is reconstructed backwards from the live
// remaining_sacks: everything that entered after that moment is removed and
// everything consumed after it is added back. "Consumed" counts every order
// created after the moment regardless of later status (stock is taken at
// creation; cancellations/repack returns come back as their own batches),
// plus negative manual adjustments, which only leave a trace in audit_logs.
// edit_release batches are skipped because they only re-credit an order's
// original allocation, which is no longer visible on the edited order.
router.get('/report', async (req, res) => {
  const database = db.getDb();
  const now = new Date();
  const fromDate = req.query.from ? new Date(req.query.from) : new Date(new Date().setHours(0, 0, 0, 0));
  const toDate = req.query.to ? new Date(req.query.to) : now;
  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();
  const { source, ice_type } = req.query;
  const size = req.query.size ? Number(req.query.size) : null;

  const matchesKey = (t, s) => (!ice_type || t === ice_type) && (!size || s === size);
  const key = (t, s) => `${t}|${s}`;

  const [allBatches, ordersSinceFrom, negAdjustLogs] = await Promise.all([
    database.collection('stock_batches').find({}, { projection: { ice_type: 1, size: 1, sacks: 1, remaining_sacks: 1, source: 1, entered_at: 1 } }).toArray(),
    database.collection('delivery_orders').find({ created_at: { $gte: fromIso }, status: { $in: CONSUMING_STATUSES } }).toArray(),
    database.collection('audit_logs').find({ action: 'adjust', at: { $gte: fromIso }, 'detail.sacks': { $lt: 0 } }).toArray(),
  ]);

  const rows = new Map();
  const ensure = (t, s) => {
    const k = key(t, s);
    if (!rows.has(k)) {
      rows.set(k, {
        ice_type: t, size: s, available_now: 0,
        batches_after_from: 0, batches_after_to: 0, consumed_after_from: 0, consumed_after_to: 0,
        harvest: 0, vendor_purchase: 0, other_in: 0, sales: 0,
      });
    }
    return rows.get(k);
  };
  for (const t of db.ICE_TYPES) for (const s of db.SIZES) ensure(t, s);

  for (const b of allBatches) {
    const r = ensure(b.ice_type, b.size);
    r.available_now += b.remaining_sacks || 0;
    if (b.source === 'edit_release') continue;
    if (b.entered_at >= fromIso) r.batches_after_from += b.sacks;
    if (b.entered_at > toIso) r.batches_after_to += b.sacks;
    if (b.entered_at >= fromIso && b.entered_at <= toIso) {
      if (source && b.source !== source) continue;
      if (COLD_ROOM_INFLOW_SOURCES.includes(b.source)) r.harvest += b.sacks;
      else if (b.source === 'vendor_purchase') r.vendor_purchase += b.sacks;
      else r.other_in += b.sacks;
    }
  }

  const daily = new Map();
  const dayRow = (d) => {
    if (!daily.has(d)) daily.set(d, { date: d, inflow: 0, vendor_purchase: 0, sales: 0 });
    return daily.get(d);
  };
  for (let d = new Date(fromDate); d <= toDate && daily.size < 62; d.setDate(d.getDate() + 1)) {
    dayRow(localDayKey(d.toISOString()));
  }
  for (const b of allBatches) {
    if (b.entered_at < fromIso || b.entered_at > toIso || !matchesKey(b.ice_type, b.size)) continue;
    if (source && b.source !== source) continue;
    if (COLD_ROOM_INFLOW_SOURCES.includes(b.source)) dayRow(localDayKey(b.entered_at)).inflow += b.sacks;
    else if (b.source === 'vendor_purchase') dayRow(localDayKey(b.entered_at)).vendor_purchase += b.sacks;
  }

  for (const o of ordersSinceFrom) {
    for (const it of o.items) {
      const r = ensure(it.ice_type, it.size);
      r.consumed_after_from += it.qty;
      if (o.created_at > toIso) r.consumed_after_to += it.qty;
      let sold = 0;
      if (SALES_STATUSES.includes(o.status)) sold = it.qty;
      else if (o.status === 'returned') sold = it.qty - returnedQtyFor(o, it);
      if (o.created_at <= toIso && sold > 0) {
        r.sales += sold;
        if (matchesKey(it.ice_type, it.size)) dayRow(localDayKey(o.created_at)).sales += sold;
      }
    }
  }
  for (const log of negAdjustLogs) {
    const [t, s] = String(log.entity_id).split('-');
    const r = ensure(t, Number(s));
    const qty = Math.abs(log.detail.sacks);
    r.consumed_after_from += qty;
    if (log.at > toIso) r.consumed_after_to += qty;
  }

  const items = [...rows.values()]
    .filter((r) => matchesKey(r.ice_type, r.size))
    // Retired sizes only show while they still hold or moved stock.
    .filter((r) => db.SIZES.includes(r.size) || r.available_now || r.harvest || r.sales || r.vendor_purchase)
    .map((r) => {
      const initial = Math.max(0, r.available_now - r.batches_after_from + r.consumed_after_from);
      const available = Math.max(0, r.available_now - r.batches_after_to + r.consumed_after_to);
      let status = 'ok';
      if (available <= 0) status = 'empty';
      else if (r.sales > available) status = 'short';
      return {
        ice_type: r.ice_type,
        size: r.size,
        initial_stock: initial,
        harvest: r.harvest,
        vendor_purchase: r.vendor_purchase,
        sales: r.sales,
        available_stock: available,
        available_kg: available * r.size,
        status,
      };
    })
    .sort((a, b) => (a.ice_type === b.ice_type ? b.size - a.size : a.ice_type.localeCompare(b.ice_type)));

  const totals = items.reduce(
    (acc, r) => ({
      available_sak: acc.available_sak + r.available_stock,
      available_kg: acc.available_kg + r.available_kg,
      inflow: acc.inflow + r.harvest,
      vendor_purchase: acc.vendor_purchase + r.vendor_purchase,
      sales: acc.sales + r.sales,
    }),
    { available_sak: 0, available_kg: 0, inflow: 0, vendor_purchase: 0, sales: 0 }
  );
  totals.net_mutation = totals.inflow + totals.vendor_purchase - totals.sales;

  res.json({
    from: fromIso,
    to: toIso,
    totals,
    items,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
});

router.get('/batches', async (req, res) => {
  const { from, to, machine_code, source, ice_type, size, sort } = req.query;
  const filter = {};
  if (machine_code) filter.machine_code = machine_code;
  if (source) filter.source = source;
  if (ice_type) filter.ice_type = ice_type;
  if (size) filter.size = Number(size);
  if (from || to) {
    filter.entered_at = {};
    if (from) filter.entered_at.$gte = new Date(from).toISOString();
    if (to) filter.entered_at.$lte = new Date(to).toISOString();
  }
  const sortDir = sort === 'asc' ? 1 : -1;
  const batches = await db
    .getDb()
    .collection('stock_batches')
    .find(filter)
    .sort({ entered_at: sortDir })
    .limit(500)
    .toArray();
  res.json(batches);
});

router.patch(
  '/batches/:id',
  auth.requireRole('master_admin', 'co_produksi'),
  async (req, res) => {
    const existing = await db.getDb().collection('stock_batches').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ detail: 'Batch tidak ditemukan' });

    const { ice_type, size, sacks, shift, notes, vendor_id } = req.body || {};
    const update = {};
    if (vendor_id !== undefined && vendor_id !== existing.vendor_id) {
      if (existing.source !== 'vendor_purchase') return res.status(400).json({ detail: 'Vendor hanya bisa diubah pada batch pembelian vendor' });
      const { vendor, error } = await resolveIceVendor(vendor_id);
      if (error) return res.status(400).json({ detail: error });
      update.vendor_id = vendor._id;
      update.vendor_name = vendor.company_name;
    }
    if (ice_type !== undefined) {
      if (!db.ICE_TYPES.includes(ice_type)) return res.status(400).json({ detail: 'Jenis es tidak valid' });
      update.ice_type = ice_type;
    }
    if (size !== undefined) {
      const sizeNum = Number(size);
      if (!db.SIZES.includes(sizeNum)) return res.status(400).json({ detail: 'Ukuran tidak valid' });
      update.size = sizeNum;
    }
    if (shift !== undefined) update.shift = shift;
    if (notes !== undefined) update.notes = notes;

    if (sacks !== undefined) {
      const sacksNum = Number(sacks);
      if (!sacksNum || sacksNum <= 0) return res.status(400).json({ detail: 'Jumlah sak harus lebih dari 0' });
      const alreadyConsumed = existing.sacks - existing.remaining_sacks;
      if (sacksNum < alreadyConsumed) {
        return res.status(400).json({
          detail: `Tidak bisa mengubah menjadi ${sacksNum} sak: ${alreadyConsumed} sak dari batch ini sudah terpakai`,
        });
      }
      update.sacks = sacksNum;
      update.remaining_sacks = sacksNum - alreadyConsumed;
      update.weight_kg = (size !== undefined ? Number(size) : existing.size) * sacksNum;
    }

    const result = await db
      .getDb()
      .collection('stock_batches')
      .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
    const doc = result?.value ?? result;

    await auth.audit(req, 'edit', 'stock_batch', req.params.id, update);
    emit('stock:updated', { reason: 'batch_edited', batch: doc });
    res.json(doc);
  }
);

router.post(
  '/batches',
  auth.requireRole('master_admin', 'co_produksi', 'tim_produksi'),
  async (req, res) => {
    const { machine_code, ice_type, size, sacks, repack_sacks, shift, notes } = req.body || {};
    if (!machine_code || !ice_type || !size || (!sacks && !repack_sacks)) {
      return res.status(400).json({ detail: 'Mesin, jenis es, ukuran, dan jumlah sak (panen atau repack) wajib diisi' });
    }
    if (!db.ICE_TYPES.includes(ice_type)) return res.status(400).json({ detail: 'Jenis es tidak valid' });
    const sizeNum = Number(size);
    if (!db.SIZES.includes(sizeNum)) return res.status(400).json({ detail: 'Ukuran tidak valid' });
    const sacksNum = Number(sacks) || 0;
    const repackNum = Number(repack_sacks) || 0;
    if (sacksNum < 0 || repackNum < 0) return res.status(400).json({ detail: 'Jumlah sak tidak boleh negatif' });
    if (sacksNum === 0 && repackNum === 0) return res.status(400).json({ detail: 'Jumlah sak panen atau repack harus lebih dari 0' });

    const machine = await db.getDb().collection('machines').findOne({ code: machine_code });
    if (!machine) return res.status(400).json({ detail: 'Mesin tidak ditemukan' });
    if (machine.active === false) return res.status(400).json({ detail: 'Mesin sudah nonaktif' });

    const enteredAt = new Date().toISOString();
    const code = batchCode(enteredAt);
    const created = [];
    if (sacksNum > 0) {
      const batch = {
        _id: randomUUID(),
        batch_code: code,
        machine_code,
        machine_name: machine.name,
        ice_type,
        size: sizeNum,
        sacks: sacksNum,
        remaining_sacks: sacksNum,
        weight_kg: sizeNum * sacksNum,
        shift: shift || '-',
        notes: notes || '',
        source: 'harvest',
        entered_by: req.user.id,
        entered_by_name: req.user.name,
        entered_at: enteredAt,
      };
      await db.getDb().collection('stock_batches').insertOne(batch);
      await auth.audit(req, 'create', 'stock_batch', batch._id, { batch_code: code, ice_type, size: sizeNum, sacks: sacksNum, source: 'harvest' });
      created.push(batch);
    }
    if (repackNum > 0) {
      const batch = {
        _id: randomUUID(),
        batch_code: code,
        machine_code,
        machine_name: machine.name,
        ice_type,
        size: sizeNum,
        sacks: repackNum,
        remaining_sacks: repackNum,
        weight_kg: sizeNum * repackNum,
        shift: shift || '-',
        notes: notes || '',
        source: 'repack',
        entered_by: req.user.id,
        entered_by_name: req.user.name,
        entered_at: enteredAt,
      };
      await db.getDb().collection('stock_batches').insertOne(batch);
      await auth.audit(req, 'create', 'stock_batch', batch._id, { batch_code: code, ice_type, size: sizeNum, sacks: repackNum, source: 'repack' });
      created.push(batch);
    }
    emit('stock:updated', { reason: 'batch_created', batches: created });
    res.status(201).json(created);
  }
);

router.post(
  '/adjust',
  auth.requireRole('master_admin', 'stock_keeper'),
  async (req, res) => {
    const { ice_type, size, sacks, reason, category, condition, vendor_id, price_per_sak } = req.body || {};
    if (!db.ICE_TYPES.includes(ice_type)) return res.status(400).json({ detail: 'Jenis es tidak valid' });
    const sizeNum = Number(size);
    const sacksNum = Number(sacks);
    if (!sacksNum) return res.status(400).json({ detail: 'Jumlah sak wajib diisi (boleh negatif untuk penyusutan)' });
    // Retired sizes may still be written off, never added.
    if (!db.SIZES.includes(sizeNum) && !(sacksNum < 0 && sizeNum > 0)) {
      return res.status(400).json({ detail: 'Ukuran tidak valid' });
    }

    // category distinguishes stock movements that originated directly in the
    // cold room (found during opname, repacked on the spot) and ice bought from
    // outside vendors from generic manual corrections - delivery-originated
    // returns go through /api/delivery/:id/return instead. Internal source keys
    // keep their original "cool_room" spelling so existing records still match.
    const isCoolRoomReturn = category === 'return_cool_room';
    const isVendorPurchase = category === 'vendor_purchase';
    if (isCoolRoomReturn && !['repackage', 'damaged_packaging', 'shrinkage'].includes(condition)) {
      return res.status(400).json({ detail: 'Kondisi retur wajib dipilih untuk retur langsung dari cold room' });
    }
    if (isVendorPurchase) {
      if (sacksNum <= 0) return res.status(400).json({ detail: 'Jumlah sak pembelian vendor harus lebih dari 0' });
    } else if (!reason || !reason.trim()) {
      return res.status(400).json({ detail: 'Alasan penyesuaian wajib diisi' });
    }
    let vendor = null;
    if (isVendorPurchase) {
      const resolved = await resolveIceVendor(vendor_id);
      if (resolved.error) return res.status(400).json({ detail: resolved.error });
      vendor = resolved.vendor;
    }
    let source = 'adjustment';
    if (isCoolRoomReturn) source = `return_cool_room_${condition}`;
    if (isVendorPurchase) source = 'vendor_purchase';
    const notesText = isVendorPurchase
      ? `Pembelian dari ${vendor?.company_name}${reason && reason.trim() ? ` - ${reason.trim()}` : ''}`
      : reason.trim();
    const extra = isVendorPurchase
      ? { vendor_id: vendor._id, vendor_name: vendor.company_name, price_per_sak: Number(price_per_sak) || 0 }
      : undefined;

    let batch;
    if (sacksNum > 0) {
      batch = await addStockEntry({
        ice_type,
        size: sizeNum,
        sacks: sacksNum,
        source,
        notes: notesText,
        entered_by: req.user.id,
        entered_by_name: req.user.name,
        idPrefix: isVendorPurchase ? 'VND' : 'ADJ',
        extra,
      });
    } else {
      const available = await getAvailableStock(ice_type, sizeNum);
      const shortage = Math.abs(sacksNum);
      if (shortage > available) {
        return res.status(400).json({
          detail: `Stok tidak cukup untuk dikurangi: tersedia ${available} sak, diminta pengurangan ${shortage} sak`,
        });
      }
      await consumeStockFIFO(ice_type, sizeNum, shortage);
      batch = { ice_type, size: sizeNum, sacks: sacksNum, source, notes: notesText };
      emit('stock:updated', { reason: 'stock_entry_adjustment', batch });
    }

    await auth.audit(req, 'adjust', 'stock', `${ice_type}-${sizeNum}`, {
      sacks: sacksNum, reason: notesText, category, condition, vendor_name: extra?.vendor_name,
    });
    res.status(201).json(batch);
  }
);

module.exports = router;
module.exports.computeStockSummary = computeStockSummary;
module.exports.getAvailableStock = getAvailableStock;
module.exports.consumeStockFIFO = consumeStockFIFO;
module.exports.addStockEntry = addStockEntry;
