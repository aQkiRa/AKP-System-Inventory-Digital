const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/', async (req, res) => {
  const settings = await db.getDb().collection('settings').findOne({ _id: 'global' });
  res.json(settings);
});

router.patch('/', auth.requireRole('master_admin'), async (req, res) => {
  const { daily_target_kg, company_name, company_address, company_phone } = req.body || {};
  const update = { updated_at: new Date().toISOString() };
  if (daily_target_kg !== undefined) update.daily_target_kg = Number(daily_target_kg);
  if (company_name !== undefined) update.company_name = company_name;
  if (company_address !== undefined) update.company_address = company_address;
  if (company_phone !== undefined) update.company_phone = company_phone;

  const result = await db
    .getDb()
    .collection('settings')
    .findOneAndUpdate({ _id: 'global' }, { $set: update }, { returnDocument: 'after' });
  await auth.audit(req, 'update', 'settings', 'global', update);
  res.json(result?.value ?? result);
});

module.exports = router;
