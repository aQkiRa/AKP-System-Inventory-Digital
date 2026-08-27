const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

let client = null;
let db = null;

const ICE_TYPES = ['Tube', 'Serut'];
const SIZES = [5, 10, 15, 20];
const MACHINES = [
  { code: 'MESIN-1', name: 'Mesin 1', avg_sacks_per_harvest: 120 },
  { code: 'MESIN-2', name: 'Mesin 2', avg_sacks_per_harvest: 120 },
];

const DEMO_USERS = [
  { username: 'admin', name: 'Master Admin', role: 'master_admin' },
  { username: 'owner', name: 'Owner', role: 'management' },
  { username: 'coproduksi', name: 'Co. Produksi', role: 'co_produksi' },
  { username: 'produksi', name: 'Tim Produksi 1', role: 'tim_produksi' },
  { username: 'codriver', name: 'Co. Driver', role: 'co_driver' },
  { username: 'driver', name: 'Driver 1', role: 'driver' },
  { username: 'stockkeeper', name: 'Stock Keeper 1', role: 'stock_keeper' },
  { username: 'marketing', name: 'Marketing 1', role: 'marketing' },
];

async function connect() {
  client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  db = client.db(process.env.DB_NAME);
  await seed();
  return db;
}

function getDb() {
  return db;
}

async function seed() {
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('stock_batches').createIndex({ entered_at: 1 });
  await db.collection('delivery_orders').createIndex({ sj_no: 1 }, { unique: true });

  for (const m of MACHINES) {
    await db.collection('machines').updateOne(
      { code: m.code },
      { $setOnInsert: { _id: randomUUID(), ...m, active: true } },
      { upsert: true }
    );
  }

  const adminPass = process.env.ADMIN_PASSWORD;
  const demoPass = process.env.DEMO_PASSWORD;
  for (const u of DEMO_USERS) {
    const plain = u.username === 'admin' ? adminPass : demoPass;
    const existing = await db.collection('users').findOne({ username: u.username });
    if (!existing) {
      await db.collection('users').insertOne({
        _id: randomUUID(),
        ...u,
        password_hash: bcrypt.hashSync(plain, 10),
        active: true,
        created_at: new Date().toISOString(),
      });
    } else if (!bcrypt.compareSync(plain, existing.password_hash)) {
      await db
        .collection('users')
        .updateOne({ username: u.username }, { $set: { password_hash: bcrypt.hashSync(plain, 10) } });
    }
  }

  await db.collection('settings').updateOne(
    { _id: 'global' },
    {
      $setOnInsert: {
        daily_target_kg: 20000,
        company_name: 'CV ARTHALAYA KARYA PARAMA',
        company_address: 'Jl. Terusan Mabes Hankam Rt.001 Rw.03 No.6, Kel. Setu, Kec. Cipayung - Jakarta Timur 13880',
        company_phone: '',
        updated_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  const settings = await db.collection('settings').findOne({ _id: 'global' });
  if (settings && settings.daily_target_kg == null) {
    await db.collection('settings').updateOne(
      { _id: 'global' },
      { $set: { daily_target_kg: (settings.daily_target_ton || 20) * 1000 }, $unset: { daily_target_ton: '' } }
    );
  }
  if (settings && settings.company_name === 'PT ES KRISTAL NUSANTARA') {
    await db.collection('settings').updateOne(
      { _id: 'global' },
      {
        $set: {
          company_name: 'CV ARTHALAYA KARYA PARAMA',
          company_address: 'Jl. Terusan Mabes Hankam Rt.001 Rw.03 No.6, Kel. Setu, Kec. Cipayung - Jakarta Timur 13880',
          company_phone: '',
        },
      }
    );
  }

  const custCount = await db.collection('customers').countDocuments();
  if (custCount === 0) {
    await db.collection('customers').insertMany([
      { _id: randomUUID(), name: 'Toko Segar Jaya', phone: '08123456789', address: 'Pasar Induk Blok A-12', active: true },
      { _id: randomUUID(), name: 'Restoran Bahari', phone: '08561234567', address: 'Jl. Pantai Indah No. 8', active: true },
      { _id: randomUUID(), name: 'CV Mina Laut', phone: '08991234567', address: 'Pelabuhan Perikanan Gudang 3', active: true },
    ]);
  }
}

async function nextSjNo() {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const counterId = `sj_${ymd}`;
  const result = await db
    .collection('counters')
    .findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
  const seq = result.value ? result.value.seq : result.seq;
  return `SJ-${ymd}-${String(seq).padStart(4, '0')}`;
}

module.exports = { connect, getDb, nextSjNo, ICE_TYPES, SIZES, MACHINES, DEMO_USERS };
