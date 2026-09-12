# Joice — checkout PIX e autorização

Projeto independente em E:\Privacy_Joice. Frontend existente preservado; alterações visuais restritas ao checkout.

## Rodar localmente

Requer Node.js 24 ou superior. No PowerShell:

~~~powershell
cd E:\Privacy_Joice\backend
npm install
# Apenas se .env não existir: copie .env.example para .env.
npm start
~~~

Abra http://localhost:3333 (ou a porta PORT configurada). Prefira servir a página pelo próprio backend. LiveServer nas portas 5500/5501 usa localhost:3333. Credenciais permanecem exclusivamente em backend/.env, que nunca é servido por HTTP.

## SigiloPay

Configure backend/.env:

~~~dotenv
PAYMENT_PROVIDER=sigilopay
SIGILOPAY_PUBLIC_KEY=preencher_localmente
SIGILOPAY_SECRET_KEY=preencher_localmente
SIGILOPAY_CALLBACK_URL=https://SEU_DOMINIO/api/payments/webhook
~~~

Contrato implementado conforme documentação fornecida pelo proprietário em 11/09/2026:
POST https://app.sigilopay.com.br/api/v1/gateway/pix/receive, headers x-public-key e x-secret-key; body identifier, amount, client (name/email/phone/document) e callbackUrl. Sem opcionais desnecessários.

transactionId é persistido, webhookToken é guardado como SHA-256 e pix.code gera o QR localmente. pix.base64 não é usado. A resposta de criação nunca aprova o pedido. Não se presume vencimento real de 30 minutos: esse prazo é exclusivo do mock, pois o contrato fornecido não definiu expiração da cobrança real.

Webhook: POST /api/payments/webhook com token e event. O token identifica o pedido e é comparado em tempo constante. Se transactionId estiver presente, também precisa corresponder. Somente TRANSACTION_PAID aprova. Outros eventos autenticados são ignorados. Webhooks inválidos recebem 401; falhas transitórias de processamento recebem 500 para permitir reenvio.

A integração foi testada com respostas simuladas, sem emissão de cobrança real. Antes de produção, configurar chaves/HTTPS e validar uma cobrança real e seu callback no ambiente autorizado.

## Preços

backend/products.js é a autoridade:

| Produto | Preço | Duração |
|---|---:|---|
| monthly | R$ 9,90 | 30 dias |
| quarterly | R$ 19,90 | 90 dias |
| semester | R$ 39,90 | 180 dias |
| whatsapp_unlock | R$ 8,90 | one_time |

WHATSAPP_PRICE altera o valor do contato. A venda desse produto permanece desativada enquanto a entrega não estiver configurada. Seus botões não vendem uma assinatura mensal por engano. Nenhuma automação n8n foi adicionada.

## Persistência e segurança

SQLite existente: backend/db/database.sqlite. DATABASE_PATH pode apontar para outro arquivo. Não há store de pedidos em memória nem segunda camada de banco.

Cada checkout gera um segredo aleatório de 32 bytes no navegador, mantido em sessionStorage e enviado como checkoutToken ao criar o PIX. O banco guarda somente seu hash. Repetir o mesmo checkout reutiliza o pedido; requisições concorrentes não criam cobranças adicionais. Depois, status/acesso exigem Authorization: Bearer <checkoutToken>. O identificador público sozinho não libera informações nem acesso. Pedidos antigos sem esse segredo continuam preservados no banco, mas não são expostos pela nova API.

Após timeout/falha ambígua do gateway, o pedido fica FAILED ou CREATING e não é cobrado novamente automaticamente. É necessário reconciliar esse pedido no gateway antes de iniciar uma nova cobrança; nenhum endpoint de consulta foi inventado. Um webhook recebido antes de o token da criação ser persistido é recusado e precisa ser reenviado pelo gateway.

A aprovação e o entitlement são gravados em uma transação SQLite. Índice único por order_id impede grants duplicados, e a repetição não renova paid_at ou validade. As transações usam uma fila local e conexão dedicada, mantendo isolamento entre requisições.

A migração preserva duplicatas antigas EXPIRED em entitlement_duplicates_archive quando já existe registro ACTIVE do mesmo pedido. Conflitos entre dois registros ativos exigem revisão e impedem a inicialização; não são mesclados silenciosamente.

O servidor só entrega index.html, app.js, style.css e imagens públicas de perfil explicitamente permitidas. Banco, backend, ZIP e pastas de mídia privada não ficam disponíveis diretamente.

## Acesso

GET /api/vip/:orderId exige o segredo do checkout, pedido PAID, produto vip e entitlement ativo/não expirado. Devolve a autorização, o perfil e o feed já montado da área VIP.

A página é /vip (vip.html, vip.css, vip.js). O botão "ACESSAR MEU CONTEÚDO" confirma no servidor e navega para /vip#o=<pedido>&t=<checkoutToken>; a página guarda essa credencial e limpa a URL. Digitar /vip direto mostra "Acesso negado" — o frontend não é autoridade em momento algum, e cada requisição revalida pedido e entitlement. Acesso expirado mostra a tela de renovação.

GET /api/access/:orderId mantém a entrega Telegram existente, também protegida por autorização e expiração. Configure TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_TOKEN, TELEGRAM_VIP_CHAT_ID e ENABLE_TELEGRAM_BOT=true para usá-la. Sem configuração, retorna 503 informativo, sem link fictício. O resgate do token e o vínculo ao usuário são atômicos; tokens e links privados não são registrados nos logs.

Os caminhos de imagem/vídeos bloqueados que já estavam quebrados no HTML permanecem sem publicação dos originais. É preciso fornecer prévias públicas apropriadas para preenchê-los; desfocar conteúdo privado apenas com CSS não o protege.

## Mídia da área VIP

O feed vive em backend/vip-content.js. Cada post tem id, type ('image', 'video' ou 'cta'), source, caption, likes e comments; `draft: true` esconde a vaga até o arquivo existir. Trocar mídia, legenda ou ordem, e acrescentar ou remover post, é só editar essa lista.

Nenhum arquivo pago é servido como estático em nenhum ambiente. O feed devolve /api/vip/media/<token>, um link HMAC de curta duração preso a um pedido e a um post; ao ser aberto, o servidor revalida pedido PAID e entitlement ACTIVE antes de entregar qualquer byte. O object path nunca vem do cliente: ele é lido do catálogo pelo id do post que está dentro do HMAC assinado.

VIP_MEDIA_DRIVER escolhe a entrega:

| Driver | Uso | Comportamento |
|---|---|---|
| local | desenvolvimento | streaming com Range a partir de VIP_MEDIA_DIRS (Area_membro/, Midias_Bloqueadas/) |
| supabase | produção | redirect 302 para signed URL do Storage privado |

Na Vercel o driver local não serve: as pastas privadas ficam fora do deploy, de propósito. Em produção com VIP_MEDIA_DRIVER=supabase e credenciais faltando, o servidor recusa iniciar — não há fallback para mídia pública.

### 1. Criar o projeto Supabase

supabase.com → New project. O mesmo projeto pode servir de banco (DATABASE_URL) e de Storage.

### 2. Criar o bucket PRIVADO

Storage → New bucket. Nome recomendado: `vip-joice`. **Deixe "Public bucket" DESMARCADO.** Um bucket público derruba toda a proteção: qualquer pessoa com a URL baixa o arquivo, sem pagar. Nenhuma policy de RLS extra é necessária — o backend usa a service role key, que ignora RLS e por isso só pode existir no servidor.

### 3. Estrutura dos objetos

~~~
vip-joice/                (bucket privado)
└── joice/
    ├── post-01.jpg
    ├── post-02.mp4
    ├── post-03.jpg
    └── ...
~~~

O prefixo por modelo (`joice/`) deixa o bucket pronto para outras contas sem misturar arquivos.

### 4. Variáveis

Project Settings → API:

| Variável | Onde achar |
|---|---|
| SUPABASE_URL | "Project URL" (https://xxxx.supabase.co) |
| SUPABASE_SERVICE_ROLE_KEY | "Project API keys" → **service_role** (secret) |
| VIP_MEDIA_BUCKET | o nome que você deu ao bucket (vip-joice) |
| VIP_MEDIA_DRIVER | supabase |
| VIP_MEDIA_SECRET | gere: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| SUPABASE_SIGNED_URL_TTL | opcional, 60–300 (padrão 120) |

Na Vercel: Project → Settings → Environment Variables, marcando Production. A service_role key é administrativa: ela nunca vai para o navegador, para o banco, para o log nem para o Git. A anon key não é usada por este projeto.

### 5. Subir as mídias

Faça o upload você mesmo pelo painel (Storage → vip-joice → pasta joice → Upload file) ou pelo CLI. Nada é enviado automaticamente por este projeto.

Depois, para cada arquivo, edite backend/vip-content.js: ajuste `source` para o object path (ex.: 'joice/post-09.jpg'), escreva a legenda e **remova o `draft: true`**. Post em draft não aparece no feed.

### 6. Testar sem PIX real

Localmente, com o driver local e PAYMENT_PROVIDER=mock, `npm test` percorre o fluxo inteiro. Para conferir o caminho do Supabase sem tocar no Storage de verdade, `npm test` roda tests/vip-supabase.js, que simula as respostas do Storage e verifica redirect, expiração, autorização e vazamento de segredo.

Em produção a rota de teste não existe: ela é barrada por NODE_ENV !== 'production' e PAYMENT_PROVIDER === 'mock'. Um endpoint capaz de marcar pedido como pago não deve morar no mesmo servidor que recebe dinheiro. Para provar a corrente inteira sem gastar nada, DEPLOY.md (passo H) descreve o smoke test local apontando para o MESMO Postgres e o MESMO bucket de produção.

## Mock e testes

PAYMENT_PROVIDER=mock é permitido somente fora de production. O QR tem marcação de simulação e não é pagável. Para simular, POST /api/dev/orders/:orderId/pay com Authorization: Bearer <checkoutToken>. Essa rota não existe no provider SigiloPay.

~~~powershell
cd E:\Privacy_Joice\backend
npm test
npm run check
npm audit --omit=dev
~~~

npm test executa os 12 testes originais adaptados à autenticação, mais testes de concorrência, rollback, falsificação/repetição de webhook, autorização, expiração, persistência, migração, contrato SigiloPay, área VIP e Supabase Storage (simulado). npm run test:pg roda a mesma verificação de fluxo contra um PostgreSQL real, quando TEST_DATABASE_URL estiver definida. Os bancos são criados somente em backend/.test-runs; os testes não alteram o banco existente. npm run check valida a sintaxe de todos os arquivos JavaScript próprios. Não há bundler nem lint configurado neste projeto.
