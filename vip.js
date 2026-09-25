/* ==========================================================================
   ÁREA VIP — entrega da assinatura.

   Esta página NÃO decide nada. Ela guarda a credencial do comprador (o mesmo
   token de checkout que já prova a posse do pedido) e pergunta ao servidor o
   que pode mostrar. Sem assinatura ativa, o backend não devolve feed nem link
   de mídia — não existe "localStorage.paid = true" que abra este conteúdo.
   ========================================================================== */

const API_BASE = location.protocol === 'file:'
  || (['localhost', '127.0.0.1'].includes(location.hostname) && ['5500', '5501'].includes(location.port))
  ? 'http://localhost:3333'
  : '';

const STORAGE_KEY = 'joice.vip.access';

const $ = (id) => document.getElementById(id);
const LIKE_KEY = 'joice.vip.likes';
let likedPosts;
try { likedPosts = new Set(JSON.parse(localStorage.getItem(LIKE_KEY) || '[]').map(String)); }
catch (_) { likedPosts = new Set(); }
let currentFeed = [];
let feedLoadedAt = 0;
let adminFeed = false;
let refreshingFeed = null;
let renewedFeed = null;
let renewedAt = 0;

// Os links das mídias são temporários. Renova somente quando alguém precisa
// abrir uma mídia antiga, sem reconstruir os posts ou interromper outros vídeos.
async function freshMediaUrl(post, item) {
  if (!refreshingFeed && (!renewedFeed || Date.now() - renewedAt > 10 * 60 * 1000)) {
    refreshingFeed = (async () => {
      const access = adminFeed ? null : readAccess();
      if (!adminFeed && !access) throw new Error('Acesso indisponível');
      const url = adminFeed ? '/api/vip/preview' : `/api/vip/${encodeURIComponent(access.orderId)}`;
      const response = await fetch(API_BASE + url, {
        credentials: 'include',
        headers: access ? { Authorization: 'Bearer ' + access.token } : {},
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('Não foi possível renovar o acesso à mídia');
      const data = await response.json();
      if (!data.granted || !Array.isArray(data.feed)) throw new Error('Acesso à mídia indisponível');
      feedLoadedAt = renewedAt = Date.now();
      renewedFeed = data.feed;
      return data.feed;
    })().finally(() => { refreshingFeed = null; });
  }
  const feed = refreshingFeed ? await refreshingFeed : renewedFeed;
  const updated = feed.find(entry => String(entry.id) === String(post.id));
  const media = updated?.items?.length
    ? updated.items.find(entry => String(entry.id) === String(item.id))?.media
    : updated?.media;
  if (!media) throw new Error('Mídia indisponível');
  item.media = media;
  return API_BASE + media;
}
/**
 * Mídia que não abre (arquivo ainda não enviado, link expirado, erro do
 * Storage) vira um aviso curto no lugar do <img> quebrado. A moldura some:
 * nada de área gigante vazia no meio do feed.
 */
function mediaUnavailable(cell, { draft }) {
  if (cell.dataset.unavailable === '1') return;
  cell.dataset.unavailable = '1';
  cell.querySelectorAll('img, video, canvas, .vip-video-play').forEach(node => node.remove());
  cell.classList.add('vip-media-missing');
  const aviso = document.createElement('p');
  aviso.className = 'vip-media-missing-text';
  aviso.textContent = draft ? 'Mídia ainda não enviada.' : 'Mídia indisponível no momento.';
  cell.append(aviso);
}

const vipVideoObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.preload = 'metadata';
    else if (!entry.target.paused) entry.target.pause();
  }
}, { rootMargin: '200px 0px', threshold: 0 });
let currentProfile = {};
let returnFocus = null;

/* ------------------------------------------------------------ credencial */

/**
 * A entrada vem da página de venda como /vip#o=<pedido>&t=<token>.
 * Guardamos e limpamos a hash na hora: o token não fica no histórico do
 * navegador nem vaza em Referer.
 */
function readAccess() {
  if(window.accountVipAccess)return window.accountVipAccess;
  const hash = new URLSearchParams(location.hash.slice(1));
  const orderId = hash.get('o');
  const token = hash.get('t');

  if (orderId && /^[a-f0-9]{64}$/.test(token || '')) {
    const access = { orderId, token };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(access)); } catch (_) { /* modo privado */ }
    history.replaceState(null, '', location.pathname);
    return access;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.orderId && /^[a-f0-9]{64}$/.test(saved.token || '')) return saved;
  } catch (_) { /* ignora */ }

  return null;
}

function forgetAccess() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignora */ }
}

/* ---------------------------------------------------------------- telas */

function showBlocked(title, text, buttonLabel = 'VOLTAR PARA A PÁGINA') {
  $('vipLoading').hidden = true;
  $('vipContent').hidden = true;
  $('vipBadge').hidden = true;
  $('vipBlockedTitle').textContent = title;
  $('vipBlockedText').textContent = text;
  $('vipBlockedButton').textContent = buttonLabel;
  $('vipBlockedButton').href = buttonLabel === 'TENTAR DE NOVO' ? location.pathname : '/';
  $('vipBlocked').hidden = false;
}

/* ----------------------------------------------------------------- boot */

/**
 * Revisão da criadora.
 *
 * Pergunta ao servidor se ESTA sessão é administradora. Quem decide é o
 * backend (sessão válida + role admin no banco); o navegador só recebe o feed
 * se a resposta for sim. Nenhum pedido, cobrança ou assinatura é envolvido —
 * é um caminho separado do caminho do comprador.
 */
async function adminPreview() {
  try {
    const response = await fetch(`${API_BASE}/api/vip/preview`, { credentials: 'include', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && data.granted ? data : null;
  } catch (_) { return null; }
}

(async function start() {
  let access = readAccess();
  try { const r=await fetch('/api/buyer/account');const account=await r.json();if(account.enabled){
    const order=account.orders?.find(o=>o.grant_type==='subscription'&&o.status==='ACTIVE'&&(!o.expires_at||Date.parse(o.expires_at.replace(' ','T')+'Z')>Date.now()));
    // Existing pre-account purchases retain their server-validated credential.
    access=order?{orderId:order.public_id,token:''}:access;
    if(access)window.accountVipAccess=access;
  }}catch(_){}

  if (!access) {
    const preview = await adminPreview();
    if (preview) return render(preview);
    return showBlocked(
      'Acesso negado.',
      'Esta área é liberada assim que o seu pagamento é confirmado. Faça a assinatura na página principal.',
      'IR PARA A ASSINATURA'
    );
  }

  let response;
  let data;
  try {
    response = await fetch(`${API_BASE}/api/vip/${encodeURIComponent(access.orderId)}`, {
      headers: { Authorization: 'Bearer ' + access.token },
      signal: AbortSignal.timeout(15000)
    });
    data = await response.json().catch(() => ({}));
  } catch (_) {
    return showBlocked('Não consegui carregar', 'Falha de conexão com o servidor. Tente novamente em instantes.', 'TENTAR DE NOVO');
  }

  if (response.status === 403 && data.expired) {
    forgetAccess();
    // Credencial velha guardada no navegador não pode trancar a criadora fora.
    const preview = await adminPreview();
    if (preview) return render(preview);
    return showBlocked('Seu acesso expirou.', 'Renove para continuar vendo o conteúdo.', 'RENOVAR ACESSO');
  }

  if (response.status >= 500 || response.status === 429) {
    return showBlocked('Só um instante…', 'Não conseguimos carregar seu conteúdo agora. Tente novamente.', 'TENTAR DE NOVO');
  }

  if (!response.ok || !data.granted) {
    forgetAccess();
    const preview = await adminPreview();
    if (preview) return render(preview);
    return showBlocked(
      'Acesso negado.',
      'Não encontrei uma assinatura ativa para este acesso.',
      'IR PARA A ASSINATURA'
    );
  }

  render(data);
})();

/* --------------------------------------------------------------- render */

function render(data) {
  const profile = data.profile || {};
  adminFeed = Boolean(data.admin);
  feedLoadedAt = Date.now();
  renewedFeed = null;

  $('vipCover').src = profile.cover || '';
  JoiceFrame.apply($('vipCover'),profile.coverCrop,{role:'cover',box:document.querySelector('.vip-cover')});
  $('vipAvatar').src = profile.avatar || '';
  JoiceFrame.apply($('vipAvatar'),profile.avatarCrop,{role:'avatar'});
  $('vipName').textContent = profile.name || '';
  $('vipUsername').textContent = profile.username || '';
  $('vipBio').textContent = profile.bio || '';
  if (!profile.verified) $('vipVerified').remove();

  // Os mesmos números da página de venda, do mesmo objeto de perfil.
  const stats = profile.stats;
  if (stats) {
    $('vipStatPhotos').textContent = stats.photos ?? '';
    $('vipStatVideos').textContent = stats.videos ?? '';
    $('vipStatLikes').textContent = stats.likes ?? '';
    $('vipStats').hidden = false;
  }

  if (data.expiresAt) {
    const timestamp = String(data.expiresAt).replace(' ', 'T');
    const until = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : timestamp + 'Z');
    if (!Number.isNaN(until.getTime())) {
      $('vipExpiry').textContent = 'Acesso válido até '
        + until.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
  }

  currentFeed = data.feed || [];
  currentProfile = profile;
  const count = currentFeed.filter(post => post.type !== 'cta').length;
  // As abas repetem os números do perfil, exatamente como na página inicial.
  $('vipTabPostsLabel').textContent = (stats?.posts ?? count) + ' Postagens';
  $('vipTabMediaLabel').textContent = stats
    ? (Number(stats.photos || 0) + Number(stats.videos || 0)) + ' Mídias'
    : count + ' Mídias';
  renderFeed('all');

  $('vipLoading').hidden = true;
  $('vipBlocked').hidden = true;
  // Revisão da criadora não é assinatura: o selo diz o que realmente é.
  $('vipBadge').textContent = data.admin ? 'Modo revisão' : 'Assinatura ativa';
  $('vipBadge').hidden = false;
  if (data.admin) document.body.classList.add('vip-review');
  $('vipContent').hidden = false;
}

function renderFeed(filter) {
  vipVideoObserver.disconnect();
  const feed = currentFeed.filter(post => post.type !== 'cta' && (filter === 'all' || post.type === filter));
  $('vipFeed').replaceChildren(...feed.map(post => buildPost(post, currentProfile)));
  $('vipEmpty').hidden = feed.length > 0;
}

function buildPost(post, profile) {
  return post.type === 'cta' ? buildPromo(post) : buildMediaPost(post, profile);
}

/** Bloco de chamada. Hoje só informa — a venda do contato segue desativada. */
function buildPromo(post) {
  const section = document.createElement('section');
  section.className = 'vip-promo';

  const label = document.createElement('span');
  label.className = 'vip-eyebrow'; label.textContent = 'NOVIDADES DO CLUBE';

  const title = document.createElement('h2');
  title.textContent = post.title || '';

  const text = document.createElement('p');
  text.textContent = post.text || '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vip-cta';
  button.textContent = post.button || 'SABER MAIS';
  button.addEventListener('click', () => openVipModal('contact'));

  section.append(label, title, text, button);
  return section;
}

function buildMediaPost(post, profile) {
  const article = document.createElement('article');
  article.className = 'vip-post';
  article.dataset.postId = post.id;

  // cabeçalho
  const head = document.createElement('div');
  head.className = 'vip-post-head';

  const avatar = document.createElement('img');
  avatar.src = profile.avatar || '';
  avatar.alt = '';

  const info = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = profile.name || '';
  if (profile.verified) name.append(verifiedBadge());
  const username = document.createElement('small');
  username.textContent = profile.username || '';
  info.append(name, username);

  // Sem etiqueta de FOTO/VÍDEO: a própria mídia já diz o que é.
  head.append(avatar, info);
  JoiceFrame.apply(avatar,profile.avatarCrop,{role:"avatar"});
  // Só na revisão da criadora: diz que este post ainda não está publicado.
  if (post.draft) {
    const draft = document.createElement('span');
    draft.className = 'vip-draft-tag';
    draft.textContent = 'Rascunho';
    head.append(draft);
  }
  article.append(head);

  // A moldura é igual em todos os posts; a mídia fica inteira dentro dela.
  // O recorte configurado para as prévias públicas não se aplica ao VIP.
  const box = document.createElement('div');
  box.className = 'vip-media';

  // Carrossel: uma mídia continua sendo uma mídia, e o cartão fica idêntico.
  // Com duas ou mais, o mesmo cartão ganha swipe, setas e o indicador.
  const items = Array.isArray(post.items) && post.items.length
    ? post.items
    : [{ id: post.id, type: post.type, crop: post.crop, media: post.media }];
  if (items.some(item => item.type === 'video')) box.classList.add('is-video');

  JoiceCarousel.build(box, items.map((item, index) => (cell) => {
    if (item.type === 'video') {
      const video = document.createElement('video');
      // Mostra nas sobras um quadro borrado do próprio vídeo, como no CapCut.
      const backdrop = document.createElement('canvas');
      backdrop.className = 'vip-media-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.width = 80;
      backdrop.height = 100;
      cell.append(backdrop);
      const canvasContext = backdrop.getContext('2d');
      let lastFrame = 0;
      function paintBackdrop() {
        if (!canvasContext || !video.videoWidth || !video.videoHeight || !video.isConnected) return;
        if (performance.now() - lastFrame < 450) return;
        lastFrame = performance.now();
        try {
          const scale = Math.max(backdrop.width / video.videoWidth, backdrop.height / video.videoHeight);
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          canvasContext.drawImage(video, (backdrop.width - width) / 2, (backdrop.height - height) / 2, width, height);
          backdrop.classList.add('is-painted');
        } catch (_) { /* O vídeo continua funcionando se o navegador bloquear a cópia do quadro. */ }
      }
      video.addEventListener('loadeddata', paintBackdrop);
      video.addEventListener('seeked', paintBackdrop);
      video.addEventListener('timeupdate', paintBackdrop);
      let retrying = false;
      let retried = false;
      async function renewVideo() {
        if (retrying) return;
        retrying = true;
        try {
          video.src = await freshMediaUrl(post, item);
          video.load();
          return true;
        } catch (_) {
          mediaUnavailable(cell, { draft: post.draft });
          return false;
        } finally { retrying = false; }
      }
      video.addEventListener('error', async () => {
        if (retrying || !video.isConnected) return;
        if (retried) return mediaUnavailable(cell, { draft: post.draft });
        retried = true;
        await renewVideo();
      });
      video.src = API_BASE + item.media;
      video.controls = true;
      video.playsInline = true;
      // Só o primeiro pede metadados; os outros só quando chegam perto.
      video.preload = 'none';
      vipVideoObserver.observe(video);
      video.setAttribute('playsinline', '');
      video.setAttribute('controlsList', 'nodownload');
      cell.append(video);
      const playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.className = 'vip-video-play';
      playButton.textContent = '▶';
      playButton.setAttribute('aria-label', 'Reproduzir vídeo');
      playButton.addEventListener('click', async event => {
        event.stopPropagation();
        if (Date.now() - feedLoadedAt > 10 * 60 * 1000 && !await renewVideo()) return;
        video.play().catch(() => { playButton.hidden = false; });
      });
      video.addEventListener('play', () => { playButton.hidden = true; });
      video.addEventListener('pause', () => { playButton.hidden = false; });
      video.addEventListener('ended', () => { playButton.hidden = false; });
      cell.append(playButton);
    } else {
      const image = document.createElement('img');
      const backdrop = document.createElement('img');
      backdrop.className = 'vip-media-backdrop is-painted';
      backdrop.alt = '';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.loading = 'lazy';
      backdrop.src = API_BASE + item.media;
      cell.append(backdrop);
      image.decoding = 'async';
      let retried = false;
      image.addEventListener('error', async () => {
        if (retried || !image.isConnected) return mediaUnavailable(cell, { draft: post.draft });
        retried = true;
        try { backdrop.src = image.src = await freshMediaUrl(post, item); }
        catch (_) { mediaUnavailable(cell, { draft: post.draft }); }
      });
      image.src = API_BASE + item.media;
      image.alt = post.caption || 'Foto exclusiva da Maya';
      image.loading = index === 0 ? 'eager' : 'lazy';
      cell.append(image);
    }
  }), {
    // O vídeo que entra em cena volta a poder tocar; o que sai já foi pausado.
    onEnter: video => {
      const bounds = video.getBoundingClientRect();
      if (bounds.bottom >= -200 && bounds.top <= innerHeight + 200) video.preload = 'metadata';
    }
  });

  article.append(box);
  if (post.caption) {
    const caption = document.createElement('p');
    caption.className = 'vip-caption';
    const author = document.createElement('strong'); author.textContent = profile.name + ' ';
    caption.append(author, document.createTextNode(post.caption)); article.append(caption);
  }
  article.append(buildActions(post));
  return article;
}

/** Posts gerenciados usam reações reais. O fallback antigo mantém a reação local. */
function buildActions(post) {
  const bar = document.createElement('div');
  bar.className = 'vip-actions';
  const id = String(post.id);
  const base = Number.isFinite(post.likes) && post.likes >= 0 ? post.likes : 0;
  let realCount = base;
  let realLiked = Boolean(post.liked);
  const like = document.createElement('button');
  like.type = 'button'; like.className = 'vip-action vip-like';
  like.title = post.realLikes ? 'Curtidas registradas para esta assinatura.' : 'Contagem do feed antigo. Sua reação fica neste navegador.';
  like.append(icon('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z'));
  const count = document.createElement('span'); like.append(count);
  function update() {
    const liked = post.realLikes ? realLiked : likedPosts.has(id);
    like.classList.toggle('is-liked', liked); like.setAttribute('aria-pressed', String(liked));
    like.setAttribute('aria-label', (liked ? 'Descurtir' : 'Curtir') + ' publicação');
    const value = post.realLikes ? realCount : base + Number(liked);
    count.textContent = value.toLocaleString('pt-BR');
  }
  like.addEventListener('click', async () => {
    if (post.realLikes) {
      const access = readAccess();
      if (!access) {
        // Modo revisão da criadora: não existe assinatura para registrar a curtida.
        like.classList.remove('is-tapped'); void like.offsetWidth; like.classList.add('is-tapped');
        notice('Modo revisão: as curtidas só contam quando um assinante toca no coração.');
        return;
      }
      if (like.disabled) return;
      like.disabled = true;
      const previous = { count: realCount, liked: realLiked };
      realLiked = !realLiked; realCount += realLiked ? 1 : -1; update();
      try {
        const response = await fetch(`${API_BASE}/api/vip/${encodeURIComponent(access.orderId)}/posts/${encodeURIComponent(id)}/like`, {
          method: 'PUT', headers: { Authorization: 'Bearer ' + access.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ liked: realLiked }), signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('Não foi possível registrar a curtida.');
        const data = await response.json();
        realCount = data.likes; realLiked = data.liked; post.likes = realCount; post.liked = realLiked;
        like.title = 'Curtida atualizada.'; update();
      } catch (_) { realCount = previous.count; realLiked = previous.liked; update(); like.title = 'Não foi possível registrar. Tente novamente.'; }
      finally { like.disabled = false; }
      return;
    }
    if (likedPosts.has(id)) likedPosts.delete(id); else likedPosts.add(id);
    try { localStorage.setItem(LIKE_KEY, JSON.stringify([...likedPosts])); } catch (_) {}
    update();
  });
  update();
  const comment = document.createElement('button');
  comment.type = 'button'; comment.className = 'vip-action vip-comment';
  comment.disabled = true;
  comment.title = 'Comentários indisponíveis';
  comment.setAttribute('aria-label', 'Comentários indisponíveis');
  comment.append(icon('M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11.5z'));
  bar.append(like, comment);
  return bar;
}

/** Aviso curto no rodapé da tela (some sozinho). */
function notice(text) {
  let box = document.getElementById('vipNotice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'vipNotice'; box.className = 'vip-notice'; box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.textContent = text;
  box.classList.add('is-visible');
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => box.classList.remove('is-visible'), 2600);
}

function action(pathData, label) {
  const span = document.createElement('span');
  span.className = 'vip-action';
  span.append(icon(pathData));
  if (label) span.append(document.createTextNode(label));
  return span;
}

function icon(pathData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '19');
  svg.setAttribute('height', '19');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const data of [].concat(pathData)) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', data);
    svg.append(shape);
  }
  return svg;
}

function verifiedBadge() {
  const image = document.createElement('img');
  image.src = '/verified-nina.png';
  image.width = 14;
  image.height = 14;
  image.className = 'verified-icon';
  image.alt = 'Verificado';
  return image;
}

/* --------------------------------------------------------------- modal */

$('vipChat')?.addEventListener('click', async () => {
  const button=$('vipChat');button.disabled=true;
  try {
    const response=await fetch('/api/buyer/account');const account=await response.json();
    const owned=account.orders?.find(o=>o.grant_type==='contact'&&o.status==='ACTIVE');
    if(!owned)return location.assign('/?buy=whatsapp_unlock');
    const result=await fetch('/api/contact/'+encodeURIComponent(owned.public_id));const contact=await result.json();
    if(!result.ok||!contact.whatsapp)throw Error('Não foi possível abrir seu WhatsApp.');
    location.assign(contact.whatsapp);
  }catch(_){location.assign('/meu-acesso');}finally{button.disabled=false;}
});

// Duas abas: a lista de publicações e a grade de mídias. Sem filtro de
// foto/vídeo — o feed mostra tudo junto, como na página inicial.
for (const [button, grid] of [[$('vipTabPosts'), false], [$('vipTabMedia'), true]]) {
  button?.addEventListener('click', () => {
    for (const item of document.querySelectorAll('.vip-tab')) {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-selected', String(item === button));
    }
    $('vipFeed').classList.toggle('is-grid', grid);
  });
}
