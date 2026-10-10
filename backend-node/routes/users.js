const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/drivers', async (req, res) => {
  const drivers = await db
    .getDb()
    .collection('users')
    .find({ role: { $in: ['driver', 'co_driver'] }, active: true })
    .sort({ name: 1 })
    .toArray();
  res.json(drivers.map((d) => ({ id: d._id, name: d.name, role: d.role })));
});

router.use(auth.requireRole('master_admin'));

function toSafe(u) {
  return {
    id: u._id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    role_label: auth.ROLE_LABELS[u.role],
    active: u.active,
    created_at: u.created_at,
  };
}

router.get('/', async (req, res) => {
  const users = await db.getDb().collection('users').find({}).sort({ created_at: 1 }).toArray();
  res.json(users.map(toSafe));
});

router.post('/', async (req, res) => {
  const { username, email, name, role, password } = req.body || {};
  if (!username || !email || !name || !role || !password) {
    return res.status(400).json({ detail: 'Semua field wajib diisi' });
  }
  if (!auth.ROLES.includes(role)) {
    return res.status(400).json({ detail: 'Role tidak valid' });
  }
  if (!auth.isPasswordValid(password)) {
    return res.status(400).json({ detail: auth.PASSWORD_POLICY_MESSAGE });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const existing = await db.getDb().collection('users').findOne({ $or: [{ username }, { email: cleanEmail }] });
  if (existing) return res.status(409).json({ detail: 'Username atau email sudah digunakan' });

  const user = {
    _id: randomUUID(),
    username,
    email: cleanEmail,
    name,
    role,
    password_hash: auth.hashPassword(password),
    active: true,
    created_at: new Date().toISOString(),
  };
  await db.getDb().collection('users').insertOne(user);
  await auth.audit(req, 'create', 'user', user._id, { username, email: cleanEmail, role });
  res.status(201).json(toSafe(user));
});

router.patch('/:id', async (req, res) => {
  // email is intentionally not accepted here: it's immutable once set
  const { name, role, active, password } = req.body || {};
  const update = {};
  if (name !== undefined) update.name = name;
  if (role !== undefined) {
    if (!auth.ROLES.includes(role)) return res.status(400).json({ detail: 'Role tidak valid' });
    update.role = role;
  }
  if (active !== undefined) update.active = !!active;
  if (password) {
    if (!auth.isPasswordValid(password)) return res.status(400).json({ detail: auth.PASSWORD_POLICY_MESSAGE });
    update.password_hash = auth.hashPassword(password);
  }

  const result = await db
    .getDb()
    .collection('users')
    .findOneAndUpdate({ _id: req.params.id }, { $set: update }, { returnDocument: 'after' });
  const doc = result?.value ?? result;
  if (!doc) return res.status(404).json({ detail: 'User tidak ditemukan' });
  await auth.audit(req, 'update', 'user', req.params.id, update);
  res.json(toSafe(doc));
});

router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ detail: 'Tidak bisa menonaktifkan akun sendiri' });
  }
  const result = await db
    .getDb()
    .collection('users')
    .findOneAndUpdate({ _id: req.params.id }, { $set: { active: false } }, { returnDocument: 'after' });
  const doc = result?.value ?? result;
  if (!doc) return res.status(404).json({ detail: 'User tidak ditemukan' });
  await auth.audit(req, 'deactivate', 'user', req.params.id, {});
  res.json(toSafe(doc));
});

module.exports = router;
