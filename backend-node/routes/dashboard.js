const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

function dayKey(iso) {
  return iso.slice(0, 10);
}

function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

router.get('/summary', async (req, res) => {
  const database = db.getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();
  const sevenDaysAgoIso = last7Days()[0] + 'T00:00:00.000Z';

  const [
    todayBatches,
    todayOrders,
    pendingCount,
    inTransitCount,
    deliveredTodayCount,
    demandOrders,
    settings,
    machines,
    weekBatches,
    weekDelivered,
    weekReserved,
    weekDamaged,
    fleetToday,
  ] = await Promise.all([
    database.collection('stock_batches').find({ entered_at: { $gte: startIso } }).toArray(),
    database.collection('delivery_orders').find({ created_at: { $gte: startIso } }).toArray(),
    database.collection('delivery_orders').countDocuments({ status: 'pending' }),
    database.collection('delivery_orders').countDocuments({ status: 'in_transit' }),
    database.collection('delivery_orders').countDocuments({ status: 'delivered', delivered_at: { $gte: startIso } }),
    database.collection('delivery_orders').find({ status: { $in: ['pending', 'in_transit'] } }).toArray(),
    database.collection('settings').findOne({ _id: 'global' }),
    database.collection('machines').find({ active: true }).toArray(),
    database.collection('stock_batches').find({ entered_at: { $gte: sevenDaysAgoIso } }).toArray(),
    database.collection('delivery_orders').find({ status: 'delivered', delivered_at: { $gte: sevenDaysAgoIso } }).toArray(),
    database.collection('delivery_orders').find({ status: { $in: ['pending', 'in_transit'] } }).toArray(),
    database.collection('delivery_orders').find({ status: 'returned', return_condition: { $in: ['damaged_packaging', 'shrinkage'] } }).toArray(),
    database.collection('delivery_orders').find({ dispatch_at: { $gte: startIso, $lt: new Date(startOfDay.getTime() + 86400000).toISOString() } }).toArray(),
  ]);

  const today_production_kg = todayBatches.reduce((sum, b) => sum + b.weight_kg, 0);
  const customer_demand_kg = demandOrders.reduce((sum, o) => sum + o.total_weight_kg, 0);

  const perMachine = machines.map((m) => {
    const machineBatches = todayBatches.filter((b) => b.machine_code === m.code);
    const harvestCountToday = machineBatches.length;
    const sacksToday = machineBatches.reduce((s, b) => s + b.sacks, 0);
    let downtime_hours_today = 0;
    if (m.status === 'maintenance' && m.status_changed_at) {
      const since = Math.max(new Date(m.status_changed_at).getTime(), startOfDay.getTime());
      downtime_hours_today = Math.round(((Date.now() - since) / 3600000) * 10) / 10;
    }
    return {
      code: m.code,
      name: m.name,
      status: m.status || 'running',
      downtime_hours_today,
      kg_today: machineBatches.reduce((s, b) => s + b.weight_kg, 0),
      sacks_today: sacksToday,
      harvest_count_today: harvestCountToday,
      avg_sacks_per_harvest_today: harvestCountToday > 0 ? Math.round(sacksToday / harvestCountToday) : 0,
    };
  });

  const breakdownMap = new Map();
  for (const b of todayBatches) {
    const k = `${b.ice_type}-${b.size}`;
    if (!breakdownMap.has(k)) breakdownMap.set(k, { ice_type: b.ice_type, size: b.size, sacks: 0, kg: 0 });
    const entry = breakdownMap.get(k);
    entry.sacks += b.sacks;
    entry.kg += b.weight_kg;
  }
  const production_today_breakdown = [...breakdownMap.values()].sort((a, b) =>
    a.ice_type === b.ice_type ? a.size - b.size : a.ice_type.localeCompare(b.ice_type)
  );

  const ritaseMap = new Map();
  for (const order of todayOrders) {
    const key = order.created_by;
    if (!ritaseMap.has(key)) {
      ritaseMap.set(key, { user_id: order.created_by, user_name: order.created_by_name, count: 0, total_weight_kg: 0 });
    }
    const entry = ritaseMap.get(key);
    entry.count += 1;
    entry.total_weight_kg += order.total_weight_kg;
  }
  const ritase_per_user = [...ritaseMap.values()].sort((a, b) => b.count - a.count);

  // Hourly production for today (0-23)
  const hourly_production = Array.from({ length: 24 }, (_, hour) => ({ hour, sacks: 0 }));
  for (const b of todayBatches) {
    const hour = new Date(b.entered_at).getHours();
    hourly_production[hour].sacks += b.sacks;
  }

  // Today's delivery status breakdown (orders dispatched today)
  const statusBuckets = { pending: 0, in_transit: 0, delivered: 0, returned: 0, cancelled: 0 };
  const statusWeight = { pending: 0, in_transit: 0, delivered: 0, returned: 0, cancelled: 0 };
  for (const o of fleetToday) {
    if (statusBuckets[o.status] === undefined) continue;
    statusBuckets[o.status] += o.items.reduce((s, i) => s + i.qty, 0);
    statusWeight[o.status] += o.total_weight_kg;
  }
  const delivery_status_today = Object.keys(statusBuckets).map((status) => ({
    status,
    sacks: statusBuckets[status],
    weight_kg: statusWeight[status],
  }));

  // 7-day trend: produced / delivered / running "stok akhir" balance
  const days = last7Days();
  const producedByDay = new Map(days.map((d) => [d, 0]));
  for (const b of weekBatches) {
    const k = dayKey(b.entered_at);
    if (producedByDay.has(k)) producedByDay.set(k, producedByDay.get(k) + b.sacks);
  }
  const deliveredByDay = new Map(days.map((d) => [d, 0]));
  for (const o of weekDelivered) {
    const k = dayKey(o.delivered_at);
    if (deliveredByDay.has(k)) {
      deliveredByDay.set(k, deliveredByDay.get(k) + o.items.reduce((s, i) => s + i.qty, 0));
    }
  }
  const reservedCumulativeByDay = new Map(days.map((d) => [d, 0]));
  for (const o of weekReserved) {
    const k = dayKey(o.created_at);
    const qty = o.items.reduce((s, i) => s + i.qty, 0);
    for (const d of days) {
      if (d >= k) reservedCumulativeByDay.set(d, reservedCumulativeByDay.get(d) + qty);
    }
  }
  const damagedCumulativeByDay = new Map(days.map((d) => [d, 0]));
  for (const o of weekDamaged) {
    const k = dayKey(o.returned_at || o.created_at);
    const qty = o.items.reduce((s, i) => s + i.qty, 0);
    for (const d of days) {
      if (d >= k) damagedCumulativeByDay.set(d, damagedCumulativeByDay.get(d) + qty);
    }
  }

  let cumulativeProduced = 0;
  let cumulativeDelivered = 0;
  const weekly_trend = days.map((d) => {
    cumulativeProduced += producedByDay.get(d);
    cumulativeDelivered += deliveredByDay.get(d);
    const stok_akhir = Math.max(
      0,
      cumulativeProduced - cumulativeDelivered - reservedCumulativeByDay.get(d) - damagedCumulativeByDay.get(d)
    );
    return {
      date: d,
      produced_sacks: producedByDay.get(d),
      delivered_sacks: deliveredByDay.get(d),
      stok_akhir_sacks: stok_akhir,
    };
  });

  const fleet = fleetToday
    .filter((o) => ['pending', 'in_transit', 'delivered', 'returned'].includes(o.status))
    .map((o) => ({
      sj_no: o.sj_no,
      driver_name: o.driver_name,
      customer_name: o.customer_name,
      sacks: o.items.reduce((s, i) => s + i.qty, 0),
      dispatch_at: o.dispatch_at,
      expected_arrival_at: o.expected_arrival_at,
      status: o.status,
    }))
    .sort((a, b) => new Date(a.dispatch_at) - new Date(b.dispatch_at));

  res.json({
    today_production_kg,
    daily_target_kg: settings ? settings.daily_target_kg : 0,
    target_progress_pct: settings && settings.daily_target_kg
      ? Math.min(100, Math.round((today_production_kg / settings.daily_target_kg) * 100))
      : 0,
    pending_deliveries: pendingCount,
    in_transit_deliveries: inTransitCount,
    delivered_today: deliveredTodayCount,
    customer_demand_kg,
    production_today_breakdown,
    machines: perMachine,
    ritase_per_user,
    hourly_production,
    delivery_status_today,
    weekly_trend,
    fleet,
  });
});

module.exports = router;
