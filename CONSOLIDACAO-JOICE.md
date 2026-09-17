# Consolidação JOICE

Base oficial: E:\Privacy_Joice.
Vercel vinculado: privacy-joice (prj_M1n8HyFzN4VueoazWmwuENjyQ4c3).
Supabase preservado: mycianocquegnhaxpsxh; bucket privado vip-joice.
Preview: https://privacy-joice-gtavbzhrk-joaocdi44-1394s-projects.vercel.app
Deployment: dpl_6JbMqVpMSQ1VVfWQyZMHi7Ue1y3v.
Production publicada em dpl_6eqTGMC93798MpCveftKwSKfN6Ta, após validar o Preview. URL: https://privacy-joice.vercel.app.

## Reconciliação funcional
| Funcionalidade | Local inicial | Production inicial | Staging inicial | Resultado no Preview oficial |
|---|---|---|---|---|
| Conta BUYER pós-pagamento e login automático | Completo | Fluxo anterior por celular | Completo | Preservado e validado |
| Login / Meu acesso / recuperação por email | Completo | Ausente no formato BUYER | Completo | Preservado; recuperação real validada no Preview e em Production |
| WhatsApp permanente separado do VIP | Completo | UI parcialmente antiga | Completo | Compra e duas reaberturas validadas |
| Carrossel e retry sem perda de itens | Corrigido | Versão anterior | Corrigido | Preservado |
| Mimo, escassez e formulários antigos | Removidos | Ainda presentes | Removidos | Removidos |
| ADMIN / crop / perfil / feed / likes | Completo | Completo | Completo | Preservado |
| Perfil e conteúdo privado real | Código suporta | Perfil + 12 posts | Sem perfil salvo, 1 post privado exclusivo + legado local | Perfil oficial + 13 posts privados; legado de demonstração arquivado, sem apagar arquivos |
| SyncPay / SigiloPay / webhook | Completo | Completo | Completo | Código preservado; Preview somente simulado |
| Acesso de compras anteriores | Compatibilidade incompleta na UI | Funcional | Compatibilidade incompleta na UI | Credencial anterior ainda validada pelo servidor |
| Exclusão de mídia compartilhada | Verificação no schema atual | Verificação no schema atual | Verificação no schema atual | Preview também protege objetos referenciados por Production |

94/95 arquivos do último staging eram idênticos à base local; diferença apenas no relatório. Nenhum arquivo de Production estava ausente localmente. Os 17 arquivos diferentes foram obtidos pela API autenticada da Vercel e comparados; as diferenças funcionais são as da matriz acima. Não foi restaurado snapshot nem criada outra base local.

## ENV
Preview: DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VIP_MEDIA_DRIVER=supabase, VIP_MEDIA_BUCKET=vip-joice, SUPABASE_SIGNED_URL_TTL=120 e VIP_MEDIA_SECRET reconciliados. WHATSAPP_NUMBER e WHATSAPP_PRICE=7.90 configurados. BUYER_ACCOUNT_FLOW=true, APP_ENV=staging, PAYMENT_PROVIDER=staging e STAGING_DATABASE_SCHEMA=staging_buyer_accounts_v1.
O schema de Preview já existia e foi reutilizado no MESMO banco. Não foi criado banco/projeto Supabase. Orders simuladas não são migradas para Production.
Origens do Preview derivadas exclusivamente de VERCEL_URL, nunca do Host da requisição. Variáveis de URL antigas foram removidas do escopo Preview.
Production: credenciais SyncPay/SigiloPay e demais segredos existentes preservados. BUYER_ACCOUNT_FLOW, WHATSAPP_NUMBER, WHATSAPP_PRICE, APP_ENV=production e TTL=120 aplicados em Production. A versão de Production foi construída com SyncPay real, conferida sem gerar cobrança e promovida após a aprovação dos testes do Preview.
Local: BUYER_ACCOUNT_FLOW habilitado, credenciais preservadas. Arquivo privado de teste agora aponta ao Preview oficial.

## Testes
- Suíte completa: aprovada; SyncPay mínimo sem PII, preços do backend, assinaturas/idempotência do webhook, grants, separação de contas, carrossel/crop/perfil, migração e adapter PostgreSQL/PGlite.
- Auditoria: 422/422; sintaxe validada.
- Chrome: 320,375,390,430,1280; cadastro, login automático, Meu acesso, VIP, logout/login, recuperação e compatibilidade com compra antiga.
- Preview público: checkout sem PII, compra simulada, cadastro real, VIP, WhatsApp separado reaberto duas vezes sem nova order, layout em cinco larguras.
- Auth/Storage reais no Preview: ADMIN, upload foto/vídeo, carrossel e edição, links temporários; todos os itens VIP resolvem para objetos privados existentes.
- Supabase: token real de recuperação, senha alterada e sessão/senha anteriores revogadas; nenhum email enviado.
- Bloqueio estático: backend/server.js, backend/.env, .env, .env.local, backend/package.json, testes, scripts e snapshots retornam 404.
- Production: contagens preservadas de orders(10), entitlements(2), admin_users(1), posts(12), itens(14), perfil(1). Fixtures criadas para estes testes foram removidas pelos IDs exatos.
Nenhuma cobrança real.

## Encerramento e recuperação
O usuário atualizou a Site URL do Supabase para https://privacy-joice.vercel.app e autorizou o redirect oficial e os Previews da sua conta. A API confirmou os dois redirects. No Chrome, links reais de recuperação abriram o formulário em cada ambiente, trocaram a senha, recusaram a senha antiga e permitiram login BUYER com a nova senha. A entrega em caixa de email não foi testada; os links foram gerados pela API administrativa sem envio.
Após isso, a publicação privada exclusiva do staging e seu item foram incorporados ao catálogo public, preservando os 12 posts anteriores e os objetos existentes no Storage. As contas e compras existentes não foram substituídas. Nenhuma cobrança foi criada por esta tarefa.
A comparação final confirmou o mesmo último deployment do staging, ausência de conteúdo privado exclusivo e todas as ENV necessárias presentes no projeto oficial. A configuração VIP_MEDIA_DIRS, exclusiva do antigo driver local, não foi transferida para o runtime Supabase.
O projeto privacy-joice-account-staging (prj_EqDuJULR0DBIleEmzwXLDQ7ZPG8R) foi removido. A API da Vercel lista somente privacy-joice para JOICE; o domínio antigo retorna 404. O Supabase, Auth, banco, policies e bucket não foram removidos. O schema de teste existente continua sendo utilizado pelo Preview dentro do mesmo banco.
O webhook SyncPay existente foi listado e confirmado: URL https://privacy-joice.vercel.app/api/webhooks/syncpay, event transaction, trigger_all_products true. Foi feita apenas autenticação e consulta, sem cash-in.
Production: accountFlow=true, staging=false, mock=false. Preview: accountFlow=true, staging=true, mock=true. Simulação em Production retorna 404; webhook sem assinatura retorna 401. Login, ADMIN e bloqueios de arquivos privados foram novamente verificados após a remoção.
Nenhuma pendência bloqueante conhecida.

## Arquivos principais desta rodada
api/index.js; vip.js; backend/services/media-cleanup.js; backend/.env.example; backend/tests/preview-consolidation.js; backend/tests/account-browser.js; backend/tests/v1-public.js; backend/tests/v1-staging-real.js; backend/tests/run.js; backend/tests/recovery-browser-real.js. Vínculo .vercel/project.json e envs privadas atualizados.
