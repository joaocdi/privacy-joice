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
let currentProfile = {};
let returnFocus = null;

/* ------------------------------------------------------------ credencial */

/**
 * A entrada vem da página de venda como /vip#o=<pedido>&t=<token>.
 * Guardamos e limpamos a hash na hora: o token não fica no histórico do
 * navegador nem vaza em Referer.
 */
function readAccess() {
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
  const access = readAccess();

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

  // mídia (o src é um link assinado, válido por poucos minutos)
  // TODA publicação usa a mesma moldura 4:5 e a mídia PREENCHE essa moldura
  // (cover, no CSS). Não sobra área nenhuma para preencher: nenhum post fica
  // com tarja preta, nenhum fica com faixa borrada de um lado enquanto o
  // vizinho fica do outro, e todos têm exatamente o mesmo tamanho.
  const box = document.createElement('div');
  box.className = 'vip-media';

  if (post.type === 'video') {
    box.classList.add('is-video');
    const video = document.createElement('video');
    video.src = API_BASE + post.media;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('controlsList', 'nodownload');
    box.append(video);
  } else {
    const image = document.createElement('img');
    image.src = API_BASE + post.media;
    image.alt = post.caption || 'Foto exclusiva da Joice';
    image.loading = 'lazy';
    box.append(image);
  }

  article.append(box);
  JoiceFrame.apply(box.querySelector("img,video"),post.crop,{box});
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
    like.setAttribute('aria-label', (liked ? 'Descurtir' : 'Curtir') + ' publicação ' + id);
    const value = post.realLikes ? realCount : base + Number(liked);
    count.textContent = value.toLocaleString('pt-BR');
  }
  like.addEventListener('click', async () => {
    if (post.realLikes) {
      const access = readAccess();
      if (!access || like.disabled) return;
      like.disabled = true;
      try {
        const response = await fetch(`${API_BASE}/api/vip/${encodeURIComponent(access.orderId)}/posts/${encodeURIComponent(id)}/like`, {
          method: 'PUT', headers: { Authorization: 'Bearer ' + access.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ liked: !realLiked }), signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('Não foi possível registrar a curtida.');
        const data = await response.json();
        realCount = data.likes; realLiked = data.liked; post.likes = realCount; post.liked = realLiked;
        like.title = 'Curtida atualizada.'; update();
      } catch (_) { like.title = 'Não foi possível registrar. Tente novamente.'; }
      finally { like.disabled = false; }
      return;
    }
    if (likedPosts.has(id)) likedPosts.delete(id); else likedPosts.add(id);
    try { localStorage.setItem(LIKE_KEY, JSON.stringify([...likedPosts])); } catch (_) {}
    update();
  });
  update();
  // Só o ícone do cifrão, ao lado do coração. A contagem de curtidas fica.
  const gift = document.createElement('button');
  gift.type = 'button'; gift.className = 'vip-action vip-gift';
  gift.title = 'Mandar mimo';
  gift.setAttribute('aria-label', 'Mandar mimo');
  gift.append(icon([
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M14.8 9.3a2.6 2.6 0 0 0-2.4-1.3c-1.4 0-2.4.8-2.4 1.9 0 2.5 5 1.4 5 4 0 1.2-1.1 2-2.6 2a2.7 2.7 0 0 1-2.5-1.4',
    'M12 6.2v1.8M12 16v1.8'
  ]));
  gift.addEventListener('click', () => openVipModal('gift'));
  bar.append(like, gift);
  return bar;
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
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'verified-icon');
  svg.setAttribute('aria-label', 'Verificado');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('fill', '#3B9BF0');
  polygon.setAttribute('points', '29.62,3 33.05,8.31 39.37,8.62 39.69,14.94 45,18.37 42.12,24 45,29.63 39.69,33.06 39.37,39.38 33.05,39.69 29.62,45 24,42.12 18.38,45 14.95,39.69 8.63,39.38 8.31,33.06 3,29.63 5.88,24 3,18.37 8.31,14.94 8.63,8.62 14.95,8.31');

  const check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  check.setAttribute('fill', 'none');
  check.setAttribute('points', '16.5,24.2 21.2,28.9 31.8,18.3');
  check.setAttribute('stroke', '#fff');
  check.setAttribute('stroke-width', '3.6');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');

  svg.append(polygon, check);
  return svg;
}

/* --------------------------------------------------------------- modal */

function openVipModal(kind) {
  returnFocus = document.activeElement;
  $('vipModalTitle').textContent = kind === 'gift' ? 'Um carinho a mais.' : 'Mais perto, em breve.';
  $('vipModalText').textContent = kind === 'gift'
    ? 'A opção de mandar um mimo está sendo preparada com carinho. Por enquanto, seu coraçãozinho no post já deixa meu dia mais bonito.'
    : 'O contato direto ainda não está disponível. Quando essa novidade chegar, você vai descobrir aqui no clube.';
  $('vipModalOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('vipModalClose').focus();
}
function closeVipModal() {
  $('vipModalOverlay').hidden = true;
  document.body.style.overflow = '';
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
/* ------------------------------------------------------- mimo e chat */

/**
 * Mimo continua informativo: nenhum pedido, nenhuma cobrança.
 * Chat abre o WhatsApp da Joice quando o número estiver configurado no
 * servidor. O número nunca aparece neste arquivo.
 */
let whatsappUrl = null;
$('vipMimo')?.addEventListener('click', () => openVipModal('gift'));
$('vipChat')?.addEventListener('click', () => {
  if (whatsappUrl) return window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  openVipModal('chat');
});
(async function loadContact() {
  try {
    const response = await fetch(API_BASE + '/api/contact', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.whatsapp === 'string' && data.whatsapp.startsWith('https://')) whatsappUrl = data.whatsapp;
  } catch (_) { /* sem contato configurado: o aviso do modal assume */ }
})();

$('vipModalClose').addEventListener('click', closeVipModal);
$('vipModalOverlay').addEventListener('click', (event) => {
  if (event.target === $('vipModalOverlay')) closeVipModal();
});
document.addEventListener('keydown', event => {
  if ($('vipModalOverlay').hidden) return;
  if (event.key === 'Escape') closeVipModal();
  if (event.key === 'Tab') { event.preventDefault(); $('vipModalClose').focus(); }
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
