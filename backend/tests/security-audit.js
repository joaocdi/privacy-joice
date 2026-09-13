/**
 * AUDITORIA DE SEGURANÇA — rode antes de cada deploy.
 *
 *   npm run audit:security
 *
 * Duas partes:
 *  1. varredura estática: nada de segredo, credencial ou mídia privada em
 *     arquivo que o navegador baixa ou que o bundle publica;
 *  2. travas de produção: cada uma é verificada num processo separado, porque
 *     todas acontecem no carregamento do módulo.
 *
 * Não faz requisição externa, não usa credencial real, não cobra nada.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '..');
const ROOT = path.resolve(BACKEND, '..');

let falhas = 0;
let checagens = 0;

function check(nome, ok, detalhe = '') {
  checagens += 1;
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
}

function secao(titulo) {
  console.log(`\n── ${titulo}`);
}

/** Roda um trecho num processo limpo: só o que o cenário define existe. */
function boot(code, env) {
  return spawnSync(process.execPath, ['-e', code], {
    cwd: BACKEND,
    env: { PATH: process.env.PATH, DOTENV_CONFIG_QUIET: 'true', ...env },
    encoding: 'utf8'
  });
}

/* ==================================================== 1. VARREDURA ESTÁTICA */

secao('Segredos no que o navegador recebe');

// Tudo que é servido como arquivo público (allowlist do server.js) + a página VIP.
const ARQUIVOS_PUBLICOS = ['index.html', 'app.js', 'style.css', 'vip.html', 'vip.css', 'vip.js'];

const PROIBIDO = [
  ['SIGILOPAY_SECRET_KEY', /SIGILOPAY_SECRET_KEY|x-secret-key/i],
  ['SIGILOPAY_PUBLIC_KEY', /SIGILOPAY_PUBLIC_KEY|x-public-key/i],
  ['SUPABASE_SERVICE_ROLE_KEY', /SUPABASE_SERVICE_ROLE_KEY|service_role/i],
  ['URL do Supabase', /supabase\.co|SUPABASE_URL/i],
  ['DATABASE_URL', /DATABASE_URL|postgres(ql)?:\/\//i],
  ['webhookToken', /webhook_?token/i],
  ['DEV_PAY_TOKEN', /DEV_PAY_TOKEN|x-dev-token/i],
  ['CRON_SECRET', /CRON_SECRET/i],
  ['VIP_MEDIA_SECRET', /VIP_MEDIA_SECRET/i]
];

for (const arquivo of ARQUIVOS_PUBLICOS) {
  const caminho = path.join(ROOT, arquivo);
  if (!fs.existsSync(caminho)) { check(`${arquivo} existe`, false, 'arquivo não encontrado'); continue; }
  const conteudo = fs.readFileSync(caminho, 'utf8');
  for (const [nome, padrao] of PROIBIDO) {
    check(`${arquivo} sem ${nome}`, !padrao.test(conteudo));
  }
}

secao('Segredos hardcoded no backend');

/** Todos os .js do backend, menos dependências e bancos de teste. */
function arquivosJs(dir, encontrados = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.test-runs'].includes(entrada.name)) continue;
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosJs(caminho, encontrados);
    else if (caminho.endsWith('.js')) encontrados.push(caminho);
  }
  return encontrados;
}

const SUSPEITOS = [
  ['JWT/service key literal', /\beyJ[A-Za-z0-9_-]{20,}\./],
  ['URL de Postgres literal', /postgres(ql)?:\/\/[^'"\s]*:[^'"\s]*@/],
  ['host supabase literal', /https:\/\/[a-z0-9-]+\.supabase\.co/]
];

for (const arquivo of arquivosJs(BACKEND)) {
  // Os testes usam valores falsos de propósito e são varridos à parte.
  if (arquivo.includes(`${path.sep}tests${path.sep}`)) continue;
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const relativo = path.relative(ROOT, arquivo);
  for (const [nome, padrao] of SUSPEITOS) {
    check(`${relativo} sem ${nome}`, !padrao.test(conteudo));
  }
}

secao('Dado pessoal em log');

// O CPF só entra no banco como hash + 3 últimos dígitos; nenhum console.log
// pode imprimir o documento, o cliente inteiro ou o corpo de uma resposta.
const LOGS_PROIBIDOS = [
  [/console\.(log|warn|error)\([^)]*\b(document|cpf|cnpj)\b/i, 'documento em log'],
  [/console\.(log|warn|error)\([^)]*\bclient\b(?!\s*\.name)/i, 'objeto client inteiro em log'],
  [/console\.(log|warn|error)\([^)]*\b(secretKey|publicKey|serviceRole|webhookToken)\b/i, 'credencial em log']
];

for (const arquivo of arquivosJs(BACKEND)) {
  if (arquivo.includes(`${path.sep}tests${path.sep}`)) continue;
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const relativo = path.relative(ROOT, arquivo);
  for (const [padrao, nome] of LOGS_PROIBIDOS) {
    check(`${relativo} sem ${nome}`, !padrao.test(conteudo));
  }
}

secao('Mídia privada fora do que é publicado');

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const vercelignore = fs.existsSync(path.join(ROOT, '.vercelignore'))
  ? fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8') : '';

for (const alvo of ['Area_membro', 'Midias_Bloqueadas', '.env', '*.sqlite', 'node_modules', 'Privacy_Sites.zip', '.test-runs']) {
  check(`.gitignore exclui ${alvo}`, gitignore.includes(alvo));
}
for (const alvo of ['Area_membro', 'Midias_Bloqueadas', '.env', '*.sqlite']) {
  check(`.vercelignore exclui ${alvo}`, vercelignore.includes(alvo));
}

const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const incluidos = JSON.stringify(vercelJson.functions || {});
check('bundle da Vercel não inclui pasta de mídia privada',
  !/Area_membro|Midias_Bloqueadas/.test(incluidos));

// A allowlist de estáticos do server.js não pode ter ganhado nada perigoso.
const serverJs = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
const allowlist = /const publicFiles = \[([^\]]+)\]/.exec(serverJs);
check('allowlist de arquivos estáticos encontrada', Boolean(allowlist));
if (allowlist) {
  const lista = allowlist[1].split(',').map((item) => item.trim().replace(/['"]/g, '')).filter(Boolean);
  check('allowlist só tem página, script, estilo e imagem de perfil',
    lista.every((item) => /^(index\.html|app\.js|style\.css|vip\.(html|css|js)|avatar\.jpg|cover\.jpg|verified\.png|login\.(html|css|js)|admin-mode\.(css|js)|frame\.(css|js))$/.test(item)),
    lista.join(' '));
}

/* ================================================== 2. TRAVAS DE PRODUÇÃO */

secao('Travas de produção');

const PG = 'postgresql://user:pass@db.example.com:6543/postgres';
const SEGREDO = 'a'.repeat(48);

check('PAYMENT_PROVIDER=mock não sobe em produção',
  boot("require('./payments/provider')", { NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock', DATABASE_URL: PG }).status !== 0);

check('SQLite não é aceito em produção (sem DATABASE_URL)',
  boot("require('./db/database')", { NODE_ENV: 'production' }).status !== 0);

check('driver de mídia inválido não sobe',
  boot("require('./services/vip-media').assertConfigured()",
    { NODE_ENV: 'production', VIP_MEDIA_DRIVER: 'publico', VIP_MEDIA_SECRET: SEGREDO }).status !== 0);

check('supabase sem credenciais não sobe',
  boot("require('./services/vip-media').assertConfigured()",
    { NODE_ENV: 'production', VIP_MEDIA_DRIVER: 'supabase', VIP_MEDIA_SECRET: SEGREDO }).status !== 0);

check('produção sem VIP_MEDIA_SECRET não sobe',
  boot("require('./services/vip-media').assertConfigured()", {
    NODE_ENV: 'production', VIP_MEDIA_DRIVER: 'supabase', SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k', VIP_MEDIA_BUCKET: 'vip-joice'
  }).status !== 0);

check('SIGILOPAY_BASE_URL http:// é recusada',
  boot("require('./payments/sigilopay-provider').configuration()", {
    NODE_ENV: 'production', PAYMENT_PROVIDER: 'sigilopay', SIGILOPAY_BASE_URL: 'http://app.sigilopay.com.br/api/v1',
    SIGILOPAY_PUBLIC_KEY: 'k', SIGILOPAY_SECRET_KEY: 's', PUBLIC_APP_URL: 'https://joice.example.com'
  }).status !== 0);

check('callback http:// é recusado',
  boot("require('./payments/sigilopay-provider').configuration()", {
    NODE_ENV: 'production', PAYMENT_PROVIDER: 'sigilopay', SIGILOPAY_PUBLIC_KEY: 'k',
    SIGILOPAY_SECRET_KEY: 's', PUBLIC_APP_URL: 'http://joice.example.com'
  }).status !== 0);

const producaoOk = boot(
  "const d=require('./db/database');const p=require('./payments/provider');"
  + "const m=require('./services/vip-media');"
  + "process.stdout.write(d.driver+':'+p.name+':'+m.assertConfigured())",
  {
    NODE_ENV: 'production', PAYMENT_PROVIDER: 'sigilopay', DATABASE_URL: PG,
    PUBLIC_APP_URL: 'https://joice.example.com', SIGILOPAY_PUBLIC_KEY: 'k', SIGILOPAY_SECRET_KEY: 's',
    VIP_MEDIA_DRIVER: 'supabase', SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k', VIP_MEDIA_BUCKET: 'vip-joice', VIP_MEDIA_SECRET: SEGREDO
  }
);
check('configuração completa de produção carrega', producaoOk.status === 0 && producaoOk.stdout === 'postgres:sigilopay:supabase',
  producaoOk.stdout || (producaoOk.stderr || '').split('\n')[0]);

secao('Rota de teste');

check('rota dev não existe sem ALLOW_DEV_PAYMENTS',
  !/if \(process\.env\.NODE_ENV !== 'production' && paymentProvider\.name === 'mock'\)/.test(serverJs)
  || serverJs.includes("process.env.NODE_ENV !== 'production'"),
  'protegida por NODE_ENV e provider mock');
check('rota dev exige provider mock e fora de produção',
  /NODE_ENV !== 'production' && paymentProvider\.name === 'mock'/.test(serverJs));
check('rota dev exige o segredo do checkout (authorizeOrder)',
  /app\.post\('\/api\/dev\/orders\/:orderId\/pay', authorizeOrder/.test(serverJs));
check('cron de expiração exige CRON_SECRET',
  /if \(process\.env\.CRON_SECRET\)/.test(serverJs) && /x-cron-secret/.test(serverJs));

secao('Autorização do VIP e da mídia');

check('/api/vip/:orderId passa por authorizeOrder',
  /app\.get\('\/api\/vip\/:orderId', authorizeOrder/.test(serverJs));
check('/api/vip/:orderId exige entitlement ativo',
  /const entitlement = await activeAccess\(req\.order\)/.test(serverJs));
check('/api/vip/media revalida pedido e entitlement',
  /verifyLink\(req\.params\.token\)/.test(serverJs) && /!await activeAccess\(order\)/.test(serverJs));

// O caminho administrativo é SEPARADO: sessão + role, sem encostar em orders.
// Só o corpo dos dois handlers: comentário vizinho não conta como código.
const previewRoutes = [/app\.get\('\/api\/vip\/preview', requireAdmin[\s\S]*?\n\}\);/, /app\.get\('\/api\/vip\/preview\/media\/:postId', requireAdmin[\s\S]*?\n\}\);/]
  .map(pattern => pattern.exec(serverJs)?.[0] || '').join('\n');
check('/api/vip/preview exige sessão administrativa',
  /app\.get\('\/api\/vip\/preview', requireAdmin/.test(serverJs));
check('/api/vip/preview/media exige a mesma sessão administrativa',
  /app\.get\('\/api\/vip\/preview\/media\/:postId', requireAdmin/.test(serverJs));
check('requireAdmin reconfere a sessão do Supabase no banco',
  /async function requireAdmin[\s\S]{0,220}await adminAuth\.session\(req\)/.test(serverJs)
  && /async function adminRole\(userId\)[\s\S]{0,160}admin_users WHERE user_id=\? AND role='admin'/.test(fs.readFileSync(path.join(BACKEND, 'services', 'admin-auth.js'), 'utf8')));
check('a revisão administrativa não cria pedido, entitlement nem marca pagamento',
  previewRoutes.length > 0
  && !/createOrder|confirmPayment|updateOrderPayment|updateOrderStatus|INSERT INTO entitlements|'PAID'/.test(previewRoutes),
  'o caminho da criadora não passa por orders nem por entitlements');
check('a revisão administrativa não assina link de comprador',
  previewRoutes.length > 0 && !/signLink|authorizeOrder|activeAccess/.test(previewRoutes));
check('o caminho do comprador continua exigindo PAID e entitlement ativo',
  /if \(order\.status !== 'PAID'\) return null/.test(serverJs)
  && /status='ACTIVE'/.test(serverJs));

const vipMediaJs = fs.readFileSync(path.join(BACKEND, 'services', 'vip-media.js'), 'utf8');
check('signed URL do Supabase tem expiração', /expiresIn: signedUrlTtl\(\)/.test(vipMediaJs));
check('expiração da signed URL é limitada a 60–300s',
  /Math\.min\(Math\.max\(Math\.round\(configured\), 60\), 300\)/.test(vipMediaJs));
check('signed URL não é guardada em lugar nenhum',
  !/INSERT|UPDATE|localStorage|writeFile/.test(vipMediaJs));
check('nada exige bucket público', !/public/i.test(vipMediaJs) || !/makePublic|getPublicUrl/.test(vipMediaJs));

secao('Exclusão permanente');

const adminRoutes = fs.readFileSync(path.join(BACKEND, 'admin.js'), 'utf8');
const painelJs = fs.readFileSync(path.join(ROOT, 'admin-mode.js'), 'utf8');
check('excluir de vez tem rota própria, separada do arquivar',
  /api\.delete\('\/posts\/:id\/permanent'/.test(adminRoutes) && /api\.delete\('\/posts\/:id'/.test(adminRoutes),
  'um clique errado no arquivar não pode virar exclusão');
check('excluir de vez exige confirmação explícita no servidor',
  /req\.body\.confirm !== 'EXCLUIR'/.test(adminRoutes),
  'chamada sem o campo de confirmação não apaga nada');
check('excluir de vez fica atrás da sessão e do anti-CSRF',
  adminRoutes.indexOf('api.use(auth.requireSession)') < adminRoutes.indexOf("api.delete('/posts/:id/permanent'"));
check('a tela pede confirmação mais forte que a do arquivar',
  /am-danger-box/.test(painelJs) && /Tem certeza\? Essa ação não poderá ser desfeita\./.test(painelJs)
  && /confirm: 'EXCLUIR'/.test(painelJs),
  'folha dedicada com caixa de confirmação, não um aviso do navegador');

secao('Prévia pública da HOME');

const vipPostsJs = fs.readFileSync(path.join(BACKEND, 'services', 'vip-posts.js'), 'utf8');
const previewJs = fs.readFileSync(path.join(BACKEND, 'services', 'preview-image.js'), 'utf8');
check('/api/home/previews é público mas não recebe pedido nem token',
  /app\.get\('\/api\/home\/previews'/.test(serverJs)
  && !/\/api\/home\/previews[\s\S]{0,400}(authorizeOrder|signLink|activeAccess)/.test(serverJs),
  'sem autorização de comprador porque não entrega mídia paga');
const homePreviewsBody = /async function homePreviews\(\)[\s\S]*?\n}/.exec(vipPostsJs)?.[0] || '';
// A prévia lê a derivada minúscula e o enquadramento (números, não arquivo).
// O que não pode aparecer aqui continua sendo o caminho e o link da mídia paga.
check('a prévia da HOME lê só a derivada, nunca media_path',
  /SELECT id,type,caption,preview_image(,crop_data)? FROM vip_posts/.test(homePreviewsBody)
  && !/media_path|signLink|deliver/.test(homePreviewsBody));
check('a prévia da HOME exige publicado, não arquivado e marcado',
  /published=1 AND archived=0 AND show_as_preview=1/.test(vipPostsJs));
check('a derivada é validada no servidor, não no navegador',
  /previewImage\.normalize\(/.test(vipPostsJs) && /function jpegSize/.test(previewJs));
check('a derivada tem limite de bytes e de dimensão',
  /MAX_BYTES = \d+ \* 1024/.test(previewJs) && /size\.width > MAX_EDGE/.test(previewJs),
  'downscale irreversível: o original não é reconstruível a partir dela');
check('só JPEG é aceito como derivada',
  /buffer\[0\] !== 0xFF \|\| buffer\[1\] !== 0xD8/.test(previewJs)
  && /\^\[A-Za-z0-9\+\/\]\+=\{0,2\}\$/.test(previewJs),
  'assinatura conferida e base64 restrito');
check('trocar a mídia invalida a derivada antiga',
  /input\.uploadId \? null/.test(vipPostsJs));
check('marcar prévia sem derivada é recusado',
  /showAsPreview && !preview\) throw fail/.test(vipPostsJs));

secao('Contato do WhatsApp');

const homeJs = fs.readFileSync(path.join(BACKEND, '..', 'app.js'), 'utf8');
const vipJs = fs.readFileSync(path.join(BACKEND, '..', 'vip.js'), 'utf8');
const homeHtml = fs.readFileSync(path.join(BACKEND, '..', 'index.html'), 'utf8');
check('o número vem do servidor, nunca do frontend',
  /process\.env\.WHATSAPP_NUMBER/.test(serverJs)
  && !/wa\.me|whatsapp\.com|\+?55\d{10}/i.test(homeJs + vipJs + homeHtml),
  'nenhum número nem link fixo nas páginas públicas');
check('número inválido não vira link',
  /digits\.length >= 10 && digits\.length <= 15/.test(serverJs), 'falha fechada: devolve null');
const contactHandler = /app\.get\('\/api\/contact'[\s\S]*?\n\}\);/.exec(serverJs)?.[0] || '';
check('o contato não cria pedido nem cobrança',
  contactHandler.includes('wa.me')
  && !/createOrder|confirmPayment|entitlement|paymentProvider|products/.test(contactHandler));
check('whatsapp_unlock continua desativado',
  require(path.join(BACKEND, 'products')).whatsapp_unlock.enabled === false);


secao('Modo administrador no site');

const adminAuthJs = fs.readFileSync(path.join(BACKEND, 'services', 'admin-auth.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(BACKEND, 'admin.js'), 'utf8');
const adminModeJs = fs.readFileSync(path.join(BACKEND, '..', 'admin-mode.js'), 'utf8');
const loginJs = fs.readFileSync(path.join(BACKEND, '..', 'login.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(BACKEND, '..', 'login.html'), 'utf8');
/** Tira comentários: a palavra "Supabase" numa explicação não é uso de API. */
const semComentarios = (code) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const frontendAdmin = semComentarios(loginJs) + semComentarios(adminModeJs) + loginHtml;

check('o Supabase Auth é chamado pelo servidor, não pelo navegador',
  /auth\/v1\/token\?grant_type=password/.test(adminAuthJs)
  && !/auth\/v1\/|supabase\.co|createClient|supabase-js/i.test(frontendAdmin),
  'nenhum arquivo público fala com o Supabase');
check('nenhuma chave do Supabase no frontend',
  !/SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role|eyJ[A-Za-z0-9_-]{20,}/.test(frontendAdmin));
check('não existe cadastro de administrador pelo app',
  !/auth\/v1\/signup|\.signUp\(/i.test(adminAuthJs + adminJs + loginJs + adminModeJs),
  'a conta é criada à mão no painel do Supabase');
check('a role vem do banco, não do token',
  /SELECT \* FROM admin_users WHERE user_id=\? AND role='admin'/.test(adminAuthJs));
check('a sessão de e-mail reconfere a role a cada requisição',
  /startsWith\(EMAIL_SESSION\)[\s\S]{0,320}adminRole\(userId\)/.test(adminAuthJs),
  'revogar a linha derruba a sessão aberta');
check('/api/admin/me só entrega token anti-CSRF com sessão válida',
  /if \(!current\) return res\.json\(\{ admin: false \}\);/.test(adminJs));
check('senha errada e conta sem permissão dão a mesma resposta',
  /if \(!user \|\| !await adminRole\(user\.id\)\) throw fail\('E-mail ou senha inválidos\.', 401\)/.test(adminAuthJs));
check('login por e-mail passa pelo limite de tentativas',
  /async function loginWithEmail[\s\S]{0,400}await countAttempt\(req\)/.test(adminAuthJs));
check('login por e-mail valida a origem',
  /async function loginWithEmail\(req\) \{\s*origin\(req\)/.test(adminAuthJs));
check('todo endpoint administrativo continua atrás de requireSession',
  /api\.use\(auth\.requireSession\)/.test(adminJs)
  && adminJs.indexOf('api.use(auth.requireSession)') < adminJs.indexOf("api.get('/posts'"),
  'a lista e as mutações ficam depois da tranca');
check('o frontend admin não guarda token em localStorage',
  !/localStorage|sessionStorage/.test(semComentarios(adminModeJs) + semComentarios(loginJs)),
  'a sessão vive só no cookie HttpOnly');

/* ============================================================== RESULTADO */

console.log(`\n${checagens - falhas}/${checagens} verificações de segurança passaram`);
if (falhas) {
  console.error(`\n❌ ${falhas} FALHA(S). Não faça deploy antes de resolver.`);
  process.exitCode = 1;
} else {
  console.log('✅ Nenhum problema encontrado.');
}
