# Integração SyncPay

## Atualização: webhook real configurado

O cadastro e a publicação pendentes no relatório original abaixo foram concluídos:

- Webhook ID `13597`, criação HTTP 201 e listagem posterior HTTP 200.
- URL `https://privacy-joice.vercel.app/api/webhooks/syncpay`.
- Evento `transaction`, `trigger_all_products=true`, confirmados na listagem da SyncPay.
- Token oficial guardado como `SYNCPAY_WEBHOOK_SECRET`; ID guardado como `SYNCPAY_WEBHOOK_ID`, no `.env` privado e Vercel Production. Credenciais SyncPay e `PAYMENT_PROVIDER=syncpay` aplicados em produção, preservando as variáveis SigiloPay.
- Publicação pronta: `dpl_EUkefbmtuPzFXVcC1EALGUfFUade`, domínio de produção atualizado.
- Health HTTP 200; webhook sem assinatura HTTP 401; evento sintético assinado `transaction.created`/`pending` HTTP 200 com `ignored=true`. Esse evento não criou order, não confirmou pagamento nem concedeu acesso.
- Nenhuma cobrança real foi executada. A entrega de um evento real da SyncPay continua para a futura compra autorizada.

Os parágrafos seguintes registram a implementação anterior ao cadastro.

Implementada sem executar autenticação ou cobrança real nesta etapa. SigiloPay permanece disponível, com seu provider inalterado e seu endpoint de webhook mantido, inclusive para cobranças antigas após a troca de provider.

## Catálogo preservado

| Produto | Preço | Concessão |
| --- | --- | --- |
| monthly | R$ 9,90 | VIP por 30 dias |
| quarterly | R$ 19,90 | VIP por 90 dias |
| semester | R$ 39,90 | VIP por 180 dias |
| whatsapp_unlock | R$ 7,90 | Contato permanente, reabrível, sem VIP |

Os períodos são os dias existentes no catálogo, não meses de calendário. Somente o backend resolve preço e duração. O `.env.example` antigo indicava R$ 8,90 para contato; foi alinhado aos R$ 7,90 já usados. Nenhum preço do catálogo foi alterado.

## Fluxo

HOME → Assinar → celular → order CREATING → SyncPay recebe somente `{ "amount": <preço do catálogo> }` → identifier e PIX persistidos → order PENDING → QR local e copia e cola → webhook assinado → transação de banco confirma PAID + entitlement ACTIVE → polling observa o banco → VIP abre automaticamente.

WhatsApp usa o mesmo checkout, mas grava concessão `contact` sem expiração e mostra ABRIR WHATSAPP após pagamento. O destino só é devolvido ao comprador autorizado. Cada compra usa order própria; reenvio do mesmo checkout reutiliza a order.

Telefone normalizado fica apenas no banco. Credenciais e código PIX não são registrados em logs. A chave de acesso aleatória permanece no navegador; outro navegador precisa recuperar acesso pelo fluxo separado. Telefone sozinho não autoriza. O envio de código de recuperação ainda depende da configuração do serviço de entrega existente.

O token SyncPay é compartilhado em memória por processo, com renovação 60 segundos antes da expiração e uma única autenticação concorrente. Falhas de cobrança não são repetidas automaticamente porque a cobrança pode ter sido criada apesar da falha de resposta.

## Ambiente do backend

```dotenv
PAYMENT_PROVIDER=syncpay
SYNCPAY_CLIENT_ID=
SYNCPAY_CLIENT_SECRET=
SYNCPAY_WEBHOOK_SECRET=
```

As duas credenciais anteriormente fornecidas foram reutilizadas no `.env` local ignorado pelo Git. O segredo oficial do webhook ainda precisa ser configurado. Sem qualquer uma das três chaves, o checkout recusa criar cobranças. Nunca preencher variáveis públicas do frontend com essas chaves.

Para voltar à SigiloPay, usar `PAYMENT_PROVIDER=sigilopay` e reiniciar/reimplantar o backend, mantendo as variáveis SigiloPay existentes. O formulário então segue os requisitos originais da SigiloPay.

## Configurar webhook

Na área de webhooks da SyncPay, cadastrar a URL HTTPS pública `https://SEU-DOMINIO/api/webhooks/syncpay`, habilitada para todos os produtos, com evento **transaction**. Salvar o token/segredo oficial retornado pelo cadastro como `SYNCPAY_WEBHOOK_SECRET` no backend e reiniciar/reimplantar. Não usar o cadastro legado `cashin`/`all`: ele possui outro contrato de autenticação.

Se o painel não oferecer `transaction`, o contrato oficial documenta cadastro pela API `POST /api/partner/v1/webhooks` com `title`, `url`, `event: "transaction"` e `trigger_all_products: true`. A resposta fornece o token uma única vez. Esse cadastro não foi executado nesta implementação.

Fonte oficial consultada: [Webhooks SyncPay: eventos de pagamento](https://blog.syncpayments.com.br/ajuda/webhooks-syncpay-eventos-pagamento/).

O endpoint valida `X-SyncPay-Signature: t=...,v1=...` com HMAC-SHA256 sobre `timestamp + '.' + corpo bruto`, tolerância de 5 minutos e comparação em tempo constante. Exige headers `X-SyncPay-Event` e `X-SyncPay-Delivery`; concilia `transaction.reference_id` com o identifier salvo. Apenas `transaction.updated` + `completed`, moeda BRL, método pix e valor exato autorizam a confirmação. Identificador desconhecido retorna 404 para permitir reentrega; assinatura inválida retorna 401; divergência retorna 409. Eventos não pagos são reconhecidos sem conceder acesso.

Índice único de provider/identifier e entitlement único por order, já existentes em SQLite e PostgreSQL, impedem duplicações. Confirmação valida novamente provider, identifier e valor dentro da transação. Reentregas não estendem validade nem alteram preço.

## Arquivos desta integração

- `backend/payments/syncpay-provider.js`: novo provider, cache, PIX mínimo e assinatura.
- `backend/payments/provider.js`: seleção SyncPay/SigiloPay.
- `backend/server.js`: corpo bruto e endpoint dedicado; preservação do webhook SigiloPay.
- `backend/services/orders.js`: token por cobrança opcional para SyncPay.
- `backend/services/entitlements.js`: validação de conciliação dentro da transação.
- `app.js`: mensagem de espera e abertura automática do VIP confirmado.
- `backend/.env.example` e `.env` local ignorado: configuração.
- `backend/tests/syncpay.js`, `run.js`, `buyer-browser.js`, `security-audit.js`: testes.

## Validação e teste real pendente

Resultado desta implementação: `npm test` aprovado (inclui SQLite e adapter PostgreSQL/PGlite isolado); teste SyncPay aprovado; sintaxe de 78 arquivos JavaScript aprovada; auditoria com 404/404 verificações; teste Chrome nas larguras 320, 375, 390, 430, 768 e 1280 aprovado com chamadas SyncPay simuladas e webhook assinado. Não houve teste contra a API real ou PostgreSQL remoto nesta etapa.

Testes usam credenciais fictícias, respostas simuladas e banco isolado. Cobrem os quatro preços, payload sem dados pessoais, QR, cache/renovação concorrente, identifier único, assinatura bruta válida/inválida/expirada, webhook duplicado, valor/método/moeda divergentes, transação desconhecida, isolamento de concessões, acesso autorizado, fallback SigiloPay e ausência de repetição automática de cobrança.

Antes de UM teste real de R$ 9,90: cadastrar o webhook oficial, salvar seu segredo, publicar/reiniciar o backend com estas alterações e as variáveis privadas, verificar HTTPS público acessível e escolher mensal. Gerar uma única cobrança, pagar, conferir entrega do webhook, order PAID, um entitlement ACTIVE por 30 dias e abertura do VIP. Reabrir no mesmo navegador; reenviar o mesmo webhook não deve duplicar o acesso. Não gerar várias cobranças para investigar uma resposta incerta.
