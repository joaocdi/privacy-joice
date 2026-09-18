const { getDb, transaction } = require('../db/database');
const defaults = require('../vip-content').profile;
const crop = require('./crop');
const cleanup = require('./media-cleanup');
const { fail } = require('./vip-posts');

async function read(db) {
  return (db || await getDb()).get("SELECT * FROM creator_profiles WHERE id='joice'");
}
function present(row) {
  return { name: row?.name ?? defaults.name, username: row?.username ?? defaults.username,
    bio: row?.bio ?? defaults.bio, verified: Boolean(defaults.verified), stats: defaults.stats,
    location: defaults.location || '',
    avatarCrop: crop.read(row?.avatar_crop, 'avatar'), coverCrop: crop.read(row?.cover_crop, 'cover'),
    avatar: '/api/profile/media/avatar?v=' + (row?.version || 0),
    cover: '/api/profile/media/cover?v=' + (row?.version || 0), version: row?.version || 0 };
}
async function get() {
  // HOME and VIP share the configured profile counters.
  return present(await read());
}
async function save(body, sessionId) {
  for (const [key, max] of [['name',80], ['username',80], ['bio',4000]]) {
    if (typeof body[key] !== 'string' || body[key].length > max || (key !== 'bio' && !body[key].trim())) throw fail('Preencha nome, username e bio dentro dos limites.', 400);
  }
  if (!/^@[A-Za-z0-9._]{1,79}$/.test(body.username)) throw fail('Use @ seguido de letras, números, ponto ou sublinhado.', 400);
  if (!Number.isInteger(body.version) || body.version < 0) throw fail('Recarregue o perfil antes de salvar.', 409);
  return transaction(async db => {
    await cleanup.lock(db);
    await db.run("INSERT INTO creator_profiles(id,name,username,bio) VALUES ('joice',?,?,?) ON CONFLICT(id) DO NOTHING", defaults.name, defaults.username, defaults.bio);
    const current = await read(db);
    const paths = {};
    for (const role of ['avatar','cover']) {
      paths[role] = current[role + '_path'];
      if (body[role + 'UploadId'] !== undefined) {
        const id = body[role + 'UploadId'];
        if (typeof id !== 'string') throw fail('Imagem inválida.', 400);
        const upload = await db.get('SELECT * FROM vip_uploads WHERE id=? AND session_id=? AND complete=1', id, sessionId);
        if (!upload || upload.type !== 'image' || !['image/jpeg','image/png','image/webp'].includes(upload.mime_type)) throw fail('Selecione uma imagem enviada nesta sessão.', 400);
        paths[role] = upload.media_path;
        await cleanup.usable(db, upload.media_path);
      }
    }
    const result = await db.run("UPDATE creator_profiles SET name=?,username=?,bio=?,avatar_path=?,cover_path=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id='joice' AND version=?",
      body.name.trim(), body.username.trim(), body.bio, paths.avatar, paths.cover, body.version);
    if (!result.changes) throw fail('O perfil mudou em outra janela. Recarregue antes de salvar.', 409);
    for (const role of ['avatar','cover']) {
      const value = body[role + 'Crop'] === undefined ? crop.read(current[role + '_crop'],role) : crop.normalize(body[role + 'Crop'],role);
      await db.run(`UPDATE creator_profiles SET ${role}_crop=? WHERE id='joice'`,JSON.stringify(value));
    }
    return present(await read(db));
  });
}
async function image(role) {
  if (!['avatar','cover'].includes(role)) throw fail('Imagem não encontrada.', 404);
  const row = await read();
  return { path: row?.[role + '_path'] || null, fallback: defaults[role], version: row?.version || 0 };
}
module.exports = { get, save, image };
