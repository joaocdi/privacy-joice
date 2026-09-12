/* ===========================
   DATA: Creator & Content
   =========================== */

const creator = {
  name: "Joice M",
  username: "@_johhh.of",
  avatar: "./avatar.jpg",
  cover: "./cover.jpg",
  bio: "💋 Oi, eu sou a Joice. Aqui você vê o meu lado que eu não mostro em nenhum outro lugar 👀🔥 Conteúdo exclusivo, rotina e umas surpresas só pra quem entra...",
  bioShort: "💋 Oi, eu sou a Joice. Aqui você vê o meu lado que eu não mostro em nenhum outro lugar 👀🔥 Conteúdo exclusivo, rotina e umas surpresas só p...",
  verified: true,
  stats: {
    posts: 205,
    photos: 64,
    videos: 394,
    likes: "1.5K"
  },
  instagram: "https://www.instagram.com/_johhh.of/"
};

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
(function initCreator() {
  document.getElementById('profileName').textContent  = creator.name;
  document.getElementById('profileUsername').textContent = creator.username;
  document.getElementById('profileBio').textContent   = creator.bioShort;

  document.getElementById('statPhotos').textContent  = creator.stats.photos;
  document.getElementById('statVideos').textContent = creator.stats.videos;
  document.getElementById('statLikes').textContent  = creator.stats.likes;

  document.getElementById('tabPostsLabel').textContent = creator.stats.posts + ' Postagens';
  document.getElementById('tabMediaLabel').textContent = (creator.stats.photos + creator.stats.videos) + ' Mídias';

  document.querySelectorAll('.dynamic-post-name').forEach(el => el.textContent = creator.name);
  document.querySelectorAll('.dynamic-post-username').forEach(el => el.textContent = creator.username);

  document.getElementById('chatNameEl').textContent   = creator.name;
  document.getElementById('checkoutCreatorName').textContent = creator.name;
  document.getElementById('checkoutCreatorUser').textContent = creator.username;

  const viewers = document.getElementById('viewerCountEl');
  if (viewers) viewers.textContent = viewerCount + ' assistindo agora';
})();

/* ===========================
   MODAL HELPERS
   =========================== */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
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
document.getElementById('badgeLive').addEventListener('click', () => openModal('liveModalOverlay'));
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
   FLOATING CHAT → Chat Modal
   =========================== */
document.getElementById('floatingChatAvatar').addEventListener('click', () => {
  const badge = document.getElementById('chatBadge');
  if (badge) badge.style.display = 'none';
  openModal('chatModalOverlay');
});
document.getElementById('closeChatModal').addEventListener('click', () => closeModal('chatModalOverlay'));

/* Chat send */
const chatInput   = document.getElementById('chatInput');
const chatBody    = document.getElementById('chatBody');
const chatSendBtn = document.getElementById('chatSendBtn');

const messages = [
  { id: 1, sender: 'creator', text: 'Vem falar comigo, meu bem 💋', createdAt: new Date() }
];

let creatorReplied = false;

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  
  // 1. User sends message
  const visitorMsg = { id: messages.length + 1, sender: 'visitor', text, createdAt: new Date() };
  messages.push(visitorMsg);
  
  const visitorBubble = document.createElement('div');
  visitorBubble.className = 'chat-bubble sent';
  visitorBubble.textContent = text;
  chatBody.appendChild(visitorBubble);
  
  chatInput.value = '';
  chatBody.scrollTop = chatBody.scrollHeight;
  
  // 2. Immediately show small unlock screen when user responds
  if (!creatorReplied) {
    creatorReplied = true;
    setTimeout(() => {
      document.getElementById('chatUnlockOverlay').style.display = 'flex';
    }, 300);
  }
}
chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

document.getElementById('btnChatUnlock').addEventListener('click', () => {
  document.getElementById('chatUnlockOverlay').style.display = 'none';
  closeModal('chatModalOverlay');
  openCheckout('chat-unlock');
});

document.getElementById('btnChatUnlockSkip').addEventListener('click', () => {
  document.getElementById('chatUnlockOverlay').style.display = 'none';
});

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
}

document.querySelectorAll('.btn-unlock').forEach(btn => {
  btn.addEventListener('click', () => openCheckout('monthly'));
});

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
  document.getElementById('tab1').classList.add('active');
  document.getElementById('tab2').classList.remove('active');
});
document.getElementById('tab2').addEventListener('click', () => {
  document.getElementById('tab2').classList.add('active');
  document.getElementById('tab1').classList.remove('active');
});

/* ===========================
   BIO: Read more / less
   =========================== */
let bioExpanded = false;
document.getElementById('readMoreBtn').addEventListener('click', () => {
  bioExpanded = !bioExpanded;
  document.getElementById('profileBio').textContent   = bioExpanded ? creator.bio : creator.bioShort;
  document.getElementById('readMoreBtn').textContent  = bioExpanded ? 'Ler menos' : 'Ler mais';
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
