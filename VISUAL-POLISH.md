# Polimento visual da Joice

Checkpoint anterior às alterações: `b6f2a0b`, tag `checkpoint-before-visual-polish`.

## Interface

- Home e VIP usam tons quentes, cartões claros, detalhes terracota e títulos editoriais.
- Plano mensal destacado com R$ 9,90, referência riscada R$ 19,90 e badge 50% OFF. Os preços do catálogo não foram alterados.
- Checkout mantém o fluxo existente, com melhor organização do QR, código, avisos e confirmação.
- VIP apresenta filtros, legendas, curtidas e ação de mimo. As contagens são ilustrativas; a reação individual fica no localStorage deste navegador, sem sincronização entre dispositivos.
- Mimo é apenas um modal informativo. Não cria pedido nem cobrança.

## Prévias públicas

As sete imagens em `previews/` são derivados pequenos com desfoque aplicado ao arquivo. A home nunca precisa carregar os originais privados para produzir o blur.

Para regenerar, com as mídias originais locais e dependências de desenvolvimento instaladas:

```powershell
cd E:\Privacy_Joice
node backend/scripts/build-previews.js
```

O FFmpeg é dependência de desenvolvimento. O deploy inclui os JPEGs prontos e não executa a conversão. O servidor disponibiliza somente os sete caminhos explícitos. As mídias do VIP continuam sob a autorização existente.

## Validação

- `npm.cmd test`: suíte existente aprovada, incluindo pagamentos, persistência, VIP e integração simulada do armazenamento Supabase.
- `npm.cmd run audit:security`: 213 verificações aprovadas.
- `npm.cmd run check`: 33 arquivos JavaScript aprovados, incluindo `vip.js`.
- Navegador local: desktop, checkout a 390 px e home/VIP a 320 px; sem overflow horizontal nas telas verificadas.
- Compra exclusivamente mock: geração, confirmação visual pelo polling e entrada no VIP.
- Curtir, recarregar e filtrar mantém a reação; modal de mimo abre e fecha por botão/Escape.
- Sete prévias carregadas; grade de mídias revisada; nenhum erro de console observado.

Nenhuma cobrança real, ativação de WhatsApp ou alteração no gateway, webhook, banco e autorização foi realizada nesta rodada. Nenhum arquivo de outro projeto foi acessado.

## Arquivos desta rodada

`index.html`, `style.css`, `app.js`, `vip.html`, `vip.css`, `vip.js`, `backend/vip-content.js`, `backend/server.js`, `backend/package.json`, `backend/package-lock.json`, `backend/tests/check.js`, `backend/scripts/build-previews.js`, `previews/post-01.jpg` a `post-07.jpg`, `vercel.json`, `.vercelignore` e este documento.

---

# Rodada final de acabamento

Refinamento da interface social já aprovada — sem nova identidade visual, sem redesenho. A camada final em `style.css` e `vip.css` ajusta apenas acabamento; as camadas anteriores permanecem intactas.

## HOME

- **Separação dos cartões.** Borda discreta de 1 px em `#ececec`, raio de 15 px, sem sombra, fundo branco, respiro fixo de 12 px entre publicações e recuo lateral de 10 px. Os posts não ficam grudados nem abrem buraco na coluna.
- **Cabeçalho de post pequeno.** Avatar de 32 px, nome em 12,5 px, arroba em 11 px, marcador de tipo à direita.
- **Prévia bloqueada.** Desfoque de 6 px com leve realce de saturação: as cores e o clima da foto continuam perceptíveis. O véu escuro foi reduzido (de 7% a 24% de preto) para a mídia não virar retângulo escuro. Cadeado discreto de 34 px, texto central em uma linha limpa e CTA laranja compacto de 40 px em pílula.
- **Planos em pílula.** Largura total, raio de 26 px, fundo laranja no plano em destaque e pêssego nos demais, texto escuro. Duração à esquerda, preço à direita; 62 px de altura no destaque e 54 px nos outros. Nenhum plano virou cartão.
- **Preços inalterados:** 1 mês R$ 9,90 com 50% OFF e R$ 19,90 riscado; 3 meses R$ 19,90; 6 meses R$ 39,90.
- Nenhuma contagem de curtidas fabricada aparece na página de venda. O rodapé de cada prévia diz apenas "Conteúdo exclusivo · Só para assinantes".

## VIP

Mesma coluna de 430 px, mesmo raio de 15 px, mesma borda, mesma ausência de sombra e o mesmo respiro de 12 px da HOME — conferidos lado a lado em 320, 390, 430 e 768 px. Cabeçalho de post, tipografia, cinzas, iconografia e barra de ações seguem a HOME. Feed social compacto, mídia grande, sem aparência de painel ou de blog.

As curtidas do feed antigo continuam sendo contagens ilustrativas de desenvolvimento, marcadas como tal no próprio botão. Publicações do painel usam contagem real, começando em zero.

## Validação desta rodada

- `npm.cmd run check`: 42 arquivos JavaScript aprovados.
- `npm.cmd test`: suíte completa aprovada, incluindo 65 verificações de admin/conteúdo.
- `npm.cmd run audit:security`: 263 verificações aprovadas.
- Navegador (Chromium headless) em 320, 390, 430, 768 e 1280 px: sem overflow horizontal em HOME, VIP e painel; nenhum erro de página.
- HOME com prévias do painel: nenhuma ocorrência de `Area_membro`, `Midias_Bloqueadas`, `media_path` ou rota de mídia assinada no DOM ou nas requisições. As imagens entregues ao visitante têm 64×80 pixels de origem.

## Arquivos desta rodada

`index.html`, `style.css`, `app.js`, `vip.html`, `vip.css`, `backend/server.js`, `backend/admin.js`, `backend/admin-ui/index.html`, `backend/admin-ui/app.js`, `backend/admin-ui/style.css`, `backend/services/preview-image.js` (novo), `backend/services/vip-posts.js`, `backend/db/schema.content.sql`, `backend/db/database.js`, `backend/db/postgres.js`, `backend/tests/admin.js`, `backend/tests/content-postgres.js`, `backend/tests/migration.js`, `backend/tests/security-audit.js`, `ADMIN-CONTENT.md` e este documento.

---

# Estrutura em blocos e contato

Reorganização da HOME e do /vip na mesma divisão da plataforma de referência, mantendo o fundo branco, a tipografia Inter e a paleta laranja já aprovadas.

## Divisão da página

A coluna deixou de ser uma folha branca contínua: o fundo passou a um cinza muito claro e cada parte virou um cartão branco de borda discreta, separado por 10 px. A ordem é a mesma da referência:

1. **Perfil** — capa, avatar, números, nome, @, bio, "Ler mais", localização opcional, redes e os botões **Mimo** e **Chat**.
2. **Oferta de assinatura** — título com ícone, recado da Joice em balão, selo "Economize 50%" encostado no botão, botão largo "Assinar agora R$ 9,90" e "Preço original R$ 19,90" riscado à direita.
3. **Assinaturas** — cabeçalho recolhível e as pílulas de 3 e 6 meses, duração à esquerda e preço à direita.
4. **Publicações** — abas "205 Postagens / 458 Mídias" em cartão próprio e cada publicação em seu cartão.

Os contadores das abas saem dos números do próprio perfil em `app.js` (`creator.stats`), os mesmos já exibidos na linha de estatísticas. A linha de localização só aparece quando `creator.location` for preenchida.

O `/vip` recebeu a mesma divisão: perfil em cartão (com Mimo e Chat), filtros em cartão e publicações em cartões — as duas telas continuam medindo igual (coluna 430 px, raio 15 px, borda 1 px `#ececec`, gap 12 px entre publicações).

## Mimo e Chat

**Mimo** abre um aviso informativo nas duas telas. Não cria pedido, não gera cobrança e não toca no gateway.

**Chat** abre a conversa no WhatsApp. O número fica só no servidor, em `WHATSAPP_NUMBER` (dígitos com DDI e DDD, 10 a 15 dígitos; pontuação é ignorada), com `WHATSAPP_MESSAGE` opcional para a mensagem inicial. `GET /api/contact` monta o link; sem número configurado devolve `null` e o botão mostra o mesmo aviso de "em breve". Nenhum número aparece no HTML, no JavaScript ou no repositório.

O chat simulado da HOME foi retirado: a conversa de mentira e o botão "DESBLOQUEAR POR R$ 7,00" não fazem mais sentido com o Chat indo direto para o WhatsApp. O botão flutuante "Fale comigo" também saiu — ele duplicava o Chat e cobria o preço de 6 meses no celular. O produto `whatsapp_unlock` continua desativado, sem alteração de preço.

## Validação desta rodada

- `npm.cmd run check`: 42 arquivos. `npm.cmd test`: suíte completa. `npm.cmd run audit:security`: 267 verificações.
- Novos testes: link montado a partir do número, número inválido vira `null`, consulta ao contato não cria pedido e nenhum número do WhatsApp presente em `index.html`/`app.js`.
- Navegador em 320, 390, 430, 768 e 1280 px: sem overflow horizontal e sem sobreposição em HOME, /vip e painel.
- Chat verificado nas duas telas: abre `https://wa.me/<número>` com a mensagem pré-preenchida.

---

# Perfil único e limpeza do feed

- **Bio, nome e números agora têm uma fonte só.** O objeto `profile` em `backend/vip-content.js` alimenta as duas telas: a HOME lê por `GET /api/profile` e o /vip recebe no próprio payload. Editar lá muda nas duas ao mesmo tempo — não existe mais um texto para cada. O `index.html` mantém uma cópia estática apenas como primeira pintura e plano B se o backend não responder; um teste em `tests/run.js` falha se as duas divergirem.
- **Bio nova:** nome "Joice", 20 anos, no formato do perfil de referência. Uma bio só, recolhida em três linhas pelo CSS e aberta pelo "Ler mais" — a versão curta separada foi removida justamente porque podia divergir da do /vip.
- **Números:** 43 fotos · 12 vídeos · 12,8K curtidas · 18 postagens · 55 mídias (soma de fotos e vídeos). Ficam todos em `stats`, no mesmo objeto do perfil.
- **Feed mais limpo:** saiu a faixa "▶ VÍDEO EXCLUSIVO" / "01 / MEU DIÁRIO" sobre a mídia na HOME e saiu a etiqueta FOTO/VÍDEO do cabeçalho das publicações nas duas telas.
- **Oferta:** "Últimas vagas disponíveis dessa promoção!".
- **Marca:** o ponto laranja saiu do logotipo no topo e no rodapé. O rodapé da HOME ficou só com o aviso de maiores de 18 e o atalho "Já sou assinante".
- O /vip ganhou a mesma linha de números do perfil público, no mesmo formato.

---

# Identidade do perfil e moldura padrão das mídias

## Perfil

- **Foto de perfil nova**, recortada em quadrado de 480 px centrado no rosto (`avatar.jpg`).
- **Saiu o selo "EXCLUSIVO".** No lugar, só o ponto verde de online, encostado na borda do avatar a 45° — como na referência. O avatar continua abrindo a assinatura ao clique.
- **Verificado mais delicado:** 15 px no perfil e 12 px nos cabeçalhos de publicação (era 18/14), traço do "v" mais fino e azul um pouco mais suave (`#3B9BF0`).
- **Nome e @ mais finos:** nome em 20 px/700 com `letter-spacing -.45px` em `#16161a`; @ em 12,5 px/500 em `#97a0ae`. Cartões com sombra de 1 px quase imperceptível.

## Ações abaixo da mídia (área de assinante)

Coração com a contagem de curtidas e o cifrão, lado a lado, só ícones — o botão "Mandar mimo" com texto virou o ícone de cifrão. As curtidas continuam iguais: reais nos posts do painel, e a contagem do feed antigo segue marcada como ilustrativa.

## Moldura padrão das mídias

Toda publicação, na HOME e no `/vip`, ocupa exatamente o mesmo retângulo **4:5** — o formato que melhor aproveita a tela do celular sem empurrar as ações para fora. Nenhuma publicação tem altura diferente da outra.

A mídia aparece **inteira** (`object-fit: contain`), centralizada, e a sobra das laterais (ou de cima e de baixo) é preenchida com **um quadro da própria mídia, borrado** — nada de tarja preta.

Como o preenchimento é feito, sem custo de banda:

- Um `canvas` de 36×45 atrás da mídia recebe **um único quadro**, recortado em "cover", e o CSS aplica o desfoque. Não há segundo download nem um segundo vídeo decodificando.
- Em vídeo, o primeiro quadro costuma ser escuro (fade-in) — justamente o que queremos evitar. Então o quadro usado é o de `min(1s, duração/4)`, e o vídeo **volta para o zero** logo depois: quem apertar play vê desde o começo.
- Em produção a mídia vem por redirect para o Storage, o que "contamina" o canvas. Desenhar continua permitido (só a leitura de pixels não, e não lemos). Se ainda assim falhar, o fundo neutro claro do CSS assume e nada quebra.

## Validação

- `npm.cmd run check`, `npm.cmd test` e `npm.cmd run audit:security` (267 verificações) aprovados.
- Molduras medidas no navegador: as cinco publicações do feed de teste com 366×458 px idênticos em 390 px de largura.
- Efeito conferido com uma foto panorâmica (1600×720) dentro da moldura 4:5: imagem inteira ao centro, continuação borrada acima e abaixo.
- Preenchimento a partir de vídeo verificado com um arquivo que o navegador de teste decodifica: quadro pintado com conteúdo real e vídeo retornando a zero.

---

# Correção: perfil sem reinício e mídias realmente padronizadas

## O perfil não depende mais de reiniciar o servidor

O Node carrega um módulo uma vez e guarda em memória. Editar `backend/vip-content.js` não mudava nada no `/vip` até derrubar e subir o processo de novo — por isso a bio antiga ("Aqui é só nosso") continuava aparecendo mesmo com o arquivo novo no disco.

Agora, **fora de produção**, `/api/profile` e `/api/vip/:orderId` descartam o cache do módulo a cada leitura (`liveVipContent()`). Salvou o arquivo, recarregou a página, está lá. Em produção cada deploy já sobe um processo novo, então lá o módulo continua carregado uma vez só.

Verificado: com o servidor no ar, trocar o nome no arquivo e chamar `/api/profile` devolveu o nome novo sem reiniciar nada.

## Mídias: preenchem a moldura, sem sobra

O preenchimento borrado caía ora nas laterais, ora em cima, porque cada arquivo tem uma proporção — e o resultado era cada publicação com uma cara diferente. Trocado por **`object-fit: cover`**: a mídia preenche a moldura 4:5 inteira, na HOME e no `/vip`.

Consequência: não existe mais área sobrando para preencher. Nenhuma tarja preta, nenhuma faixa borrada aparecendo num lado diferente a cada post, e todos os cartões com exatamente o mesmo tamanho. O canvas de preenchimento e a função `paintFill` foram removidos — sem código morto e sem o seek de vídeo que eles custavam.

Medido no navegador a 390 px: as seis publicações do feed de teste com **366×458 px idênticos**, incluindo uma foto panorâmica (1600×700) e um vídeo largo — os dois preenchendo a moldura como as demais.

O recorte é centralizado. Para escolher o enquadramento de uma publicação específica, recorte a mídia antes de enviar pelo painel.

---

# Acabamento premium, capa e barra de abas

## Capa

A foto de capa foi reenquadrada: a porta cinza que ocupava a borda esquerda saiu do corte. O novo arquivo é um recorte horizontal de 1098×450 do original, na proporção exata da faixa (≈2,44:1), centrado no rosto. O original não foi alterado além do recorte — nenhum filtro, nenhuma edição.

A capa também termina num **degradê suave** para o branco do cartão, em vez de um corte seco.

## Cantos e sombra

Raio dos cartões de 15 para **18 px**, borda em `#eceae8` e uma sombra curta e baixa (`0 1px 2px` + `0 10px 24px -16px`) — o cartão descola do fundo sem parecer pesado. O fundo da coluna passou de cinza frio para um off-white morno (`#f6f4f2`), que é o que dá o ar premium junto com a sombra.

Também nesta passada: ícones sociais em botões redondos de 34 px, Mimo e Chat com 46 px de altura e raio 12 px, linha de números mais arejada.

## Barra de abas do /vip

Os filtros "Tudo / Fotos / Vídeos" saíram. No lugar, a **mesma barra da página inicial**: cartão branco com duas abas, contadores do perfil e a seleção sublinhada em laranja.

- **Postagens** — o feed, com tudo junto, sem separar foto de vídeo.
- **Mídias** — a grade de duas colunas, só a mídia, sem cabeçalho nem legenda.

Os contadores das abas vêm dos mesmos números do perfil que a HOME usa, então as duas telas mostram os mesmos valores.

## Rodapé

O rodapé da HOME tinha 105 px de folga embaixo, reservados para o botão flutuante que já foi removido. Agora tem **81 px de altura total**, com o aviso de +18 e o atalho para quem já assina.

## Validação

`npm.cmd run check`, `npm.cmd test` e `npm.cmd run audit:security` (267 verificações) aprovados. Sem overflow horizontal em 320, 390, 430, 768 e 1280 px, na HOME e no /vip.
