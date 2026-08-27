const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/summary', async (req, res) => {
  const database = db.getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  const [todayBatches, todayOrders, pendingCount, inTransitCount, deliveredTodayCount, demandOrders, settings, machines] = await Promise.all([
    database.collection('stock_batches').find({ entered_at: { $gte: startIso } }).toArray(),
    database.collection('delivery_orders').find({ created_at: { $gte: startIso } }).toArray(),
    database.collection('delivery_orders').countDocuments({ status: 'pending' }),
    database.collection('delivery_orders').countDocuments({ status: 'in_transit' }),
    database.collection('delivery_orders').countDocuments({ status: 'delivered', delivered_at: { $gte: startIso } }),
    database.collection('delivery_orders').find({ status: { $in: ['pending', 'in_transit'] } }).toArray(),
    database.collection('settings').findOne({ _id: 'global' }),
    database.collection('machines').find({ active: true }).toArray(),
  ]);

  const today_production_kg = todayBatches.reduce((sum, b) => sum + b.weight_kg, 0);
  const customer_demand_kg = demandOrders.reduce((sum, o) => sum + o.total_weight_kg, 0);
  const perMachine = machines.map((m) => {
    const machineBatches = todayBatches.filter((b) => b.machine_code === m.code);
    const harvestCountToday = machineBatches.length;
    const sacksToday = machineBatches.reduce((s, b) => s + b.sacks, 0);
    return {
      code: m.code,
      name: m.name,
      kg_today: machineBatches.reduce((s, b) => s + b.weight_kg, 0),
      sacks_today: sacksToday,
      harvest_count_today: harvestCountToday,
      avg_sacks_per_harvest_today: harvestCountToday > 0 ? Math.round(sacksToday / harvestCountToday) : 0,
    };
  });

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
    machines: perMachine,
    ritase_per_user,
  });
});

module.exports = router;
