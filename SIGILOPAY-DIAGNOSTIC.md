# Diagnóstico real A–D — 14/09/2026

Executado `node backend/scripts/test-sigilopay-minimal.js --all` diretamente contra `POST https://app.sigilopay.com.br/api/v1/gateway/pix/receive`, sem importar SigiloPayProvider, services ou banco. Cada requisição usou identifier único, R$ 9,90, callback HTTPS e somente os campos abaixo. Documento totalmente omitido. Nenhum CPF ou dado de cliente inventado.

| Teste | Client enviado | HTTP | Resposta real |
|---|---|---:|---|
| A | name, email, phone | 422 | `GATEWAY_INVALID_ARGUMENT`: `Required document.` |
| B | name, phone | 400 | `GATEWAY_INVALID_DATA`: client.email obrigatório nas duas alternativas de validação; client.document também aparece em uma alternativa |
| C | phone | 400 | `GATEWAY_INVALID_DATA`: client.name e client.email obrigatórios nas duas alternativas; client.document também aparece em uma alternativa |
| D | client completamente omitido | 400 | `GATEWAY_INVALID_DATA`: client obrigatório, esperado object, recebido undefined |

Nenhum transactionId retornado. Nenhuma cobrança teve criação confirmada. Nenhum pagamento realizado. Nenhuma order criada na aplicação.

**Menor payload aceito: não encontrado entre A/B/C/D.** Não seria correto afirmar que o payload completo foi aceito, pois ele não foi enviado neste diagnóstico. O requisito de documento foi comprovado pela resposta real A para a rota/conta atual, não por validação local.

Nome e e-mail foram apontados como obrigatórios pela API em B/C. A obrigatoriedade isolada de telefone no gateway não foi determinada: D omite todo client. Celular permanece requisito do nosso produto.

Campos preservados:
- Produção/SigiloPay: nome, e-mail, celular, CPF/CNPJ.
- Desenvolvimento/mock: somente celular; campos restantes ocultos e desabilitados.

Nenhuma alteração em produção, checkout, provider, segurança ou autorização nesta rodada. Telefone sozinho não concede acesso; PAID mais entitlement ACTIVE continuam obrigatórios.

Configuração: `E:\Privacy_Joice\backend.env` possui as duas chaves, mas não contém os três dados de teste nem callback. O arquivo realmente lido pelo backend e pelo script é `E:\Privacy_Joice\backend\.env`; nele todas as variáveis necessárias estavam configuradas com os dados autorizados. Nenhum segredo impresso ou copiado para o relatório.

O script ganhou apenas a opção explícita `--all`. Sem essa opção continua interrompendo os testes progressivos quando A não confirma criação. Falha de transporte continua encerrando a execução sem retry, mesmo com `--all`.

Respostas integrais, já sem credenciais/tokens: `backend/.test-runs/sigilopay-abcd.json`. QA e screenshots da rodada: `backend/.test-runs/checkout-minimal-mock-qa.log`, `checkout-minimal-production-qa.log`, `buyer-phone-{largura}.png` e `production-checkout-{largura}.png`. Este relatório complementa o diagnóstico anterior em PRODUCTION-VALIDATION.md; os testes B/C/D agora foram efetivamente executados.
