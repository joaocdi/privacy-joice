const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
process.env.DATABASE_PATH = path.resolve(__dirname, '..', '.test-runs', crypto.randomUUID() + '.sqlite');
async function main() {
  const legacy = await open({ filename: process.env.DATABASE_PATH, driver: sqlite3.Database });
  const oldSchema = fs.readFileSync(path.resolve(__dirname, '..', 'db/schema.sql'), 'utf8')
    .replace(/^  (checkout_hash|pix_qr_code|webhook_token_hash|access_days|access_type).*\r?\n/gm, '');
  await legacy.exec(oldSchema);
  await legacy.exec(`INSERT INTO orders (public_id,product_id,amount,status,paid_at) VALUES ('legacy','monthly',9.9,'PAID',CURRENT_TIMESTAMP);
    INSERT INTO entitlements (order_id,product_id,status) VALUES (1,'monthly','ACTIVE');
    INSERT INTO entitlements (order_id,product_id,status) VALUES (1,'monthly','EXPIRED');`);
  await legacy.close();
  const { initDb, closeDb } = require('../db/database');
  const db = await initDb();
  assert.equal((await db.get('SELECT COUNT(*) n FROM entitlements')).n,1);
  assert.equal((await db.get('SELECT COUNT(*) n FROM entitlement_duplicates_archive')).n,1);
  assert.equal((await db.get('SELECT status FROM entitlements')).status,'ACTIVE');
  await initDb();
  assert.equal((await db.get('SELECT COUNT(*) n FROM entitlement_duplicates_archive')).n,1);
  await assert.rejects(db.run("INSERT INTO entitlements(order_id,product_id) VALUES(1,'monthly')"));
  await closeDb();
  console.log('PASS: legacy migration preserves active grant and archives expired duplicate, repeat safe');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
