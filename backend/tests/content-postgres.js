// PostgreSQL engine in WASM: exercises the production adapter/schema without
// credentials, a remote server, or modifying any production database.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { PGlite } = require('@electric-sql/pglite');
const engine = new PGlite();
class TestPool {
  on() {}
  async query(sql, values = []) {
    const result = values.length ? await engine.query(sql, values) : (await engine.exec(sql)).at(-1);
    const rows = (result?.rows || []).map(row => Object.fromEntries(Object.entries(row).map(([key,value]) =>
      [key, value instanceof Date ? value.toISOString().replace('T',' ').slice(0,19) : typeof value === 'bigint' ? Number(value) : value])));
    return { rows, rowCount: result?.affectedRows ?? rows.length };
  }
  async connect() { return { query: this.query.bind(this), release() {} }; }
  async end() {}
}
Object.defineProperty(require('pg'), 'Pool', { value: TestPool });
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.NODE_ENV = 'test';
// In-memory PostgreSQL only; the Pool below is replaced before the driver loads.
process.env.TEST_DATABASE_SCHEMA = 'test_0000';
process.env.VIP_MEDIA_DRIVER = 'supabase';
process.env.ADMIN_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');
const dbService = require('../db/database');
const posts = require('../services/vip-posts');
const auth = require('../services/admin-auth');
async function main() {
  assert.equal(dbService.driver, 'postgres');
  await dbService.initDb(); await dbService.initDb();
  const db = await dbService.getDb();
  process.env.VIP_MEDIA_SECRET = crypto.randomBytes(32).toString('hex');
  await require('./buyer-recovery')(db);
  await require('./grant-scope')();
  await require('./profile-contract')(db);
  const now = Date.now();
  await db.run("INSERT INTO orders(public_id,product_id,amount) VALUES ('pg-cms-order','monthly',9.9)");
  const order = await db.get("SELECT * FROM orders WHERE public_id='pg-cms-order'");
  await db.run("INSERT INTO vip_uploads(id,session_id,media_path,mime_type,type,size_bytes,complete,expires_at) VALUES ('asset','session','joice/test.png','image/png','image',100,1,?)", now + 100000);
  let post = await posts.save(null, { caption: 'Postgres caption', sort_order: 20, published: true, uploadId: 'asset' }, 'session');
  await posts.setSource('managed');
  assert.equal((await posts.feed(order.id))[0].likes, 0);
  assert.equal((await posts.feed(order.id))[0].liked, false, 'Postgres COUNT zero is not liked');
  await posts.like(post.id, order.id, true); await posts.like(post.id, order.id, true);
  assert.equal((await posts.feed(order.id))[0].liked, true);
  assert.equal((await posts.feed(order.id))[0].likes, 1);
  await posts.like(post.id, order.id, false);
  assert.equal((await posts.feed(order.id))[0].likes, 0);
  await db.run('UPDATE vip_posts SET likes_count=318 WHERE id=?', post.id);
  assert.equal((await posts.like(post.id, order.id, true)).likes, 319);
  assert.equal((await posts.like(post.id, order.id, true)).likes, 319);
  assert.equal((await posts.feed(order.id))[0].likes, 319);
  assert.equal((await posts.like(post.id, order.id, false)).likes, 318);
  assert.equal((await posts.like(post.id, order.id, false)).likes, 318);
  assert.equal((await posts.feed(order.id))[0].liked, false);
  post = await posts.save(post.id, { caption: 'Edited', sort_order: -1, published: false, version: post.version }, 'session');
  assert.equal((await posts.feed(order.id)).length, 0);
  await posts.archive(post.id, true, post.version);
  const archived = (await posts.list())[0]; assert.equal(archived.archived, 1);
  await posts.archive(post.id, false, archived.version);
  assert.equal((await posts.list())[0].published, 0);
  const imported = await posts.migrate(); assert.ok(imported > 0); assert.equal(await posts.migrate(), 0);
  // Prévia da HOME no motor de produção, incluindo a migração aditiva.
  const derivative = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x50, 0x00, 0x40, 0x03]), Buffer.alloc(9), Buffer.from([0xFF, 0xD9])]).toString('base64');
  post = await posts.save(post.id, { caption: 'Prévia', sort_order: 0, published: true, show_as_preview: true, preview_image: derivative, version: (await posts.list()).find(p => p.id === post.id).version }, 'session');
  const previews = await posts.homePreviews();
  assert.equal(previews.length, 1);
  assert.equal(previews[0].preview, 'data:image/jpeg;base64,' + derivative);
  assert.ok(!JSON.stringify(previews).includes('joice/test.png'));
  await assert.rejects(posts.save(post.id, { caption: 'x', sort_order: 0, published: true, show_as_preview: true, preview_image: 'nao-e-jpeg', version: post.version }));
  await posts.archive(post.id, true, post.version);
  assert.equal((await posts.homePreviews()).length, 0);
  // Banco criado antes deste recurso: as colunas voltam sem perder as linhas.
  await engine.exec('ALTER TABLE vip_posts DROP COLUMN show_as_preview, DROP COLUMN preview_image');
  const survivors = (await engine.query('SELECT COUNT(*) AS n FROM vip_posts')).rows[0].n;
  await dbService.initDb();
  assert.equal(Number((await engine.query('SELECT COUNT(*) AS n FROM vip_posts')).rows[0].n), Number(survivors));
  assert.equal((await db.get("SELECT show_as_preview FROM vip_posts WHERE id=?", post.id)).show_as_preview, 0);
  process.env.ADMIN_ORIGIN = 'https://admin.test';
  const req = { ip: '127.0.0.1', body: { secret: process.env.ADMIN_ACCESS_SECRET }, headers: {}, get: key => key === 'origin' ? process.env.ADMIN_ORIGIN : undefined };
  const token = await auth.login(req); req.headers.cookie = 'joice-admin=' + token;
  assert.ok(await auth.session(req));
  await db.run('UPDATE admin_sessions SET expires_at=0'); assert.ok(!await auth.session(req), 'sessão expirada não vale');
  await require('./crop-delete')(db);
  // Simulate a Data API role with table privileges but no RLS policies.
  await engine.exec('CREATE ROLE cms_reader; GRANT USAGE ON SCHEMA public TO cms_reader; GRANT SELECT ON creator_profiles,vip_posts,admin_sessions,vip_uploads TO cms_reader; SET ROLE cms_reader;');
  assert.equal((await engine.query('SELECT * FROM creator_profiles')).rows.length, 0);
  assert.equal((await engine.query('SELECT * FROM vip_posts')).rows.length, 0);
  assert.equal((await engine.query('SELECT * FROM vip_uploads')).rows.length, 0);
  assert.equal((await engine.query('SELECT * FROM admin_sessions')).rows.length, 0);
  await engine.exec('RESET ROLE;');
  console.log('PASS: PostgreSQL/PGlite production adapter — schema repeat, CRUD, migration, likes, sessions, and RLS. No remote database.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await dbService.closeDb(); await engine.close(); });
