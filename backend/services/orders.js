const crypto = require('crypto');
const { getDb, transaction } = require('../db/database');
const { hash } = require('./security');

/**
 * Guarda o contato do comprador, sem guardar o documento inteiro.
 *
 * Nome, e-mail e telefone ficam porque são como você fala com o cliente depois
 * da compra (o telefone é o mesmo que vai alimentar o WhatsApp e a automação).
 * O CPF/CNPJ vira hash + 3 últimos dígitos: dá para conferir um pagamento com a
 * SigiloPay e atender no suporte, sem manter uma base de CPF em texto puro.
 */
function customerColumns(client) {
  if (!client) return { name: null, email: null, phone: null, documentHash: null, documentLast3: null };
  const digits = String(client.document || '').replace(/\D/g, '');
  return {
    name: typeof client.name === 'string' ? client.name.trim().slice(0, 150) : null,
    email: typeof client.email === 'string' ? client.email.trim().toLowerCase().slice(0, 254) : null,
    phone: typeof client.phone === 'string' ? client.phone.replace(/\D/g, '').slice(0, 15) || null : null,
    documentHash: digits ? hash(digits) : null,
    documentLast3: digits ? digits.slice(-3) : null
  };
}

async function createOrder(product, checkoutToken, provider, client = null) {
  return transaction(async db => {
    const checkoutHash = hash(checkoutToken);
    const existing = await db.get('SELECT * FROM orders WHERE checkout_hash = ?', checkoutHash);
    if (existing) {
      if (existing.product_id !== product.id) throw Object.assign(new Error('Checkout já pertence a outro produto.'), { status: 409 });
      return { ...existing, fresh: false };
    }
    const id = 'ord_' + crypto.randomBytes(24).toString('hex');
    // ON CONFLICT: no SQLite o BEGIN IMMEDIATE serializa as escritas, mas o
    // Postgres deixa duas requisições concorrentes chegarem aqui juntas — sem
    // isto, o duplo clique virava violação de índice e um 502 na cara do
    // cliente. Quem perde a corrida apenas reaproveita o pedido do outro.
    const customer = customerColumns(client);
    const inserted = await db.run("INSERT INTO orders (public_id, product_id, amount, status, payment_provider, checkout_hash, access_days, access_type, customer_name, customer_email, customer_phone, customer_document_hash, customer_document_last3, expires_at) VALUES (?, ?, ?, 'CREATING', ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ?='mock' THEN datetime('now', '+30 minutes') ELSE NULL END) ON CONFLICT(checkout_hash) DO NOTHING",
      id, product.id, product.price, provider, checkoutHash, product.accessDays || null, product.type === 'one_time' ? 'whatsapp' : 'vip',
      customer.name, customer.email, customer.phone, customer.documentHash, customer.documentLast3, provider);
    if (!inserted.changes) {
      const raced = await db.get('SELECT * FROM orders WHERE checkout_hash = ?', checkoutHash);
      if (!raced) throw new Error('Checkout não persistido.');
      if (raced.product_id !== product.id) throw Object.assign(new Error('Checkout já pertence a outro produto.'), { status: 409 });
      return { ...raced, fresh: false };
    }
    return { ...await db.get('SELECT * FROM orders WHERE public_id = ?', id), fresh: true };
  });
}
async function getOrderByPublicId(id) { return (await getDb()).get('SELECT * FROM orders WHERE public_id = ?', id); }
async function updateOrderPayment(id, payment) {
  await (await getDb()).run("UPDATE orders SET status='PENDING', provider_payment_id=?, pix_copy_paste=?, pix_qr_code=?, webhook_token_hash=? WHERE public_id=? AND status='CREATING'",
    payment.providerPaymentId, payment.pix.copyPaste, payment.pix.qrCode, hash(payment.webhookToken), id);
}
async function updateOrderStatus(id, status) {
  if (!['FAILED', 'EXPIRED', 'CANCELED'].includes(status)) throw new Error('Use confirmPayment for approval');
  await (await getDb()).run("UPDATE orders SET status=? WHERE public_id=? AND status IN ('CREATING','PENDING')", status, id);
}
module.exports = { createOrder, getOrderByPublicId, updateOrderPayment, updateOrderStatus };
