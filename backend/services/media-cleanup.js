const { transaction } = require('../db/database');
const media = require('./vip-media');
// Shared lock serializes media adoption with deletion, including on PostgreSQL.
async function lock(db) {
  await db.run("INSERT INTO vip_content_settings(id,source) VALUES ('joice','legacy') ON CONFLICT(id) DO NOTHING");
  await db.run("UPDATE vip_content_settings SET id=id WHERE id='joice'");
}
async function usable(db, path) {
  if (await db.get('SELECT media_path FROM media_deletions WHERE media_path=?', path)) throw Object.assign(new Error('Esta mídia foi excluída. Envie um novo arquivo.'), {status:409});
}
async function shared(db, path) {
  return Boolean(await db.get('SELECT id FROM vip_posts WHERE media_path=? LIMIT 1', path) ||
    await db.get('SELECT id FROM creator_profiles WHERE avatar_path=? OR cover_path=? LIMIT 1', path, path) ||
    require('../vip-content').posts.some(p => p.source === path));
}
async function clean(path) {
  return transaction(async db => {
    await lock(db);
    const job = await db.get('SELECT status FROM media_deletions WHERE media_path=?',path);
    if (!job || job.status === 'done') return 'done';
    if (await shared(db,path)) return 'shared';
    // Database removal has already committed. Failed Storage cleanup is retryable.
    try { await media.removePrivate(path); } catch (_) { return 'pending'; }
    await db.run("UPDATE media_deletions SET status='done' WHERE media_path=?",path);
    return 'done';
  });
}
module.exports = { lock, usable, shared, clean };
