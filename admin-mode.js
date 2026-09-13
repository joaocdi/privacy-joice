/* ==========================================================================
   MODO ADMINISTRADOR — dentro do próprio site.

   Carregado pela HOME e pelo /vip. Em toda visita pergunta ao backend
   "sou admin?". Para visitante e para assinante comum a resposta é `false` e
   este arquivo não desenha absolutamente nada — a página fica igual.

   Nada aqui é segurança. Esconder botão não protege ninguém: TODA ação passa
   pelos endpoints administrativos que já existiam, que exigem sessão válida e
   token anti-CSRF no servidor. Este módulo é só a interface.

   Reaproveita o backend existente sem criar nada novo:
     GET/PUT  /api/admin/profile     perfil (creator_profiles)
     GET/POST /api/admin/posts       lista e criação
     PUT      /api/admin/posts/:id   edição, ordem, publicar, prévia HOME
     DELETE   /api/admin/posts/:id   arquivar
     POST     /api/admin/uploads     envio em blocos para o bucket privado
   ========================================================================== */

(function adminMode() {
  const BASE = location.protocol === 'file:'
    || (['localhost', '127.0.0.1'].includes(location.hostname) && ['5500', '5501'].includes(location.port))
    ? 'http://localhost:3333' : '';

  let csrf = '';
  let posts = [];
  let uploadMax = 0;
  let storage = '';
  const $ = id => document.getElementById(id);

  /* ------------------------------------------------------------ requisições */

  async function api(route, method = 'GET', body, headers = {}) {
    const options = { method, headers: { ...headers } };
    if (method !== 'GET') options.headers['x-csrf-token'] = csrf;
    if (body !== undefined) {
      options.body = body instanceof Blob ? body : JSON.stringify(body);
      if (!(body instanceof Blob)) options.headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(BASE + '/api/admin' + route, options);
    if (response.status === 401) {
      location.assign('/login?r=' + encodeURIComponent(location.pathname));
      throw new Error('Sessão encerrada.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
    return data;
  }

  /* ------------------------------------------------------- peças de interface */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(label, onClick, className = 'am-btn') {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', async () => {
      node.disabled = true;
      try { await onClick(); } catch (error) { toast(error.message); }
      finally { node.disabled = false; }
    });
    return node;
  }

  let toastTimer = null;
  function toast(text) {
    let box = $('amToast');
    if (!box) { box = el('div', 'am-toast'); box.id = 'amToast'; document.body.append(box); }
    box.textContent = text;
    box.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('is-on'), 3600);
  }

  /* ----------------------------------------------------------------- modal */

  function openSheet(title, build, onSubmit) {
    const overlay = el('div', 'am-sheet-overlay');
    const sheet = el('form', 'am-sheet');
    sheet.noValidate = true;
    const head = el('div', 'am-sheet-head');
    head.append(el('h2', null, title));
    const close = button('Fechar', () => overlay.remove(), 'am-btn am-btn-quiet');
    head.append(close);
    const body = el('div', 'am-sheet-body');
    const status = el('p', 'am-sheet-status');
    const save = el('button', 'am-btn am-btn-primary', 'Salvar');
    save.type = 'submit';
    const foot = el('div', 'am-sheet-foot');
    foot.append(status, save);
    sheet.append(head, body, foot);
    overlay.append(sheet);
    document.body.append(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    new MutationObserver((list, observer) => {
      if (!document.body.contains(overlay)) { document.body.style.overflow = ''; observer.disconnect(); }
    }).observe(document.body, { childList: true });

    const context = { body, status, save, close: () => overlay.remove(), say: t => { status.textContent = t; } };
    build(context);
    sheet.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true; close.disabled = true;
      try { await onSubmit(context); }
      catch (error) { context.say(error.message); save.disabled = false; close.disabled = false; }
    });
    return context;
  }

  function field(parent, label, control, hint) {
    const wrap = el('label', 'am-field');
    wrap.append(el('span', null, label), control);
    if (hint) wrap.append(el('small', null, hint));
    parent.append(wrap);
    return control;
  }

  function input(type, value = '') {
    const node = document.createElement('input');
    node.type = type; node.value = value;
    return node;
  }

  function checkbox(parent, label, checked) {
    const wrap = el('label', 'am-check');
    const node = input('checkbox'); node.checked = Boolean(checked);
    wrap.append(node, el('span', null, label));
    parent.append(wrap);
    return node;
  }

  /* ------------------------------------------------------ envio da mídia */

  /**
   * Manda o arquivo em blocos pelos endpoints administrativos. Os bytes passam
   * pelo nosso backend, que fala com o Storage privado: o navegador nunca vê a
   * chave do Supabase nem a URL de upload.
   */
  async function sendFile(file, say) {
    if (file.size > uploadMax) throw new Error(`Arquivo acima do limite de ${Math.round(uploadMax / 1024 / 1024)} MB.`);
    let upload = await api('/uploads', 'POST', { size: file.size, mime: file.type });
    while (!upload.complete) {
      say(`Enviando mídia: ${Math.round(upload.offset / file.size * 100)}%`);
      const part = file.slice(upload.offset, Math.min(file.size, upload.offset + upload.chunkSize));
      const sent = await api('/uploads/' + upload.id, 'PATCH', part,
        { 'Content-Type': 'application/octet-stream', 'upload-offset': String(upload.offset) });
      upload = { ...upload, ...sent };
    }
    return upload.id;
  }

  /** Amostra minúscula para a prévia da HOME, gerada aqui e validada no servidor. */
  function once(node, event) {
    return new Promise((resolve, reject) => {
      node.addEventListener(event, resolve, { once: true });
      node.addEventListener('error', () => reject(new Error('Não consegui ler esta mídia.')), { once: true });
    });
  }
  async function derive(file) {
    const url = URL.createObjectURL(file);
    try {
      let source, width, height;
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
        await once(video, 'loadeddata');
        try { video.currentTime = Math.min(1, Math.max(0, (video.duration || 2) / 4)); await once(video, 'seeked'); } catch (_) { /* primeiro quadro serve */ }
        source = video; width = video.videoWidth; height = video.videoHeight;
      } else {
        const image = document.createElement('img');
        image.src = url; await once(image, 'load');
        source = image; width = image.naturalWidth; height = image.naturalHeight;
      }
      if (!width || !height) throw new Error('Mídia sem dimensões legíveis.');
      const canvas = document.createElement('canvas');
      const shrink = Math.min(64 / width, 128 / height);
      canvas.width = Math.max(1,Math.round(width * shrink)); canvas.height = Math.max(1,Math.round(height * shrink));
      const scale = Math.max(canvas.width / width, canvas.height / height);
      canvas.getContext('2d').drawImage(source, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
      return canvas.toDataURL('image/jpeg', 0.55);
    } finally { URL.revokeObjectURL(url); }
  }

  /* ------------------------------------------------------------- publicação */

  /** Campo vazio vira 0; o resto o servidor recusa se não for inteiro válido. */
  function likesValue(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return 0;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) throw new Error('Curtidas exibidas devem ser um número inteiro a partir de zero.');
    return value;
  }

  function postSheet(post) {
    const editing = Boolean(post);
    openSheet(editing ? 'Editar publicação' : 'Nova publicação', context => {
      const file = input('file');
      file.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm';
      field(context.body, 'Foto ou vídeo', file,
        editing ? 'Sem escolher arquivo, a mídia atual continua.' : `JPG, PNG, WebP, MP4 ou WebM · até ${Math.round(uploadMax / 1024 / 1024)} MB.`);
      if (storage !== 'supabase') context.say('O Storage do Supabase não está configurado: o envio de mídia vai falhar.');

      const framing = JoiceFrame.editor(context.body, { src: post ? '/api/admin/posts/' + post.id + '/media' : '', type: post?.type || 'image', crop: post?.crop_data ? JSON.parse(post.crop_data) : null, label:'Enquadramento da publicação' });
      file.addEventListener('change',()=>{if(file.files[0])framing.setFile(file.files[0]);});
      const caption = document.createElement('textarea');
      caption.rows = 4; caption.maxLength = 4000; caption.value = post?.caption || '';
      caption.placeholder = 'Escreva a legenda…';
      field(context.body, 'Legenda', caption);

      const order = input('number', String(post?.sort_order ?? (posts.length ? Math.max(...posts.map(p => p.sort_order)) + 10 : 0)));
      order.min = '-1000000'; order.max = '1000000'; order.step = '1';
      field(context.body, 'Ordem no feed', order, 'Número menor aparece primeiro.');

      // Número mostrado no coração. É o que você digita — não muda sozinho a
      // cada visita. As curtidas reais dos assinantes entram por cima dele.
      const likes = input('number', String(post?.likes_count ?? 0));
      likes.min = '0'; likes.max = '100000000'; likes.step = '1'; likes.inputMode = 'numeric';
      field(context.body, 'Curtidas exibidas', likes, 'Número inteiro. Vazio conta como 0.');

      const published = checkbox(context.body, 'Publicado', post ? post.published : true);
      const preview = checkbox(context.body, 'Mostrar como prévia na HOME', post?.show_as_preview);
      context.state = { file, caption, order, published, preview, likes, framing };
    }, async context => {
      const { file, caption, order, published, preview, likes, framing } = context.state;
      const chosen = file.files[0];
      const body = {
        caption: caption.value,
        sort_order: Number(order.value),
        published: published.checked,
        show_as_preview: preview.checked,
        likes_count: likesValue(likes.value),
        crop: framing.get(),
        version: post?.version
      };
      if (chosen) {
        try { body.preview_image = await derive(chosen); }
        catch (_) { context.say('Não consegui gerar a amostra da HOME desta mídia.'); }
        body.uploadId = await sendFile(chosen, context.say);
      }
      if (!chosen && post && preview.checked && JSON.stringify(body.crop) !== (post.crop_data || '')) {
        const response = await fetch('/api/admin/posts/' + post.id + '/media');
        if (!response.ok) throw new Error('Não foi possível atualizar a prévia do enquadramento.');
        body.preview_image = await derive(await response.blob());
      }
      await api(editing ? '/posts/' + post.id : '/posts', editing ? 'PUT' : 'POST', body);
      framing.destroy();
      context.close();
      toast(editing ? 'Publicação atualizada.' : 'Publicação criada.');
      await reload();
    });
  }

  /**
   * Atalhos de UMA coisa só.
   *
   * São a mesma chamada de "Editar publicação", com um campo apenas. Os outros
   * valores viajam como estão no registro, então trocar a legenda não mexe na
   * ordem, e mexer nas curtidas não republica nada.
   */
  function quickSheet(post, title, build, collect, done) {
    openSheet(title, context => { context.state = build(context); },
      async context => {
        const changes = await collect(context);
        await api('/posts/' + post.id, 'PUT', {
          caption: post.caption,
          sort_order: post.sort_order,
          published: Boolean(post.published),
          show_as_preview: Boolean(post.show_as_preview),
          likes_count: Number(post.likes_count || 0),
          version: post.version,
          ...changes
        });
        context.close();
        toast(done);
        await reload();
      });
  }

  function mediaSheet(post) {
    quickSheet(post, 'Trocar mídia', context => {
      const file = input('file');
      file.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm';
      field(context.body, 'Nova foto ou vídeo', file, `Substitui o arquivo atual · até ${Math.round(uploadMax / 1024 / 1024)} MB.`);
      if (storage !== 'supabase') context.say('O Storage do Supabase não está configurado: o envio de mídia vai falhar.');
      return { file };
    }, async context => {
      const chosen = context.state.file.files[0];
      if (!chosen) throw new Error('Escolha o arquivo novo.');
      const changes = {};
      // A amostra antiga mostrava o arquivo antigo: é refeita junto.
      try { changes.preview_image = await derive(chosen); }
      catch (_) { context.say('Não consegui gerar a amostra da HOME desta mídia.'); }
      changes.uploadId = await sendFile(chosen, context.say);
      return changes;
    }, 'Mídia trocada.');
  }

  function captionSheet(post) {
    quickSheet(post, 'Alterar legenda', context => {
      const caption = document.createElement('textarea');
      caption.rows = 5; caption.maxLength = 4000; caption.value = post.caption || '';
      field(context.body, 'Legenda', caption, 'Até 4.000 caracteres.');
      return { caption };
    }, context => ({ caption: context.state.caption.value }), 'Legenda salva.');
  }

  function likesSheet(post) {
    quickSheet(post, 'Alterar curtidas', context => {
      const likes = input('number', String(post.likes_count ?? 0));
      likes.min = '0'; likes.max = '100000000'; likes.step = '1'; likes.inputMode = 'numeric';
      field(context.body, 'Curtidas exibidas', likes, 'Número inteiro. Vazio conta como 0.');
      return { likes };
    }, context => ({ likes_count: likesValue(context.state.likes.value) }), 'Curtidas atualizadas.');
  }

  /* ----------------------------------------------------------------- perfil */

  async function profileSheet() {
    const current = await api('/profile');
    openSheet('Editar perfil', context => {
      const name = field(context.body, 'Nome', input('text', current.name || ''));
      name.maxLength = 80;
      const username = field(context.body, 'Username', input('text', current.username || ''), 'Começa com @.');
      username.maxLength = 80;
      const bio = document.createElement('textarea');
      bio.rows = 5; bio.maxLength = 4000; bio.value = current.bio || '';
      field(context.body, 'Bio', bio);
      const avatar = input('file'); avatar.accept = 'image/jpeg,image/png,image/webp';
      field(context.body, 'Avatar', avatar, 'Sem escolher, mantém o atual.');
      const avatarFrame = JoiceFrame.editor(context.body,{src:current.avatar,crop:current.avatarCrop,role:'avatar',label:'Enquadrar avatar'});
      avatar.addEventListener('change',()=>{if(avatar.files[0])avatarFrame.setFile(avatar.files[0]);});
      const cover = input('file'); cover.accept = 'image/jpeg,image/png,image/webp';
      field(context.body, 'Capa', cover, 'Escolha o enquadramento abaixo.');
      const coverFrame = JoiceFrame.editor(context.body,{src:current.cover,crop:current.coverCrop,role:'cover',label:'Enquadrar capa'});
      cover.addEventListener('change',()=>{if(cover.files[0])coverFrame.setFile(cover.files[0]);});
      context.state = { name, username, bio, avatar, cover, avatarFrame, coverFrame };
    }, async context => {
      const { name, username, bio, avatar, cover } = context.state;
      const body = { name: name.value, username: username.value, bio: bio.value, version: current.version, avatarCrop:context.state.avatarFrame.get(), coverCrop:context.state.coverFrame.get() };
      if (avatar.files[0]) body.avatarUploadId = await sendFile(avatar.files[0], context.say);
      if (cover.files[0]) body.coverUploadId = await sendFile(cover.files[0], context.say);
      await api('/profile', 'PUT', body);
      context.close();
      toast('Perfil salvo. Recarregando…');
      setTimeout(() => location.reload(), 700);
    });
  }

  /* --------------------------------------------------- menu de cada post */

  function closeMenus() {
    document.querySelectorAll('.am-menu.is-open').forEach(m => m.classList.remove('is-open'));
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('.am-menu')) closeMenus();
  });

  async function move(post, direction) {
    const ordered = posts.filter(p => !p.archived);
    const index = ordered.findIndex(p => p.id === post.id);
    const neighbour = ordered[index + direction];
    if (!neighbour) return toast('Já está na ponta.');
    const payload = p => ({ caption: p.caption, published: Boolean(p.published), show_as_preview: Boolean(p.show_as_preview), version: p.version });
    if (neighbour.sort_order === post.sort_order) {
      await api('/posts/' + post.id, 'PUT', { ...payload(post), sort_order: post.sort_order + direction });
    } else {
      await api('/posts/' + post.id, 'PUT', { ...payload(post), sort_order: neighbour.sort_order });
      await api('/posts/' + neighbour.id, 'PUT', { ...payload(neighbour), sort_order: post.sort_order });
    }
    toast('Ordem atualizada.');
    await reload();
  }

  /**
   * Confirmação da exclusão permanente.
   *
   * É a única ação do painel sem volta, então ela não pode custar o mesmo
   * toque que "Arquivar": em vez de um aviso do navegador, uma folha que diz
   * o que vai acontecer e um botão que só liga depois da caixa marcada.
   * O servidor exige a mesma confirmação, então nem uma chamada solta apaga.
   */
  function deleteSheet(post) {
    openSheet('Excluir permanentemente', context => {
      const box = el('div', 'am-danger-box');
      box.append(el('strong', null, 'Tem certeza? Essa ação não poderá ser desfeita.'));
      box.append(el('p', null, 'A publicação sai da HOME e da área VIP, o registro e as curtidas são apagados, e o arquivo sai do Storage privado se nenhuma outra publicação usar ele.'));
      box.append(el('p', null, 'Para tirar do ar sem perder nada, feche aqui e use "Arquivar".'));
      context.body.append(box);
      const agreed = checkbox(context.body, 'Entendi e quero excluir para sempre', false);
      context.save.textContent = 'Excluir';
      context.save.classList.add('am-btn-danger');
      context.save.disabled = true;
      agreed.addEventListener('change', () => { context.save.disabled = !agreed.checked; });
      context.state = { agreed };
    }, async context => {
      if (!context.state.agreed.checked) throw new Error('Marque a confirmação para excluir.');
      const result = await api('/posts/' + post.id + '/permanent', 'DELETE', { version: post.version, confirm: 'EXCLUIR' });
      context.close();
      toast(result.storage === 'pending' ? 'Publicação excluída. Limpeza da mídia pendente no painel.' : 'Publicação excluída permanentemente.');
      await reload();
    });
  }

  function menuFor(post) {
    const menu = el('div', 'am-menu');
    const trigger = el('button', 'am-menu-trigger', '⋮');
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Ações da publicação');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const open = menu.classList.contains('is-open');
      closeMenus();
      menu.classList.toggle('is-open', !open);
    });
    const list = el('div', 'am-menu-list');
    const payload = { caption: post.caption, sort_order: post.sort_order, published: Boolean(post.published), show_as_preview: Boolean(post.show_as_preview), version: post.version };
    const item = (label, action) => list.append(button(label, action, 'am-menu-item'));

    item('Editar publicação', () => { closeMenus(); postSheet(post); });
    item('Trocar mídia', () => { closeMenus(); postSheet(post); });
    item('Alterar legenda', () => { closeMenus(); captionSheet(post); });
    item('Alterar curtidas', () => { closeMenus(); likesSheet(post); });
    item(post.show_as_preview ? 'Tirar da HOME' : 'Mostrar na HOME', async () => {
      if (!post.show_as_preview && !post.has_preview) throw new Error('Sem amostra ainda. Abra Trocar mídia e escolha o arquivo de novo.');
      await api('/posts/' + post.id, 'PUT', { ...payload, show_as_preview: !post.show_as_preview });
      toast('Prévia da HOME atualizada.'); await reload();
    });
    item(post.published ? 'Despublicar' : 'Publicar', async () => {
      await api('/posts/' + post.id, 'PUT', { ...payload, published: !post.published });
      toast(post.published ? 'Despublicada.' : 'Publicada.'); await reload();
    });
    item('Mover para cima', () => move(post, -1));
    item('Mover para baixo', () => move(post, 1));
    const archive = button('Arquivar', async () => {
      if (!confirm('Arquivar esta publicação? Ela sai do feed, a mídia é preservada e dá para restaurar depois.')) return;
      await api('/posts/' + post.id, 'DELETE', { version: post.version });
      toast('Publicação arquivada.'); await reload();
    }, 'am-menu-item am-menu-danger');
    list.append(archive);
    list.append(button('Excluir permanentemente',()=>{closeMenus();deleteSheet(post);},'am-menu-item am-menu-danger'));

    menu.append(trigger, list);
    return menu;
  }

  /* ------------------------------------------------- encaixe nas duas telas */

  const isVip = location.pathname.replace(/\/+$/, '') === '/vip';

  /**
   * Casa os cartões do feed na tela com os registros do painel.
   *
   * Prioriza o id que o próprio cartão carrega (`data-post-id`) — é exato e não
   * depende de rascunho, ordem ou filtro de aba. A contagem por posição fica só
   * como rede de segurança para cartão antigo que ainda não tem id.
   */
  function decorateFeed() {
    document.querySelectorAll('.am-menu').forEach(m => m.remove());
    const cards = isVip
      ? [...document.querySelectorAll('.vip-post')]
      : [...document.querySelectorAll('.preview-post')];
    if (!cards.length) return;
    const alive = posts.filter(p => !p.archived);
    // Na revisão do /vip o rascunho também aparece; na HOME, só a prévia marcada.
    const source = isVip ? alive : alive.filter(p => p.published && p.show_as_preview);
    const byId = new Map(alive.map(p => [String(p.id), p]));
    let position = 0;
    cards.forEach(card => {
      const marked = card.dataset.postId ? byId.get(String(card.dataset.postId)) : null;
      const post = marked || source[position++];
      if (!post) return;
      const head = card.querySelector(isVip ? '.vip-post-head' : '.post-header');
      if (head) head.append(menuFor(post));
    });
  }

  function bar(email) {
    const strip = el('div', 'am-bar');
    strip.id = 'amBar';
    const tag = el('span', 'am-bar-tag', 'Modo administrador');
    const actions = el('div', 'am-bar-actions');
    actions.append(
      button('Nova publicação', () => postSheet(null), 'am-btn am-btn-primary am-btn-sm'),
      button('Editar perfil', () => profileSheet(), 'am-btn am-btn-sm'),
      // Sem comprar nada: o /vip reconhece a sessão administrativa e abre em
      // modo revisão. Na própria área VIP o botão volta para a HOME.
      button(isVip ? 'Ver página inicial' : 'Ver área VIP', () => { location.assign(isVip ? '/' : '/vip'); }, 'am-btn am-btn-sm'),
      button('Sair', async () => {
        await api('/logout', 'POST', {});
        location.reload();
      }, 'am-btn am-btn-sm am-btn-quiet')
    );
    strip.append(tag, actions);
    if (email) strip.title = email;
    document.body.classList.add('am-on');
    document.body.prepend(strip);
    // A barra quebra em duas linhas em telas estreitas; o recuo acompanha.
    const fit = () => document.body.style.setProperty('--am-bar-height', strip.offsetHeight + 'px');
    fit();
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(strip);

    const floating = button('+', () => postSheet(null), 'am-fab');
    floating.setAttribute('aria-label', 'Nova publicação');
    document.body.append(floating);
  }

  /** Botões de troca rápida sobre a capa e o avatar. */
  function profileHandles() {
    const cover = document.querySelector(isVip ? '.vip-cover' : '.cover-wrap');
    if (cover && !cover.querySelector('.am-edit')) {
      const edit = button('✏ Alterar capa', () => profileSheet(), 'am-edit am-edit-cover');
      cover.append(edit);
    }
    const avatar = document.querySelector(isVip ? '.vip-avatar-wrap' : '.avatar-wrap');
    if (avatar && !avatar.querySelector('.am-edit')) {
      const edit = button('✏', () => profileSheet(), 'am-edit am-edit-avatar');
      edit.setAttribute('aria-label', 'Alterar avatar');
      avatar.append(edit);
    }
  }

  async function reload(refresh = true) {
    if (refresh) { location.reload(); return; }
    const data = await api('/posts');
    posts = data.posts || [];
    decorateFeed();
  }

  /* -------------------------------------------------------------- entrada */

  async function start() {
    let me;
    try {
      const response = await fetch(BASE + '/api/admin/me', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return;
      me = await response.json();
    } catch (_) { return; }            // sem backend, a página fica como está
    if (!me || !me.admin) return;      // visitante e assinante: nada é desenhado

    csrf = me.csrf || '';
    try {
      const session = await api('/session');
      uploadMax = session.uploadMaxBytes; storage = session.storage;
    } catch (_) { uploadMax = 250 * 1024 * 1024; }

    bar(me.email);
    profileHandles();
    try { await reload(false); } catch (error) { toast(error.message); }
    // O feed do /vip e as prévias da HOME são montados por JS; reencaixa depois.
    setTimeout(decorateFeed, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
