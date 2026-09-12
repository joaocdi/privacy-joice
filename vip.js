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
  $('vipBlocked').hidden = false;
}

/* ----------------------------------------------------------------- boot */

(async function start() {
  const access = readAccess();

  if (!access) {
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
    return showBlocked('Seu acesso expirou.', 'Renove para continuar vendo o conteúdo.', 'RENOVAR ACESSO');
  }

  if (!response.ok || !data.granted) {
    forgetAccess();
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
  $('vipAvatar').src = profile.avatar || '';
  $('vipName').textContent = profile.name || '';
  $('vipUsername').textContent = profile.username || '';
  $('vipBio').textContent = profile.bio || '';
  if (!profile.verified) $('vipVerified').remove();

  if (data.expiresAt) {
    const until = new Date(String(data.expiresAt).replace(' ', 'T') + 'Z');
    if (!Number.isNaN(until.getTime())) {
      $('vipExpiry').textContent = 'Acesso válido até '
        + until.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
  }

  $('vipFeed').replaceChildren(...(data.feed || []).map((post) => buildPost(post, profile)));

  $('vipLoading').hidden = true;
  $('vipBlocked').hidden = true;
  $('vipBadge').hidden = false;
  $('vipContent').hidden = false;
}

function buildPost(post, profile) {
  return post.type === 'cta' ? buildPromo(post) : buildMediaPost(post, profile);
}

/** Bloco de chamada. Hoje só informa — a venda do contato segue desativada. */
function buildPromo(post) {
  const section = document.createElement('section');
  section.className = 'vip-promo';

  const title = document.createElement('h2');
  title.textContent = post.title || '';

  const text = document.createElement('p');
  text.textContent = post.text || '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vip-cta';
  button.textContent = post.button || 'SABER MAIS';
  button.addEventListener('click', () => { $('vipModalOverlay').hidden = false; });

  section.append(title, text, button);
  return section;
}

function buildMediaPost(post, profile) {
  const article = document.createElement('article');
  article.className = 'vip-post';

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

  head.append(avatar, info);
  article.append(head);

  // legenda
  if (post.caption) {
    const caption = document.createElement('p');
    caption.className = 'vip-caption';
    caption.textContent = post.caption;
    article.append(caption);
  }

  // mídia (o src é um link assinado, válido por poucos minutos)
  const box = document.createElement('div');
  box.className = 'vip-media';

  if (post.type === 'video') {
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
    image.alt = '';
    image.loading = 'lazy';
    box.append(image);
  }

  article.append(box, buildActions(post));
  return article;
}

/** Ícones do feed: são visuais, não há curtida nem comentário de verdade. */
function buildActions(post) {
  const bar = document.createElement('div');
  bar.className = 'vip-actions';

  bar.append(
    action('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z',
      (post.likes || 0).toLocaleString('pt-BR')),
    action('M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l2-5.2A8.4 8.4 0 1 1 21 11.5z',
      (post.comments || 0).toLocaleString('pt-BR'))
  );

  const save = action('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', '');
  save.classList.add('vip-action-save');
  bar.append(save);

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

  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', pathData);
  svg.append(shape);
  return svg;
}

function verifiedBadge() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-label', 'Verificado');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('fill', '#0095F6');
  polygon.setAttribute('points', '29.62,3 33.05,8.31 39.37,8.62 39.69,14.94 45,18.37 42.12,24 45,29.63 39.69,33.06 39.37,39.38 33.05,39.69 29.62,45 24,42.12 18.38,45 14.95,39.69 8.63,39.38 8.31,33.06 3,29.63 5.88,24 3,18.37 8.31,14.94 8.63,8.62 14.95,8.31');

  const check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  check.setAttribute('fill', 'none');
  check.setAttribute('points', '16,24 21,29 32,18');
  check.setAttribute('stroke', '#fff');
  check.setAttribute('stroke-width', '4.5');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');

  svg.append(polygon, check);
  return svg;
}

/* --------------------------------------------------------------- modal */

$('vipModalClose').addEventListener('click', () => { $('vipModalOverlay').hidden = true; });
$('vipModalOverlay').addEventListener('click', (event) => {
  if (event.target === $('vipModalOverlay')) $('vipModalOverlay').hidden = true;
});
