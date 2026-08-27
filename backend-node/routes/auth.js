const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: 'Username dan password wajib diisi' });
  }

  const user = await db.getDb().collection('users').findOne({ username });
  if (!user || !user.active || !auth.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ detail: 'Username atau password salah' });
  }

  const token = auth.signToken(user);
  const safeUser = {
    id: user._id,
    username: user.username,
    name: user.name,
    role: user.role,
    role_label: auth.ROLE_LABELS[user.role],
  };
  res.json({ token, user: safeUser });
});

router.get('/me', auth.requireAuth, (req, res) => {
  res.json({ user: { ...req.user, role_label: auth.ROLE_LABELS[req.user.role] } });
});

router.get('/roles', auth.requireAuth, (req, res) => {
  res.json({ roles: auth.ROLES.map((r) => ({ value: r, label: auth.ROLE_LABELS[r] })) });
});

router.patch('/me', auth.requireAuth, async (req, res) => {
  const { name, username } = req.body || {};
  const update = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ detail: 'Nama tidak boleh kosong' });
    update.name = name.trim();
  }
  if (username !== undefined) {
    if (!username.trim()) return res.status(400).json({ detail: 'Username tidak boleh kosong' });
    const existing = await db.getDb().collection('users').findOne({ username: username.trim(), _id: { $ne: req.user.id } });
    if (existing) return res.status(409).json({ detail: 'Username sudah digunakan' });
    update.username = username.trim();
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ detail: 'Tidak ada perubahan' });

  const result = await db
    .getDb()
    .collection('users')
    .findOneAndUpdate({ _id: req.user.id }, { $set: update }, { returnDocument: 'after' });
  const doc = result.value || result;
  await auth.audit(req, 'update_profile', 'user', req.user.id, update);
  res.json({
    user: {
      id: doc._id,
      username: doc.username,
      name: doc.name,
      role: doc.role,
      role_label: auth.ROLE_LABELS[doc.role],
    },
  });
});

router.post('/change-password', auth.requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ detail: 'Password lama dan password baru wajib diisi' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ detail: 'Password baru minimal 6 karakter' });
  }
  const user = await db.getDb().collection('users').findOne({ _id: req.user.id });
  if (!auth.verifyPassword(old_password, user.password_hash)) {
    return res.status(401).json({ detail: 'Password lama salah' });
  }
  await db
    .getDb()
    .collection('users')
    .updateOne({ _id: req.user.id }, { $set: { password_hash: auth.hashPassword(new_password) } });
  await auth.audit(req, 'change_password', 'user', req.user.id, {});
  res.json({ ok: true });
});

module.exports = router;
