const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth, auth.requireRole('master_admin', 'management'));

router.get('/', async (req, res) => {
  const { entity, username, from, to } = req.query;
  const filter = {};
  if (entity) filter.entity = entity;
  if (username) filter.username = username;
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from).toISOString();
    if (to) filter.at.$lte = new Date(to).toISOString();
  }
  const logs = await db.getDb().collection('audit_logs').find(filter).sort({ at: -1 }).limit(300).toArray();
  res.json(logs);
});

module.exports = router;
