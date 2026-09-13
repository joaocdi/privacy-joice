const crypto = require('crypto');
const { getDb, transaction } = require('../db/database');
const legacy = require('../vip-content');
const media = require('./vip-media');
const previewImage = require('./preview-image');
const crop = require('./crop');
const cleanup = require('./media-cleanup');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const MAX_HOME_PREVIEWS = 12;

async function source(db = null) {
  return (await (db || await getDb()).get("SELECT source FROM vip_content_settings WHERE id='joice'"))?.source || 'legacy';
}
async function setSource(value) {
  if (!['legacy', 'managed'].includes(value)) throw fail('Modo de feed inválido.');
  await (await getDb()).run("INSERT INTO vip_content_settings(id,source) VALUES ('joice',?) ON CONFLICT(id) DO UPDATE SET source=excluded.source", value);
}
// The panel list never carries preview_image itself: it only needs to know
// whether the derivative exists, and the payload stays small with many posts.
const LIST_COLUMNS = `id,creator_id,type,media_path,media_driver,caption,sort_order,published,archived,
  show_as_preview,likes_count,crop_data,version,created_at,updated_at,
  CASE WHEN preview_image IS NULL OR preview_image='' THEN 0 ELSE 1 END AS has_preview`;
async function list() {
  return (await getDb()).all(`SELECT ${LIST_COLUMNS} FROM vip_posts WHERE creator_id='joice' ORDER BY sort_order,created_at,id`);
}
/**
 * Amostra bloqueada da HOME.
 *
 * Devolve SOMENTE a derivada minúscula e a legenda. `media_path` nunca sai
 * daqui: o visitante não é assinante e não recebe nada que leve ao original.
 */
async function homePreviews() {
  if (await source() !== 'managed') return [];
  const rows = await (await getDb()).all(`SELECT id,type,caption,preview_image,crop_data FROM vip_posts
    WHERE creator_id='joice' AND published=1 AND archived=0 AND show_as_preview=1 AND preview_image IS NOT NULL AND preview_image<>''
    ORDER BY sort_order,created_at,id`);
  return rows.slice(0, MAX_HOME_PREVIEWS)
    .map(row => ({ id: row.id, type: row.type, caption: row.caption || '', crop: crop.read(row.crop_data), preview: previewImage.dataUri(row.preview_image) }));
}
/**
 * O número que aparece no coração.
 *
 * `likes_count` é o valor que a criadora digita no painel; as curtidas reais
 * dos assinantes vivem em `vip_post_likes`. O feed mostra a soma dos dois, de
 * forma determinística: recarregar a página não muda nada, e clicar no coração
 * continua registrando a interação real por cima do número declarado.
 */
function asFeed(post) {
  return { id: post.id, type: post.type, source: post.media_path, caption: post.caption,
    likes: Number(post.likes_count || 0) + Number(post.likes || 0),
    liked: Boolean(post.liked), realLikes: true, crop: crop.read(post.crop_data), mediaDriver: post.media_driver };
}
async function feed(orderId) {
  if (await source() === 'legacy') return legacy.posts.filter(p => !p.draft);
  return (await (await getDb()).all(`SELECT p.*,
    (SELECT COUNT(*) FROM vip_post_likes l WHERE l.post_id=p.id) AS likes,
    (SELECT COUNT(*) FROM vip_post_likes l WHERE l.post_id=p.id AND l.order_id=?) AS liked
    FROM vip_posts p WHERE p.creator_id='joice' AND p.published=1 AND p.archived=0
    ORDER BY p.sort_order,p.created_at,p.id`, orderId)).map(asFeed);
}
/**
 * Feed da revisão administrativa.
 *
 * Mesma montagem do feed do assinante, com uma diferença: rascunho também vem,
 * marcado com `draft: true`, para a criadora ver como a publicação vai ficar
 * antes de publicar. Não cria pedido nem entitlement — quem chama já provou ser
 * administrador.
 */
async function adminFeed() {
  if (await source() === 'legacy') return legacy.posts.map(p => ({ ...p, draft: Boolean(p.draft) }));
  return (await (await getDb()).all(`SELECT p.*,
    (SELECT COUNT(*) FROM vip_post_likes l WHERE l.post_id=p.id) AS likes
    FROM vip_posts p WHERE p.creator_id='joice' AND p.archived=0
    ORDER BY p.sort_order,p.created_at,p.id`))
    .map(p => ({ ...asFeed(p), draft: !p.published, version: p.version, showAsPreview: Boolean(p.show_as_preview) }));
}
/** Um post para a revisão administrativa: rascunho incluído, arquivado não. */
async function findForAdmin(id) {
  if (await source() === 'legacy') return legacy.posts.find(p => String(p.id) === String(id));
  const p = await (await getDb()).get("SELECT * FROM vip_posts WHERE id=? AND creator_id='joice' AND archived=0", String(id));
  return p ? asFeed(p) : null;
}
async function findPublished(id) {
  if (await source() === 'legacy') return legacy.posts.find(p => String(p.id) === String(id) && !p.draft);
  const p = await (await getDb()).get("SELECT * FROM vip_posts WHERE id=? AND creator_id='joice' AND published=1 AND archived=0", String(id));
  return p ? asFeed(p) : null;
}
function validate(input) {
  if (typeof input.caption !== 'string' || input.caption.length > 4000) throw fail('Legenda deve ter até 4.000 caracteres.');
  if (!Number.isInteger(input.sort_order) || Math.abs(input.sort_order) > 1000000) throw fail('Ordem inválida.');
  if (typeof input.published !== 'boolean') throw fail('Informe publicado ou rascunho.');
  if (input.show_as_preview !== undefined && typeof input.show_as_preview !== 'boolean') throw fail('Informe se a publicação aparece como prévia na HOME.');
  if (input.likes_count !== undefined && (!Number.isInteger(input.likes_count) || input.likes_count < 0 || input.likes_count > 100000000)) {
    throw fail('Curtidas exibidas devem ser um número inteiro a partir de zero.');
  }
  // undefined = campo ausente; `undefined` de volta do normalize = valor recusado.
  if (input.preview_image !== undefined && previewImage.normalize(input.preview_image) === undefined) {
    throw fail('Prévia da HOME inválida. Selecione a mídia novamente para gerar a amostra.');
  }
}
async function save(id, input, sessionId) {
  validate(input);
  return transaction(async db => {
    await cleanup.lock(db);
    let old = null;
    if (id) {
      old = await db.get("SELECT * FROM vip_posts WHERE id=? AND creator_id='joice'", id);
      if (!old) throw fail('Publicação não encontrada.', 404);
      if (old.archived) throw fail('Restaure a publicação antes de editar.', 409);
      if (input.version !== old.version) throw fail('Esta publicação mudou. Recarregue antes de salvar.', 409);
    }
    let asset = old && { media_path: old.media_path, type: old.type, media_driver: old.media_driver };
    if (input.uploadId) {
      const upload = await db.get('SELECT * FROM vip_uploads WHERE id=? AND session_id=? AND complete=1', input.uploadId, sessionId);
      if (!upload) throw fail('Upload não concluído ou não pertence a esta sessão.');
      asset = { media_path: upload.media_path, type: upload.type, media_driver: 'supabase' };
    }
    if (!asset) throw fail('Selecione e envie uma mídia.');
    await cleanup.usable(db, asset.media_path);
    const framing = input.crop === undefined ? crop.read(old?.crop_data) : crop.normalize(input.crop);
    if (input.published && (asset.media_driver !== media.driverName() || !media.exists(asset.media_path))) {
      throw fail('Mídia incompatível com o Storage ativo. Substitua a mídia antes de publicar.');
    }
    // Trocar a mídia invalida a derivada antiga: ela mostrava o arquivo anterior.
    const sent = input.preview_image === undefined ? null : previewImage.normalize(input.preview_image);
    const preview = sent !== null ? sent : input.uploadId ? null : old ? old.preview_image : null;
    const showAsPreview = Boolean(input.show_as_preview);
    // Campo ausente mantém o valor atual; vazio vira zero.
    const likesCount = input.likes_count === undefined ? (old ? Number(old.likes_count || 0) : 0) : input.likes_count;
    if (showAsPreview && !preview) throw fail('Para mostrar na HOME, selecione a mídia novamente para gerar a prévia.');
    if (old) {
      const result = await db.run(`UPDATE vip_posts SET type=?,media_path=?,media_driver=?,caption=?,sort_order=?,published=?,show_as_preview=?,preview_image=?,likes_count=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`,
        asset.type, asset.media_path, asset.media_driver, input.caption, input.sort_order, Number(input.published), Number(showAsPreview), preview, likesCount, id, input.version);
      if (!result.changes) throw fail('Esta publicação mudou. Recarregue antes de salvar.', 409);
    } else {
      // A retry after a lost response must not publish the same upload twice.
      id = 'post-' + input.uploadId;
      await db.run('INSERT INTO vip_posts(id,type,media_path,media_driver,caption,sort_order,published,show_as_preview,preview_image,likes_count) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
        id, asset.type, asset.media_path, asset.media_driver, input.caption, input.sort_order, Number(input.published), Number(showAsPreview), preview, likesCount);
    }
    // On create retry, keep the original crop instead of overwriting a later edit.
    if (old || (await db.get('SELECT crop_data FROM vip_posts WHERE id=?',id)).crop_data == null) {
      await db.run('UPDATE vip_posts SET crop_data=? WHERE id=?',JSON.stringify(framing),id);
    }
    return db.get(`SELECT ${LIST_COLUMNS} FROM vip_posts WHERE id=?`, id);
  });
}
async function archive(id, archived, version) {
  const result = await (await getDb()).run(`UPDATE vip_posts SET archived=?,published=0,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND creator_id='joice' AND version=?`, Number(archived), id, version);
  if (!result.changes) throw fail('Publicação não encontrada ou alterada. Recarregue.', 409);
}
/**
 * Traz o feed antigo (`vip-content.js`) para `vip_posts`.
 *
 * Preserva o que existia: ordem, legenda, tipo, caminho da mídia, estado
 * publicado (vaga marcada `draft` entra como rascunho) e a contagem de
 * curtidas, que vira `likes_count`.
 *
 * Idempotente pelo id `legacy-<id>`: rodar de novo não duplica e NÃO sobrescreve
 * o que você já editou no painel. Os blocos de chamada (`type: 'cta'`) ficam de
 * fora — não são publicação.
 *
 * Importante: isto copia REGISTRO, não bytes. Se o Storage ativo for o Supabase
 * e o arquivo estiver só no computador, troque a mídia pelo painel antes de
 * contar com ela em produção.
 */
async function migrate() {
  return transaction(async db => {
    let imported = 0;
    for (const [index, post] of legacy.posts.entries()) {
      if (!['image', 'video'].includes(post.type) || !media.safeObjectPath(post.source)) continue;
      const likes = Number.isFinite(post.likes) && post.likes > 0 ? Math.min(Math.round(post.likes), 100000000) : 0;
      const result = await db.run(`INSERT INTO vip_posts(id,type,media_path,media_driver,caption,sort_order,published,likes_count)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
        'legacy-' + post.id, post.type, post.source, media.driverName(), post.caption || '',
        index, post.draft ? 0 : 1, likes);
      imported += result.changes;
    }
    return imported;
  });
}

/**
 * Importa o feed antigo e passa a usar o banco — uma vez só.
 *
 * Roda no boot. Só age quando ainda não existe nenhuma publicação gerenciada:
 * se você já criou ou editou qualquer post pelo painel, esta função não encosta
 * em nada. É a ponte para deixar TODO post editável pelo modo administrador.
 */
async function adoptLegacyOnce() {
  const db = await getDb();
  const existing = await db.get("SELECT COUNT(*) AS n FROM vip_posts WHERE creator_id='joice'");
  if (Number(existing.n) > 0) return { imported: 0, switched: false, reason: 'já existem publicações no banco' };
  const imported = await migrate();
  if (!imported) return { imported: 0, switched: false, reason: 'o feed antigo não tinha publicação para importar' };
  await setSource('managed');
  return { imported, switched: true, reason: null };
}
async function like(postId, orderId, liked) {
  if (typeof liked !== 'boolean') throw fail('Estado de curtida inválido.');
  return transaction(async db => {
    if (await source(db) !== 'managed') throw fail('Este post usa reações locais.', 409);
    // Lock the post so archive/unpublish cannot race this write.
    const locked = await db.run("UPDATE vip_posts SET id=id WHERE id=? AND published=1 AND archived=0 AND creator_id='joice'", postId);
    if (!locked.changes) throw fail('Publicação indisponível.', 404);
    if (liked) await db.run('INSERT INTO vip_post_likes(id,post_id,order_id) VALUES (?,?,?) ON CONFLICT(post_id,order_id) DO NOTHING', crypto.randomUUID(), postId, orderId);
    else await db.run('DELETE FROM vip_post_likes WHERE post_id=? AND order_id=?', postId, orderId);
    return { liked, likes: Number((await db.get('SELECT COUNT(*) AS n FROM vip_post_likes WHERE post_id=?', postId)).n) };
  });
}
async function deletePermanent(id, version) {
  const result = await transaction(async db => {
    await cleanup.lock(db);
    const post = await db.get("SELECT * FROM vip_posts WHERE id=? AND creator_id='joice'",id);
    if (!post) throw fail('Publicação não encontrada.',404);
    if (post.version !== version) throw fail('Publicação alterada. Recarregue antes de excluir.',409);
    await db.run('DELETE FROM vip_post_likes WHERE post_id=?',id);
    await db.run('DELETE FROM vip_posts WHERE id=?',id);
    const shared = await cleanup.shared(db,post.media_path);
    const removable = !shared && post.media_driver === 'supabase' && post.media_path.startsWith('joice/');
    if (removable) await db.run('INSERT INTO media_deletions(media_path) VALUES (?) ON CONFLICT(media_path) DO NOTHING RETURNING media_path',post.media_path);
    return { path:post.media_path, removable, shared };
  });
  const storage = result.removable ? await cleanup.clean(result.path).catch(()=>'pending') : result.shared ? 'shared' : 'preserved';
  return { deleted:true, storage };
}
module.exports = { deletePermanent, source, setSource, list, feed, adminFeed, homePreviews, findPublished, findForAdmin, save, archive, migrate, adoptLegacyOnce, like, fail, MAX_HOME_PREVIEWS };
