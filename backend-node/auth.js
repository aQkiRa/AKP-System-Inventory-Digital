const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { getDb } = require('./db');

const ROLES = [
  'master_admin',
  'management',
  'co_produksi',
  'tim_produksi',
  'co_driver',
  'driver',
  'stock_keeper',
  'marketing',
];

const ROLE_LABELS = {
  master_admin: 'Master Admin',
  management: 'Owner / Management',
  co_produksi: 'Co. Produksi',
  tim_produksi: 'Tim Produksi',
  co_driver: 'Co. Driver',
  driver: 'Driver',
  stock_keeper: 'Stock Keeper',
  marketing: 'Marketing',
};

const hashPassword = (p) => bcrypt.hashSync(p, 10);
const verifyPassword = (p, h) => bcrypt.compareSync(p, h);

function signToken(user) {
  return jwt.sign(
    { sub: user._id, username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ detail: 'Belum login' });
  try {
    const payload = verifyToken(token);
    const user = await getDb().collection('users').findOne({ _id: payload.sub });
    if (!user || !user.active) return res.status(401).json({ detail: 'User tidak aktif' });
    req.user = { id: user._id, username: user.username, name: user.name, role: user.role };
    next();
  } catch (e) {
    return res.status(401).json({ detail: 'Sesi berakhir, silakan login ulang' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ detail: 'Belum login' });
    if (req.user.role === 'master_admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ detail: 'Akses ditolak untuk role Anda' });
  };
}

async function audit(req, action, entity, entityId, detail = {}) {
  await getDb().collection('audit_logs').insertOne({
    _id: randomUUID(),
    action,
    entity,
    entity_id: entityId,
    detail,
    user_id: req.user ? req.user.id : null,
    username: req.user ? req.user.username : 'anonymous',
    ip: req.headers['x-forwarded-for'] || req.ip,
    at: new Date().toISOString(),
  });
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  requireAuth,
  requireRole,
  audit,
};
