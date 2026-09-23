# Revisão do editor e feed

- Seleção de arquivos preenche a primeira linha vazia, sem gerar item inválido.
- Botões de edição acompanham os posts adicionados por paginação. IDs conhecidos nunca usam outro post como fallback.
- Publicações antigas sem linha de carrossel podem ser salvas novamente.
- Novo enquadramento padrão 4:5; Original e 1:1 continuam disponíveis. O primeiro item determina a moldura do carrossel e todos os itens ocupam sua largura.
- No editor da própria página, “Público, sem blur” libera todas as mídias da publicação no feed público. Desmarcado mantém a prévia protegida. Publicações existentes permanecem privadas por padrão.
- A rota pública confere publicação, arquivamento, presença na HOME, consentimento de publicação pública e pertencimento da mídia a cada requisição. URLs do Storage já emitidas podem continuar válidas até expirar.
- Pequenos ajustes de espaçamento, bordas e legendas na HOME, VIP e editor.

## Validação

Verificação de sintaxe e suíte PostgreSQL local com PGlite. Testes cobrem liberação pública, retorno ao privado, rascunhos, arquivamento, mídia de outro post e edição de registro anterior ao carrossel.

## Entrega

Não foi realizada implantação nem alteração no banco de produção. A migração aditiva cria public_media com padrão 0 na inicialização. A opção nova está no editor sobre a HOME/VIP; o painel administrativo antigo mantém o valor existente.

A revisão visual em navegador e o envio real ao Supabase ainda precisam de validação no ambiente de prévia com acesso configurado.
