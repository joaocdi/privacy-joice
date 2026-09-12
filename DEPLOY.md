# Deploy — Joice

Checklist para colocar no ar. Nada aqui gasta dinheiro até o passo final.

Ordem deliberada: primeiro provamos o **Supabase de verdade rodando local**,
depois subimos para a Vercel, e só no fim entra a SigiloPay real. O motivo é
prático — a chamada ao Supabase Storage é a peça mais nova do sistema, e é
muito mais fácil ler o erro dela num terminal do que num log de função.

---

## A. Criar o projeto Supabase

1. https://supabase.com → **New project**
2. Guarde a senha do banco (ela só aparece uma vez)
3. Escolha a região mais perto do Brasil (São Paulo, se disponível)

O mesmo projeto serve de banco **e** de Storage.

## B. Pegar a DATABASE_URL (pooler, porta 6543)

Project Settings → **Database** → **Connection pooling** → copie a URI.

```
postgresql://postgres.xxxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

Tem que ser a **6543** (pooler). A 5432 é conexão direta e estoura o limite em
serverless, onde cada invocação pode abrir a sua.

## C. Criar o bucket PRIVADO

Storage → **New bucket** → nome **`vip-joice`** → **"Public bucket" DESMARCADO**.

Um bucket público derruba toda a proteção: qualquer pessoa com a URL baixa o
arquivo sem pagar. Não precisa de policy de RLS — o backend usa a service role
key, que ignora RLS e por isso nunca pode sair do servidor.

## D. Criar a pasta `joice/`

Dentro do bucket, **Create folder** → `joice`.

O prefixo por modelo deixa o bucket pronto para outra conta sem misturar arquivos.

## E. Subir as mídias

Storage → `vip-joice` → `joice` → **Upload file**. Nomes previsíveis ajudam:

```
vip-joice/                 (privado)
└── joice/
    ├── post-01.jpg
    ├── post-02.mp4
    ├── post-03.jpg
    └── ...
```

Nada é enviado automaticamente por este projeto — o upload é seu.

## F. Configurar `backend/vip-content.js`

Para cada mídia, ajuste o `source` para o object path do bucket:

```js
{ id: 1, type: 'image', source: 'joice/post-01.jpg',
  caption: 'sua legenda', likes: 1243, comments: 38 }
```

`type` é `'image'` ou `'video'`. Os blocos `type: 'cta'` são as chamadas do
WhatsApp e não têm mídia.

## G. Remover o `draft` dos posts prontos

As vagas vêm marcadas `draft: true` e **não aparecem no feed**. Depois de subir
o arquivo e ajustar o `source`, apague essa propriedade da linha.

Confira quantos posts vão aparecer:

```powershell
cd E:\Privacy_Joice\backend
node -e "const{posts}=require('./vip-content');console.log(posts.filter(p=>p.type!=='cta'&&!p.draft).length,'mídias no feed')"
```

## H. Smoke test LOCAL contra o Supabase real (sem PIX)

Este é o teste que prova a corrente inteira: Postgres → entitlement → `/vip` →
Supabase Storage → signed URL → mídia carregando. Sem cobrança, sem chave da
SigiloPay.

Em `backend/.env` (arquivo local, nunca commitado):

```dotenv
NODE_ENV=development
PORT=3333
PAYMENT_PROVIDER=mock

DATABASE_URL=postgresql://...6543/postgres?sslmode=require

VIP_MEDIA_DRIVER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=cole_aqui
VIP_MEDIA_BUCKET=vip-joice
SUPABASE_SIGNED_URL_TTL=120
VIP_MEDIA_SECRET=gere_com_o_comando_abaixo
```

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Suba e abra http://localhost:3333:

```powershell
cd E:\Privacy_Joice\backend
npm install
npm start
```

No boot precisa aparecer `Mídia VIP: driver supabase` e
`Banco de dados inicializado (postgres)`. Se aparecer `sqlite`, a `DATABASE_URL`
não foi lida.

Agora, com a página aberta, abra o **Console do navegador** (F12) e cole:

```js
const t = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
const h = { 'Content-Type':'application/json', Authorization:'Bearer ' + t };
const pix = await (await fetch('/api/payments/pix', { method:'POST', headers:h,
  body: JSON.stringify({ productId:'monthly', checkoutToken:t }) })).json();
await fetch(`/api/dev/orders/${pix.orderId}/pay`, { method:'POST', headers:h });
location.assign(`/vip#o=${pix.orderId}&t=${t}`);
```

Isso cria um pedido, marca como pago pela rota de teste (que só existe fora de
produção e com o provider mock) e abre a área VIP.

**O que precisa acontecer:** o feed aparece, e cada mídia carrega. Na aba
Network, `/api/vip/media/...` responde **302** e redireciona para
`xxxxx.supabase.co/storage/v1/object/sign/...?token=...`. Se a mídia não
carregar, o object path do `vip-content.js` não bate com o arquivo no bucket.

Confira também no Supabase (Table Editor) que existe 1 linha em `orders` com
status `PAID` e 1 em `entitlements`.

> ⚠️ Esse pedido de teste fica no banco. Apague depois:
> `DELETE FROM entitlements; DELETE FROM orders;` — só faça isso **antes** de
> ter venda de verdade.

## I. Criar o projeto na Vercel

1. Suba o repositório para o GitHub (privado)
2. Vercel → **Add New → Project** → importe o repositório
3. Root Directory: a **raiz** (não `backend/`) — o `vercel.json` cuida do resto
4. Framework Preset: **Other**

## J. Configurar as variáveis na Vercel

Settings → **Environment Variables** → marque **Production**:

```
NODE_ENV=production
PAYMENT_PROVIDER=sigilopay

DATABASE_URL=postgresql://...6543/postgres?sslmode=require
PUBLIC_APP_URL=https://SEU-DOMINIO.vercel.app

SIGILOPAY_BASE_URL=https://app.sigilopay.com.br/api/v1
SIGILOPAY_PUBLIC_KEY=
SIGILOPAY_SECRET_KEY=

VIP_MEDIA_DRIVER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
VIP_MEDIA_BUCKET=vip-joice
SUPABASE_SIGNED_URL_TTL=120
VIP_MEDIA_SECRET=

CRON_SECRET=
FRONTEND_URL=https://SEU-DOMINIO.vercel.app
```

`CRON_SECRET` e `VIP_MEDIA_SECRET`: gere cada um com o comando do passo H.
`PUBLIC_APP_URL` só é conhecida depois do primeiro deploy — suba, pegue a URL,
preencha e faça **Redeploy**.

**Não** configure `ALLOW_DEV_PAYMENTS` nem `DEV_PAY_TOKEN`: não existem neste
projeto (ver o passo K).

## K. Deploy e verificação online

```bash
curl https://SEU-DOMINIO.vercel.app/api/health
# {"status":"ok","timestamp":"..."}
```

Depois, no navegador:

| Verificação | Esperado |
|---|---|
| `/` | página de venda, com os três planos |
| `/vip` | **"Acesso negado."** — digitar a URL não abre nada |
| `/backend/.env` | 404 |
| `/Area_membro/qualquer.jpg` | 404 |
| `/Midias_Bloqueadas/qualquer.mp4` | 404 |
| `/api/dev/orders/x/pay` | 404 — a rota de teste **não existe** em produção |

Nos logs da função, o boot precisa mostrar `driver postgres` e
`driver supabase`. Se o deploy falhar no boot, a mensagem diz exatamente qual
variável está faltando — é de propósito: melhor não subir do que subir
inseguro.

### Por que não dá para "testar sem PIX" direto na produção

A rota `/api/dev/orders/:orderId/pay` é barrada por duas condições no código:
`NODE_ENV !== 'production'` **e** `PAYMENT_PROVIDER === 'mock'`. Em produção ela
simplesmente não é registrada. Isso é proposital — um endpoint capaz de marcar
pedido como pago não deveria existir no mesmo servidor que recebe dinheiro.

Por isso o smoke test é o do passo H: local, mas contra o **mesmo** Postgres e o
**mesmo** Storage de produção. O que sobra sem prova online é só o trecho
SigiloPay → webhook, e esse é justamente o que o teste de R$ 9,90 cobre.

## L. Primeiro PIX real (R$ 9,90)

Só depois de tudo acima estar verde:

1. abra `/`, escolha **1 mês**, preencha nome, e-mail, telefone e CPF;
2. **GERAR PIX** e pague pelo seu banco;
3. a página deve virar "confirmado" sozinha em segundos;
4. confira no Supabase: `orders` com `status='PAID'` e `paid_at` preenchido, e
   uma linha nova em `entitlements`;
5. clique em **ACESSAR MEU CONTEÚDO** e confirme o feed carregando.

Se ficar `PENDING`: veja os logs da função. Webhook que não chegou é problema da
SigiloPay (confira a URL de callback lá); webhook com 401 é o `webhookToken`.

---

## Manutenção

O cron da Vercel chama `/api/jobs/expire` de hora em hora com o `CRON_SECRET`,
expirando entitlements vencidos. Sem `CRON_SECRET`, esse endpoint não existe e
a expiração não roda em serverless.

Antes de cada deploy:

```powershell
cd E:\Privacy_Joice\backend
npm run check
npm test
npm run audit:security
npm audit --omit=dev
```
