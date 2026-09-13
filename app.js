/* ===========================
   DATA: Creator & Content
   =========================== */

// Profile data comes exclusively from /api/profile.

const plans = [
  { id: "monthly",     label: "Assinatura mensal",      price: "R$ 9,90",  displayBtn: "Assinar agora R$ 9,90" },
  { id: "quarterly",   label: "3 meses (50% off)",       price: "R$ 19,90" },
  { id: "semester",    label: "6 meses (50% off)",       price: "R$ 39,90" }
];

// Viewer count – to be replaced by backend value
const viewerCount = 70;

// Offer expiry – feed a real timestamp from backend later
const offerExpiresAt = null; // e.g. new Date(Date.now() + 57000)

/* ===========================
   INIT: Populate DOM from data
   =========================== */
function applyProfile(profile) {
  const text = (id, value) => { const el = document.getElementById(id); if (el && value != null) el.textContent = value; };
  text('profileName', profile.name);
  document.querySelectorAll('[data-profile-avatar]').forEach(el => { el.src = profile.avatar; el.alt = profile.name; JoiceFrame.apply(el,profile.avatarCrop,{role:"avatar"}); });
  document.getElementById('coverImg').src = profile.cover;
  JoiceFrame.apply(document.getElementById('coverImg'),profile.coverCrop,{role:'cover',box:document.querySelector('.cover-wrap')});
  text('profileUsername', profile.username);
  text('profileBio', profile.bio);
  text('checkoutCreatorName', profile.name);
  text('checkoutCreatorUser', profile.username);
  document.querySelectorAll('.dynamic-post-name').forEach(el => el.textContent = profile.name);
  document.querySelectorAll('.dynamic-post-username').forEach(el => el.textContent = profile.username);

  const stats = profile.stats;
  if (stats) {
    text('statPhotos', stats.photos);
    text('statVideos', stats.videos);
    text('statLikes', stats.likes);
    // As abas repetem os mesmos números: mídias é a soma de fotos e vídeos.
    text('tabPostsLabel', `${stats.posts} Postagens`);
    text('tabMediaLabel', `${Number(stats.photos || 0) + Number(stats.videos || 0)} Mídias`);
  }

  const location = document.getElementById('profileLocation');
  if (location) {
    const value = profile.location || '';
    document.getElementById('profileLocationText').textContent = value || '';
    location.hidden = !value;
  }

  const viewers = document.getElementById('viewerCountEl');
  if (viewers) viewers.textContent = viewerCount + ' assistindo agora';
}


/**
 * Feed bloqueado da HOME.
 *
 * Duas origens, mesma marcação e mesmo CSS:
 *  - estática: os blocos já escritos no index.html (prévias pré-renderizadas);
 *  - gerenciada: as publicações marcadas em /admin como "prévia na HOME".
 *
 * Em nenhuma das duas a mídia original chega ao visitante. O que ele recebe é
 * uma derivada minúscula; o arquivo pago continua atrás do link assinado.
 *
 * As legendas abaixo são de apresentação. Nenhuma contagem de curtidas é
 * exibida aqui: números simulados não devem parecer engajamento real.
 */
const HOME_CAPTIONS = [
  'Um bom dia diferente, só por aqui.',
  'Os pequenos detalhes da minha rotina.',
  'Um momento que guardei para o clube.',
  'Tem coisas que eu só compartilho aqui.',
  'Meu diário, do meu jeito.',
  'Sem pressa. Sem filtro. Mais perto.',
  'O próximo capítulo te espera.'
];
function decorateLockedPost(post, { type, caption, id }) {
  const head = post.previousElementSibling;
  const article = document.createElement('article');
  article.className = 'preview-post';
  article.dataset.type = type;
  // Só serve para o modo administrador casar o cartão com o registro certo.
  if (id != null) article.dataset.postId = String(id);
  post.parentNode.insertBefore(article, head);
  article.append(head);
  const captionEl = document.createElement('p');
  captionEl.className = 'preview-caption'; captionEl.textContent = caption;
  // Sem etiqueta de FOTO/VÍDEO e sem faixa sobre a mídia: o feed fica limpo.
  head.querySelector('.post-menu')?.remove();
  article.append(captionEl, post);
  const footer = document.createElement('div');
  footer.className = 'preview-engagement';
  const left = document.createElement('span'); left.textContent = 'Conteúdo exclusivo';
  const note = document.createElement('span'); note.textContent = 'Só para assinantes';
  footer.append(left, note); article.append(footer);
  return article;
}
(function polishHomeFeed() {
  document.querySelectorAll('.locked-post').forEach((post, index) => {
    decorateLockedPost(post, { type: index === 0 ? 'image' : 'video', caption: HOME_CAPTIONS[index] });
  });
})();

/* ===========================
   MODAL HELPERS
   =========================== */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.returnFocus = document.activeElement;
    el.classList.add('open'); document.body.style.overflow = 'hidden';
    el.querySelector('button, input, a[href]')?.focus({ preventScroll: true });
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    const wasOpen = el.classList.contains('open');
    el.classList.remove('open'); document.body.style.overflow = '';
    if (wasOpen && el.returnFocus?.isConnected) el.returnFocus.focus({ preventScroll: true });
  }
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      if (overlay.id === 'checkoutModalOverlay') return closeCheckout();
      closeModal(overlay.id);
    }
  });
});

/* ===========================
   CHECKOUT & PIX INTEGRATION
   =========================== */
let currentPollingInterval = null;
let currentOrderId = null;
let currentCheckoutToken = null;
let checkoutVersion = 0;
let selectedProduct = null;
let checkoutBusy = false;
let catalog = null;
const API_BASE = location.protocol === 'file:' || (['localhost','127.0.0.1'].includes(location.hostname) && ['5500','5501'].includes(location.port)) ? 'http://localhost:3333' : '';
const PRODUCT_ALIASES = { 'broadcast-access': 'monthly', 'private-contact': 'whatsapp_unlock', 'chat-unlock': 'whatsapp_unlock' };
function authHeaders() { return { Authorization: 'Bearer ' + currentCheckoutToken }; }
function checkoutToken(product) {
  const key = 'joice.checkout.' + product;
  let token;
  try { token = sessionStorage.getItem(key); } catch (_) {}
  if (!/^[a-f0-9]{64}$/.test(token || '')) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(key, token); } catch (_) {}
  }
  return token;
}
function checkoutError(message, retry) {
  const loading = document.getElementById('pixLoadingState');
  loading.replaceChildren(); loading.style.display = 'flex';
  const text = document.createElement('p'); text.textContent = message; loading.append(text);
  if (retry) {
    const button = document.createElement('button'); button.className = 'btn-orange btn-pix';
    button.textContent = 'Tentar novamente'; button.onclick = retry; loading.append(button);
  }
}
async function openCheckout(productId) {
  closeCheckout();
  const version = checkoutVersion;
  selectedProduct = PRODUCT_ALIASES[productId] || productId;
  currentCheckoutToken = checkoutToken(selectedProduct);
  currentOrderId = null;
  openModal('checkoutModalOverlay');
  document.getElementById('pixActiveArea').style.display = 'none';
  document.getElementById('checkoutClientForm').style.display = 'none';
  document.getElementById('pixSuccessNotification').style.display = 'none';
  document.getElementById('pixStatusContainer').classList.remove('paid');
  document.getElementById('checkoutPlanLabel').textContent = 'Carregando...';
  document.getElementById('checkoutPlanPrice').textContent = '';
  checkoutError('Carregando checkout...');
  try {
    const response = await fetch(API_BASE + '/api/catalog', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Checkout indisponível. Tente novamente.');
    const data = await response.json();
    if (version !== checkoutVersion) return;
    catalog = data;
    const product = data.products.find(p => p.id === selectedProduct);
    if (!product) { checkoutError('Este produto ainda não está disponível para compra.'); return; }
    document.getElementById('checkoutPlanLabel').textContent = product.name;
    document.getElementById('checkoutPlanPrice').textContent = product.price.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
    if (data.requiresClient) {
      document.getElementById('pixLoadingState').style.display = 'none';
      document.getElementById('checkoutClientForm').style.display = 'grid';
    } else await createCheckoutPix(version);
  } catch (error) {
    if (version === checkoutVersion) checkoutError(error.message, () => openCheckout(productId));
  }
}
async function createCheckoutPix(version = checkoutVersion) {
  if (checkoutBusy || version !== checkoutVersion) return;
  checkoutBusy = true;
  const productId = selectedProduct;
  const token = currentCheckoutToken;
  const form = document.getElementById('checkoutClientForm');
  const client = catalog.requiresClient ? Object.fromEntries(new FormData(form)) : undefined;
  form.style.display = 'none'; checkoutError('Gerando QR Code PIX...');
  try {
    const response = await fetch(API_BASE + '/api/payments/pix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ productId, checkoutToken: token, client })
    });
    const data = await response.json();
    if (version !== checkoutVersion) return;
    if (response.status === 202) { checkoutError('Sua cobrança está sendo gerada. Aguarde alguns instantes.', () => createCheckoutPix(version)); return; }
    if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o PIX.');
    currentOrderId = data.orderId;
    document.getElementById('pixCodeInput').value = data.pix.copyPaste;
    const qr = document.getElementById('pixQrImage'); qr.src = data.pix.qrCode; qr.style.display = 'block';
    document.getElementById('pixLoadingState').style.display = 'none';
    document.getElementById('pixActiveArea').style.display = 'block';
    const copy = document.getElementById('btnCopyPix'); copy.disabled = false; copy.textContent = 'COPIAR'; copy.classList.remove('copied');
    document.getElementById('pixMockNotice').hidden = !data.mock;
    document.getElementById('pixStatusMessage').textContent = 'Aguardando pagamento...';
    startPaymentStatusPolling(data.orderId, version, token);
  } catch (error) {
    if (version === checkoutVersion) checkoutError(error.message, () => {
      if (catalog.requiresClient) { document.getElementById('pixLoadingState').style.display='none'; form.style.display='grid'; }
      else createCheckoutPix(version);
    });
  } finally { if (version === checkoutVersion) checkoutBusy = false; }
}
function startPaymentStatusPolling(orderId, version, token) {
  clearTimeout(currentPollingInterval);
  async function poll() {
    if (version !== checkoutVersion) return;
    try {
      const response = await fetch(API_BASE + '/api/orders/' + orderId + '/status', { headers: {Authorization:'Bearer '+token}, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Consulta indisponível');
      const data = await response.json();
      if (version !== checkoutVersion) return;
      const message = document.getElementById('pixStatusMessage');
      if (data.status === 'PAID') {
        document.getElementById('pixStatusContainer').classList.add('paid');
        message.textContent = 'Pagamento confirmado ✅';
        document.getElementById('pixSuccessNotification').style.display = 'block';
        document.getElementById('btnCopyPix').disabled = true;
        currentPollingInterval = null; return;
      }
      if (['EXPIRED','CANCELED','FAILED'].includes(data.status)) {
        message.textContent = data.status === 'EXPIRED' ? 'Prazo encerrado. Se você pagou, reabra o checkout para consultar.' : 'Cobrança indisponível.';
        document.getElementById('btnCopyPix').disabled = true;
        currentPollingInterval = null; return;
      }
      message.textContent = 'Aguardando pagamento...';
    } catch (_) {
      if (version !== checkoutVersion) return;
      document.getElementById('pixStatusMessage').textContent = 'Sem conexão. Consultando novamente...';
    }
    if (version === checkoutVersion) currentPollingInterval = setTimeout(poll, 3000);
  }
  poll();
}
function closeCheckout() {
  checkoutVersion++; checkoutBusy = false;
  clearTimeout(currentPollingInterval); currentPollingInterval = null;
  closeModal('checkoutModalOverlay');
}
document.getElementById('checkoutClientForm').addEventListener('submit', event => { event.preventDefault(); createCheckoutPix(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCheckout(); });
window.addEventListener('pagehide', closeCheckout);

/* ===========================
   LIVE BADGE → Live Modal
   =========================== */
document.getElementById('avatarLive')?.addEventListener('click', () => openCheckout('monthly'));
document.getElementById('closeLiveModal')?.addEventListener('click', () => closeModal('liveModalOverlay'));
document.getElementById('btnLiveJoin')?.addEventListener('click', () => {
  closeModal('liveModalOverlay');
  openCheckout('broadcast-access');
});

/* ===========================
   FLOATING WHATSAPP → Contact Modal
   =========================== */
document.getElementById('floatingWhatsapp')?.addEventListener('click', () => {
  openModal('whatsappModalOverlay');
  startWapTimer();
});
document.getElementById('closeWapModal')?.addEventListener('click', () => {
  closeModal('whatsappModalOverlay');
  stopWapTimer();
});
document.getElementById('btnWapUnlock')?.addEventListener('click', () => {
  closeModal('whatsappModalOverlay');
  stopWapTimer();
  openCheckout('private-contact');
});

/* ===========================
   WAP TIMER
   Uses offerExpiresAt if set, else defaults to 57s
   =========================== */
let wapTimerInterval = null;
let wapSeconds = 57;

function startWapTimer() {
  if (offerExpiresAt) {
    wapSeconds = Math.max(0, Math.round((offerExpiresAt - Date.now()) / 1000));
  } else {
    wapSeconds = 57;
  }
  updateWapTimer();
  clearInterval(wapTimerInterval);
  wapTimerInterval = setInterval(() => {
    if (wapSeconds > 0) { wapSeconds--; updateWapTimer(); }
    else clearInterval(wapTimerInterval);
  }, 1000);
}
function stopWapTimer() { clearInterval(wapTimerInterval); }
function updateWapTimer() {
  const m = String(Math.floor(wapSeconds / 60)).padStart(2, '0');
  const s = String(wapSeconds % 60).padStart(2, '0');
  const el = document.getElementById('wapTimer');
  if (el) el.textContent = `${m}:${s}`;
}

/* ===========================
   BOTÃO FLUTUANTE
   Mesma ação do Chat do perfil: abre o WhatsApp da Joice.
   =========================== */
document.getElementById('floatingChatAvatar')?.addEventListener('click', openWhatsapp);

/* ===========================
   SUBSCRIBE / PLAN BUTTONS
   =========================== */
const btnSubscribeNow = document.getElementById('btnSubscribeNow');
if (btnSubscribeNow) btnSubscribeNow.addEventListener('click', () => openCheckout('monthly'));

const btnPlan1m = document.getElementById('btnPlan1m');
if (btnPlan1m) btnPlan1m.addEventListener('click', () => openCheckout('monthly'));

const btnPlan3m = document.getElementById('btnPlan3m');
if (btnPlan3m) btnPlan3m.addEventListener('click', () => openCheckout('quarterly'));

const btnPlan6m = document.getElementById('btnPlan6m');
if (btnPlan6m) btnPlan6m.addEventListener('click', () => openCheckout('semester'));

// Promo section toggle
const promoToggle = document.getElementById('promoToggle');
const promoContent = document.getElementById('promoPlansContent');
if (promoToggle && promoContent) {
  promoToggle.addEventListener('click', () => {
    promoToggle.classList.toggle('closed');
    promoContent.classList.toggle('closed');
  });
  promoToggle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); promoToggle.click(); }
  });
}

// Delegado: as prévias gerenciadas em /admin entram no DOM depois daqui.
document.addEventListener('click', event => {
  if (event.target.closest('.btn-unlock')) openCheckout('monthly');
});

/* ===========================
   MIMO E CHAT
   Mimo é informativo: não cria pedido nem cobrança.
   Chat abre o WhatsApp da Joice, quando o número estiver configurado no
   servidor (WHATSAPP_NUMBER). Sem número, mostra o mesmo aviso — o número
   nunca fica escrito no frontend.
   =========================== */
let whatsappUrl = null;
function showNotice(title, text) {
  document.getElementById('noticeTitle').textContent = title;
  document.getElementById('noticeText').textContent = text;
  openModal('noticeModalOverlay');
}
document.getElementById('noticeClose')?.addEventListener('click', () => closeModal('noticeModalOverlay'));
function openWhatsapp() {
  if (whatsappUrl) return window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  showNotice('Em breve', 'O contato direto ainda não está disponível. Assim que abrir, você vê o aviso aqui mesmo na página.');
}
document.getElementById('btnChat')?.addEventListener('click', openWhatsapp);
document.getElementById('btnMimo')?.addEventListener('click', () => showNotice(
  'Mimo',
  'O envio de mimo ainda não está aberto. Por enquanto, a melhor forma de chegar perto é a assinatura.'
));
(async function loadProfile() {
  try {
    const response = await fetch(API_BASE + '/api/profile', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Perfil indisponível');
    const profile = await response.json();
    if (profile && typeof profile.name === 'string') applyProfile(profile);
  } catch (_) { document.getElementById('profileBio').textContent = 'Não foi possível carregar o perfil. Atualize a página.'; }
})();

(async function loadContact() {
  try {
    const response = await fetch(API_BASE + '/api/contact', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.whatsapp === 'string' && data.whatsapp.startsWith('https://')) whatsappUrl = data.whatsapp;
  } catch (_) { /* sem contato configurado: o aviso acima assume */ }
})();

/**
 * Troca as prévias estáticas pelas publicações marcadas em /admin.
 *
 * Falha em silêncio de propósito: sem backend, sem posts marcados ou com erro
 * de rede, a página continua exatamente como está no HTML. A amostra vem
 * pronta do servidor como imagem minúscula — não existe caminho de mídia aqui.
 */
(async function loadManagedPreviews() {
  let previews;
  let managed = false;
  try {
    const response = await fetch(API_BASE + '/api/home/previews', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const data = await response.json(); previews = data.previews; managed = data.source === 'managed';
  } catch (_) { return; }
  if (!Array.isArray(previews)) return;
  if (previews.length === 0) {
    if (managed) document.querySelectorAll('.preview-post').forEach(post => post.remove());
    return;
  }

  const existing = document.querySelectorAll('.preview-post');
  const blueprint = existing[0]?.querySelector('.post-header');
  const anchor = document.querySelector('#contentTabs .tabs-bar');
  if (!blueprint || !anchor) return;

  const fragment = document.createDocumentFragment();
  previews.forEach((item, index) => {
    if (!item || typeof item.preview !== 'string' || !item.preview.startsWith('data:image/jpeg;base64,')) return;
    const header = blueprint.cloneNode(true);
    header.querySelector('.post-type')?.remove();
    const locked = document.createElement('div');
    locked.className = 'locked-post';
    const image = document.createElement('img');
    image.className = 'locked-img';
    image.src = item.preview;
    image.alt = item.type === 'video' ? 'Prévia desfocada de um vídeo exclusivo' : 'Prévia desfocada de uma foto exclusiva';
    image.loading = 'lazy'; image.width = 64; image.height = 80;
    const overlay = document.createElement('div');
    overlay.className = 'locked-overlay';
    overlay.innerHTML = document.querySelector('.locked-overlay')?.innerHTML || '';
    locked.append(image, overlay);
    JoiceFrame.apply(image,item.crop,{box:locked});
    fragment.append(header, locked);
  });
  if (!fragment.childNodes.length) return;

  existing.forEach(article => article.remove());
  anchor.after(fragment);
  document.querySelectorAll('.locked-post').forEach((post, index) => {
    const item = previews[index];
    decorateLockedPost(post, {
      id: item.id,
      type: item.type === 'video' ? 'video' : 'image',
      caption: item.caption || HOME_CAPTIONS[index % HOME_CAPTIONS.length]
    });
  });
})();

/* ===========================
   CHECKOUT CLOSE & PIX ACTIONS
   =========================== */
document.getElementById('closeCheckoutModal')?.addEventListener('click', closeCheckout);

document.getElementById('btnCopyPix')?.addEventListener('click', async () => {
  const input = document.getElementById('pixCodeInput');
  if (input && input.value) {
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (e) {
      input.select();
      document.execCommand('copy');
    }
    const btn = document.getElementById('btnCopyPix');
    if (btn) {
      btn.textContent = 'Copiado! ✓';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'COPIAR';
        btn.classList.remove('copied');
      }, 2500);
    }
  }
});

document.getElementById('btnAccessNow')?.addEventListener('click', async () => {
  if (!currentOrderId) {
    alert('Nenhum pedido ativo no momento.');
    return;
  }
  
  const btn = document.getElementById('btnAccessNow');
  const originalText = btn.textContent;
  const version = checkoutVersion;
  btn.disabled = true;
  btn.textContent = 'ABRINDO...';

  try {
    // Confirma no servidor ANTES de sair da página: se a assinatura não
    // estiver ativa, o cliente vê o motivo aqui em vez de cair numa área
    // vazia. A área VIP refaz essa checagem de qualquer forma.
    const res = await fetch(`${API_BASE}/api/vip/${currentOrderId}`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (version !== checkoutVersion) return;
    if (!res.ok || !data.granted) throw new Error(data.error || 'Não foi possível abrir seu conteúdo.');

    // O token do checkout é a credencial: vai na hash (não é enviada ao
    // servidor nem entra no Referer) e a área VIP a guarda para as próximas
    // visitas. Quem valida continua sendo o backend, a cada requisição.
    window.location.assign(`/vip#o=${encodeURIComponent(currentOrderId)}&t=${currentCheckoutToken}`);
  } catch (err) {
    console.error(err);
    if (version === checkoutVersion) alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

/* ===========================
   CONTENT TABS
   =========================== */
document.getElementById('tab1').addEventListener('click', () => {
  document.getElementById('contentTabs').classList.remove('media-grid');
  document.getElementById('tab1').setAttribute('aria-pressed', 'true');
  document.getElementById('tab2').setAttribute('aria-pressed', 'false');
  document.getElementById('tab1').classList.add('active');
  document.getElementById('tab2').classList.remove('active');
});
document.getElementById('tab2').addEventListener('click', () => {
  document.getElementById('contentTabs').classList.add('media-grid');
  document.getElementById('tab1').setAttribute('aria-pressed', 'false');
  document.getElementById('tab2').setAttribute('aria-pressed', 'true');
  document.getElementById('tab2').classList.add('active');
  document.getElementById('tab1').classList.remove('active');
});

/* ===========================
   BIO: Read more / less
   =========================== */
// Uma bio só: recolhida em três linhas pelo CSS e aberta por aqui. Assim não
// existe uma versão curta que possa ficar diferente da do /vip.
let bioExpanded = false;
document.getElementById('readMoreBtn').addEventListener('click', () => {
  bioExpanded = !bioExpanded;
  document.getElementById('profileBio').classList.toggle('expanded', bioExpanded);
  document.getElementById('readMoreBtn').textContent = bioExpanded ? 'Ler menos' : 'Ler mais';
});

/* ===========================
   FLOATING BUTTONS: Desktop position
   =========================== */
function positionFloatingButtons() {
  const frame      = document.querySelector('.mobile-frame');
  const wap        = document.getElementById('floatingWhatsapp');
  const chatAvatar = document.getElementById('floatingChatAvatar');
  if (window.innerWidth >= 430) {
    const rect  = frame.getBoundingClientRect();
    const right = window.innerWidth - rect.right + 14;
    if (wap) { wap.style.position = 'fixed'; wap.style.right = right + 'px'; }
    if (chatAvatar) { chatAvatar.style.position = 'fixed'; chatAvatar.style.right = right + 'px'; }
  } else {
    if (wap) { wap.style.position = 'fixed'; wap.style.right = '14px'; }
    if (chatAvatar) { chatAvatar.style.position = 'fixed'; chatAvatar.style.right = '14px'; }
  }
}
window.addEventListener('resize', positionFloatingButtons);
positionFloatingButtons();

/* ===========================
   IMAGE FALLBACKS
   =========================== */
document.querySelectorAll('img:not(#pixQrImage)').forEach(img => {
  img.addEventListener('error', function () {
    const w = this.offsetWidth  || 72;
    const h = this.offsetHeight || 72;
    const div = document.createElement('div');
    div.style.cssText = `width:${w}px;height:${h}px;background:linear-gradient(135deg,#f3d9c0,#d4956e);border-radius:inherit;display:block;`;
    this.parentNode.insertBefore(div, this);
    this.style.display = 'none';
  });
});

document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-overlay.open');
  if (!modal) return;
  if (event.key === 'Escape' && modal.id !== 'checkoutModalOverlay') closeModal(modal.id);
  if (event.key !== 'Tab') return;
  const items = [...modal.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]')]
    .filter(element => element.getClientRects().length);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
