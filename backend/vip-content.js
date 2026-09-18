/**
 * CONTEÚDO DA ÁREA VIP.
 *
 * FALLBACK LEGADO. Novas publicações são gerenciadas em /admin.
 * Consulte ADMIN-CONTENT.md para importar estes registros como rascunhos.
 *
 * Trocar imagem, trocar legenda, reordenar, acrescentar ou remover post é só
 * editar esta lista — o layout não é tocado.
 *
 * O `source` é o caminho da mídia, e o mesmo campo serve nos dois ambientes:
 *
 *   VIP_MEDIA_DRIVER=local      → arquivo dentro de uma das pastas privadas
 *                                 (VIP_MEDIA_DIRS: Area_membro/, Midias_Bloqueadas/)
 *   VIP_MEDIA_DRIVER=supabase   → object path dentro do bucket PRIVADO
 *                                 (ex.: 'joice/post-01.jpg')
 *
 * Em nenhum dos dois o arquivo é servido como estático: ele sai por um link
 * assinado de curta duração, e só para quem tem assinatura ativa.
 *
 * `draft: true` esconde o post do feed — use nas vagas que ainda não têm
 * arquivo. No driver local, post cujo arquivo não existe também é omitido
 * (o servidor lista os que faltam no boot).
 */

// Default profile until /admin → Perfil is saved. Shared by HOME and VIP.
const profile = {
  name: 'Joice',
  username: '@_johhh.of',
  verified: true,
  // Localização exibida no perfil (com o pino, abaixo da bio).
  location: 'Santa Catarina - BRA',
  avatar: '/avatar.jpg',
  cover: '/cover.jpg',
  // Para acrescentar detalhes (altura, número do pé), escreva direto na frase.
  bio: 'Oii sou a joice >< 20 anos.. Aqui gosto de mostrar meu outro lado... '
    + '(Sexting, pack, avaliação, personalizado etc..) To online todos os dias... :3 vem ?',
  /**
   * Números mostrados no perfil e nas abas.
   *   mídias  = photos + videos (calculado, não precisa escrever)
   *   posts   = o contador da aba "Postagens"
   * São os números que você declara; edite à vontade.
   */
  stats: { posts: 139, photos: 67, videos: 124, likes: '12,8 mil' }
};

/** Tipos aceitos: 'image' | 'video' | 'cta' (bloco de chamada, sem mídia). */
const posts = [
  { id: 1, type: 'image', source: 'Area_membro/0d43266a68de4f6398771f421cdc2ab6.jpeg',
    caption: 'bom dia pra quem merece 😽', likes: 318, comments: 38 },

  { id: 2, type: 'video', source: 'Midias_Bloqueadas/565802ff-60bd-482f-bb3f-7a7ca2a48dbc.mp4',
    caption: 'gravei esse ontem de madrugada, não consegui dormir 🙈', likes: 472, comments: 74 },

  { id: 3, type: 'video', source: 'Midias_Bloqueadas/6ef0d710-e591-4e27-8ca5-d06588b52907.mp4',
    caption: 'me conta o que você faria aqui 👀', likes: 689, comments: 91 },

  { id: 4, type: 'video', source: 'Midias_Bloqueadas/a1a71c2a-69d3-4f82-95d1-406581ecdcdf (2).mp4',
    caption: 'esse aqui eu nunca postei em lugar nenhum', likes: 842, comments: 128 },

  // Bloco de chamada no meio do feed. Não vende nada por enquanto.
  { id: 5, type: 'cta', variant: 'whatsapp',
    title: 'Ainda mais perto.',
    text: 'O contato direto está chegando ao clube. Um novo jeito de ficar pertinho.',
    button: 'Conhecer a novidade ↗' },

  { id: 6, type: 'video', source: 'Midias_Bloqueadas/c24b810d-b0cd-4cfc-b815-8600bdb79f93.mp4',
    caption: 'saindo do banho 💦', likes: 956, comments: 63 },

  { id: 7, type: 'video', source: 'Midias_Bloqueadas/cd621ae2-b16a-4952-9fbc-65642a737736.mp4',
    caption: 'quase não postei esse aqui…', likes: 563, comments: 57 },

  { id: 8, type: 'video', source: 'Midias_Bloqueadas/dba058a0-46d0-466e-97d4-a2d52d260a80.mp4',
    caption: 'sem filtro, sem edição 🤍', likes: 734, comments: 44 },

  /* ------------------------------------------------------------------------
   * VAGAS PRONTAS PARA AS PRÓXIMAS MÍDIAS.
   *
   * Suba o arquivo, ajuste o `source` e a legenda e REMOVA o `draft: true`.
   * Enquanto o draft estiver marcado, o post não aparece no feed.
   *
   *   local:     source: 'Area_membro/minha-foto.jpg'
   *   supabase:  source: 'joice/post-09.jpg'
   * ---------------------------------------------------------------------- */
  { id: 9,  type: 'image', source: 'Area_membro/midia-09.jpg', caption: '', likes: 0, comments: 0, draft: true },
  { id: 10, type: 'image', source: 'Area_membro/midia-10.jpg', caption: '', likes: 0, comments: 0, draft: true },
  { id: 11, type: 'video', source: 'Area_membro/midia-11.mp4', caption: '', likes: 0, comments: 0, draft: true },
  { id: 12, type: 'image', source: 'Area_membro/midia-12.jpg', caption: '', likes: 0, comments: 0, draft: true },
  { id: 13, type: 'video', source: 'Area_membro/midia-13.mp4', caption: '', likes: 0, comments: 0, draft: true },
  { id: 14, type: 'image', source: 'Area_membro/midia-14.jpg', caption: '', likes: 0, comments: 0, draft: true },
  { id: 15, type: 'video', source: 'Area_membro/midia-15.mp4', caption: '', likes: 0, comments: 0, draft: true },

  // Fechamento do feed.
  { id: 16, type: 'cta', variant: 'whatsapp',
    title: 'Obrigada por ficar.',
    text: 'Esse espaço fica mais especial com você. Tem novidade a caminho.',
    button: 'Ficar por dentro ↗' }
];

module.exports = { profile, posts };
