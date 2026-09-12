const { getDb, transaction } = require('../db/database');
const products = require('../products');

async function insertEntitlement(db, order) {
  if (order.status !== 'PAID') throw new Error('Order must be paid');
  const days = order.access_days || products[order.product_id]?.accessDays || null;
  await db.run(`INSERT INTO entitlements (order_id, product_id, starts_at, expires_at, status)
    VALUES (?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime(?, ?) END, 'ACTIVE')
    ON CONFLICT(order_id) DO NOTHING`,
    // Acesso vitalício (produto avulso) não tem intervalo: mandamos NULL em vez
    // de montar "+null days". O SQLite nem avaliava esse ramo do CASE; o
    // Postgres converte o parâmetro antes e recusaria a cobrança.
    order.id, order.product_id, order.paid_at, days, order.paid_at, days ? '+' + days + ' days' : null);
  return db.get('SELECT * FROM entitlements WHERE order_id=?', order.id);
}
async function createOrUpdateEntitlement(orderId, productId) {
  return transaction(async db => {
    const order = await db.get('SELECT * FROM orders WHERE id=?', orderId);
    if (!order || order.product_id !== productId) throw new Error('Order mismatch');
    return insertEntitlement(db, order);
  });
}
async function confirmPayment(publicId) {
  return transaction(async db => {
    let order = await db.get('SELECT * FROM orders WHERE public_id=?', publicId);
    if (!order || !order.provider_payment_id) throw new Error('Payment not persisted');
    if (!['PENDING','EXPIRED','PAID'].includes(order.status)) throw new Error('Invalid transition');
    await db.run("UPDATE orders SET status='PAID', paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=?", order.id);
    order = await db.get('SELECT * FROM orders WHERE id=?', order.id);
    return insertEntitlement(db, order);
  });
}

async function getActiveEntitlementByTelegramUserId(telegramUserId) {
    const db = await getDb();
    return db.get(`
        SELECT * FROM entitlements 
        WHERE telegram_user_id = ? 
        AND status = 'ACTIVE' 
        AND expires_at > CURRENT_TIMESTAMP
        ORDER BY expires_at DESC LIMIT 1
    `, [telegramUserId]);
}

async function linkEntitlementToTelegram(entitlementId, telegramUserId) {
  const db = await getDb();
  await db.run(
    `UPDATE entitlements SET telegram_user_id = ? WHERE id = ?`,
    [telegramUserId, entitlementId]
  );
}

async function getExpiredEntitlements() {
  const db = await getDb();
  return db.all(`SELECT * FROM entitlements WHERE status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP`);
}

async function expireEntitlement(id) {
  const db = await getDb();
  await db.run(`UPDATE entitlements SET status = 'EXPIRED' WHERE id = ?`, [id]);
}

module.exports = {
  createOrUpdateEntitlement,
  confirmPayment,
  getActiveEntitlementByTelegramUserId,
  linkEntitlementToTelegram,
  getExpiredEntitlements,
  expireEntitlement
};
