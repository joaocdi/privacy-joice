# Joice — validação de publicação, 14/09/2026

O site foi publicado com SigiloPay configurada. **Uma compra real paga e a liberação pelo webhook real ainda NÃO foram validadas.** Nenhum PIX foi pago nesta rodada. A meta de LCP em rede lenta também não foi atingida.

## 1–9. Diagnóstico REAL da SigiloPay

Requisição direta a `POST https://app.sigilopay.com.br/api/v1/gateway/pix/receive`, com as chaves de `backend/.env`, headers `x-public-key` e `x-secret-key`, valor R$ 9,90 e dados autorizados pelo titular. Sem CPF fictício, sem documento vazio, sem persistir uma order da aplicação.

| Teste | name | email | phone | document | HTTP | Resultado |
|---|---|---|---|---|---|---|
| 1 | Sim | Sim | Sim | Omitido | 422 | `Required document.` |
| 2 | Sim | Omitido | Sim | Omitido | — | Não executado: teste 1 falhou |
| 3 | Omitido | Omitido | Sim | Omitido | — | Não executado: teste 1 falhou |
| 4 | Omitido | Omitido | Omitido | Omitido | — | Não executado: teste 1 falhou |

Corpo completo da resposta:

```json
{"statusCode":422,"errorCode":"GATEWAY_INVALID_ARGUMENT","message":"Required document."}
```

Identifier: `diag_sigilopay_1789348703651_af578045be926d7bc806`. Nenhum `transactionId` retornado. Não houve criação confirmada.

5. Payload mínimo aceito: **não determinado**, pois nenhuma variante teve criação aceita.
6. Documento obrigatório: **SIM para a rota e conta testadas**. A resposta exige `document`; não distingue CPF de CNPJ.
7. Nome obrigatório: não determinado isoladamente pelo diagnóstico.
8. E-mail obrigatório: não determinado isoladamente pelo diagnóstico.
9. Telefone obrigatório para o gateway: não determinado isoladamente pelo diagnóstico. O nosso sistema continua exigindo celular.

A documentação fornecida descreve os quatro campos como obrigatórios. A consulta pública complementar não comprovou dispensa de documento por nominal. Existe uma [interface oficial de nominais](https://www.sigilopay.com/nominal/), mas nenhuma configuração da conta ou rota foi alterada. Não inferir que uma troca removeria essa exigência.

## 10–18. Checkout, acesso e dados

10. Checkout real preservado: **nome, e-mail, celular e CPF/CNPJ**. Provider de produção e preços não foram alterados. Monthly R$ 9,90/30 dias; quarterly R$ 19,90/90 dias; semester R$ 39,90/180 dias. WhatsApp continua desativado.
11. Webhook: procura a transação, valida o token contra o hash persistido e só aceita a aprovação pelo evento correspondente. A rota real está acessível e recusou payload inválido com 401. **Entrega de um webhook legítimo pela SigiloPay permanece pendente.** Polling não aprova pagamentos.
12. Idempotência: testes existentes com oito webhooks simultâneos, repetição posterior e rollback passaram; o novo teste repete cinco aprovações e confirma um entitlement, sem renovar a assinatura por PPV. São testes isolados/mocks, também executados no PostgreSQL real em schema temporário.
13. Mesmo aparelho: preservado o token existente de posse da compra e sua validação no servidor. Refresh e reentrada passaram no QA isolado. O comprador ainda usa o mecanismo existente em localStorage; não foi convertido para cookie HttpOnly nesta rodada.
14. Outro aparelho: não recebe acesso só pelo telefone. Token errado, pedido pendente/falhado/expirado, assinatura expirada e PAID sem entitlement foram recusados nos testes.
15. OTP: provider externo ainda não conectado. Produção respondeu 503 à recuperação, sem fingir envio. Hash/HMAC, expiração, uso único, limites de tentativas e telefone/IP passaram nos testes. Nenhum código enviado em produção.
16. PPV: preparação de dados e autorização interna, **sem produto, checkout ou interface PPV ativos**. `grant_type` separa `subscription`, `ppv` e o contato legado; PPV exige recurso exato e não libera VIP nem renova assinatura. Assinatura não concede PPV.
17. Migração aditiva: `orders` e `entitlements` ganharam `grant_type`, `resource_type`, `resource_id`, mais índice de recurso. Compras existentes mantêm a classificação de assinatura; contato legado é classificado como contato. Reinicialização/migração repetida testada. Nenhuma tabela de serviço duplicada, mídia transferida ou dado real apagado. As seis colunas foram verificadas no schema public após a inicialização da staging.
18. Variáveis configuradas na Vercel, sem registrar valores secretos: `DATABASE_URL`, `PUBLIC_APP_URL`, `ADMIN_ORIGIN`, `FRONTEND_URL`, `SIGILOPAY_BASE_URL`, `SIGILOPAY_PUBLIC_KEY`, `SIGILOPAY_SECRET_KEY`, `VIP_MEDIA_DRIVER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VIP_MEDIA_BUCKET`, `SUPABASE_SIGNED_URL_TTL`, `VIP_MEDIA_SECRET`, `CRON_SECRET`, `ADMIN_ACCESS_SECRET`, `ENABLE_TELEGRAM_BOT`, `PGPOOL_MAX`. Produção usa `NODE_ENV=production` e `PAYMENT_PROVIDER=sigilopay`; preview usa desenvolvimento/mock e não possui rota de aprovação manual.

O arquivo local correto continua sendo `backend/.env`; o local permanece mock. O callback local de diagnóstico aponta para staging. Em produção não foi configurado esse override: o callback deriva de `PUBLIC_APP_URL`.

Supabase: conexão real OK; tabelas de pedidos, grants, sessões, recuperação, posts e admin verificadas. Bucket `vip-joice` encontrado com `public=false`. Nenhum upload automático.

## 19–25. Validação e publicação

19. `npm test`: passou, incluindo SQLite, PostgreSQL/PGlite, provider, autorização, CRUD/admin, recuperação, grant scope e regressões existentes.
20. `npm run check`: **72 arquivos JavaScript**, passou.
21. `npm run audit:security`: **379/379**, passou. Teste adicional comprova que `/api/dev/orders/:id/pay` não existe quando `VERCEL=1`, mesmo em mock. Rotas de código e env devolvem 404.
22. QA local em 320/375/390/430/768/1280: checkout mock, QR, cópia, confirmação, refresh, retorno, bloqueio de outro navegador, likes e VIP aprovados. HOME swipe: 12 combinações de largura/tipo (3 fotos, foto+vídeo, 2 vídeos), com arraste, contador, dots, CTA, scroll vertical e zero overflow. UI administrativa condicional testada no navegador para visitante/admin, em HOME/VIP. Produção: HOME e formulário real revisados nos seis tamanhos; VIP anônimo bloqueado; admin anônimo redirecionado ao login; zero submissões de PIX nesse QA.
23. Staging: https://privacy-joice-staging.vercel.app — mock. Produção: https://privacy-joice.vercel.app — SigiloPay. Deploy de produção `dpl_EFwGpDDekgYgYYANnqbeYUUz8bU5`. API health 200; webhook inválido 401; VIP anônimo 403; API administrativa anônima 401; fontes/env e rota dev 404. Bucket privado confirmado.
24. Compra real de R$ 9,90: **NÃO realizada**. A resposta real do diagnóstico foi rejeição por documento; não se confunde com um PIX pago e conciliado.
25. Pendências reais: geração com documento válido, pagamento bancário, recebimento de webhook legítimo e liberação VIP em produção; login administrativo real via Supabase com a conta da proprietária; provedor OTP; performance das imagens de perfil em rede lenta; métricas de campo INP. O QA de conteúdo desbloqueado usou acesso isolado/mock, não uma compra real.

O deploy exigiu corrigir instalação de dependências, carregar Telegram somente quando utilizado e restringir a saída estática da Vercel. Os três deployments iniciais defeituosos foram removidos. O diretório público do build contém somente o selo, e as demais rotas passam pelo Express/allowlist. O cron foi ajustado para `0 3 * * *` (diário, 03h UTC) por limite do plano Hobby; o controle de expiração da autorização continua sendo feito em cada acesso. Não há SQLite como persistência na Vercel.

## Performance — resultados medidos

Chrome headless por Playwright/CDP, staging real, cache desabilitado, viewport 390×850, download 1,6 Mbps, upload 750 Kbps, latência configurada de 150 ms e CPU 4× mais lenta. Uma amostra por largura antes e depois; valores de laboratório, sujeitos a variação. Não são métricas de campo. URLs `data:` excluídas dos bytes/contagem HTTP; redirecionamentos agrupados pelo identificador de requisição CDP.

| Métrica | Antes | Depois |
|---|---:|---:|
| LCP | 8.556 ms | 8.564 ms |
| CLS | 0,00457 | 0,00457 |
| Tempo excedente em long tasks na janela observada | 90 ms | 89 ms |
| Bytes HTTP observados | 1.964.230 | 1.947.098 |
| Requisições HTTP observadas | 24 | 23 |
| JavaScript transferido | 29.890 B | 17.812 B |
| CSS transferido | 23.720 B | 20.058 B |
| Imagens transferidas | 1.846.617 B | 1.845.237 B |
| Vídeo no carregamento inicial observado | 0 B | 0 B |

1–2. Baseline e medição posterior acima: redução total de 17.132 B, aproximadamente 0,87%; redução de JS de aproximadamente 40,4%. **Sem melhora demonstrada de LCP na condição lenta.**
3. Lighthouse não executado; usadas medições diretas CDP/PerformanceObserver e Network.
4–5. LCP e CLS acima. Em outras larguras, sem throttle, o LCP posterior ficou entre 2,09 e 4,62 s. CLS ainda alcançou 0,171 em 320 e 0,133 em 768: a meta não foi atingida em toda a matriz.
6. INP não medido em campo; a soma de long tasks acima não deve ser chamada de TBT Lighthouse.
7–11. Bytes, requests, JS, imagens e vídeo na tabela. A ausência de vídeo nessa primeira janela não valida todo o consumo ao rolar o feed; o teste de teaser/carrossel usou derivados sintéticos isolados.
12. Maior gargalo: as duas imagens atuais de capa/avatar somam cerca de 1,82 MB e dominam os bytes. Fontes usam cinco pesos; não foram trocadas para não modificar o visual aprovado. O JSON de previews transferiu cerca de 17,7 KB com Brotli, sem justificar paginação nesta medição.
13. Otimização aplicada: visitante não baixa `admin-mode.js` nem `admin-mode.css`. Um loader pequeno consulta a sessão e carrega o editor apenas para admin. A resposta de sessão é reutilizada, sem uma segunda consulta do editor. Não foram alterados crop, carousel, teaser, likes, mídias ou upload.
14. Arquivos da otimização: `admin-loader.js`, `admin-mode.js`, `index.html`, `vip.html`, allowlist de `backend/server.js`, includeFiles de `vercel.json` e testes associados.
15. Sem overflow/erros JavaScript na matriz; checkout, swipe, likes e bloqueios revalidados. Comparação antes/depois, após fontes e imagens carregadas, encontrou geometria idêntica de perfil, capa, avatar, nome, bio e abas nos seis tamanhos. CSS visual e geometria de crop não foram alterados. HTML, CSS, JS e JSON da staging mostraram Brotli; não há compressão adicional de JPEG/vídeo no servidor.
16. Não medidos: Lighthouse, INP real de usuários, desempenho de um comprador real desbloqueado, rede de uma operadora física. Não criadas novas derivadas responsivas de capa/avatar; isso continua sendo a principal oportunidade. O redimensionamento nativo do Supabase é [documentado para Pro ou superior](https://supabase.com/docs/guides/storage/serving/image-transformations); não foi ativado plano pago nem alterada a arquitetura de Storage.

## Compra controlada: próximo passo manual

1. Abra https://privacy-joice.vercel.app no navegador que usará para conferir o acesso.
2. Escolha apenas o plano mensal de R$ 9,90.
3. Preencha seus dados reais e o documento válido **no próprio checkout**, não no chat.
4. Gere um único PIX; confira o valor e o destinatário no banco antes de pagar. Se ocorrer erro de geração, registre a mensagem e não repita indiscriminadamente.
5. Pague pelo seu aplicativo bancário. Mantenha a página aberta para receber a confirmação.
6. A liberação só estará comprovada quando o pagamento for confirmado pelo webhook, o pedido estiver PAID, existir exatamente um entitlement ACTIVE e o botão abrir o VIP.
7. Confira refresh, fechar/reabrir no mesmo navegador e bloqueio em uma janela anônima. Avise após o pagamento para conferirmos os registros no backend sem expor seu token.

Webhook esperado: https://privacy-joice.vercel.app/api/payments/webhook . Não aprovar manualmente a compra nem simular webhook em produção para declarar sucesso.

Evidências detalhadas ficam em `backend/.test-runs/` (ignoradas pelo Git/deploy). O snapshot desta rodada inclui relatórios de QA sem env, chaves, bancos, dependências ou mídias privadas. Nenhuma alteração na Ayla.
