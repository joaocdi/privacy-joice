// Visitor cost is limited to checking the server session, never loading editors.
(() => {
  const base = location.protocol === 'file:' || (['localhost','127.0.0.1'].includes(location.hostname) && ['5500','5501'].includes(location.port)) ? 'http://localhost:3333' : '';
  window.JoiceAdminSession = fetch(base + '/api/admin/me', {credentials:'include', signal:AbortSignal.timeout(8000)})
    .then(response => response.ok ? response.json() : null).catch(() => null);
  window.JoiceAdminSession.then(me => {
    if (!me?.admin) return;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + '/admin-mode.css?v=carousel-1';
    const script = document.createElement('script'); script.src = base + '/admin-mode.js?v=lazy-admin-1';
    document.head.append(css); document.head.append(script);
  });
})();
