/* Kohler Dist Hub -- who is signed in, for the pages.
   /login/ leaves a readable `kdh_user` cookie ({name, role, email, title,
   dm}). A manager can also set `kdh_preview` (from the rep workspace's
   "Preview as this rep") and then every page behaves as if that rep had
   signed in, with a fixed bar at the bottom to exit. Access is decided by
   the Vercel middleware from the real login, never by these cookies. */
(function (global) {
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function user() {
    try {
      var u = JSON.parse(cookie('kdh_user') || 'null');
      if (!u) return null;
      if (u.role === 'manager') {
        var p = cookie('kdh_preview');
        if (p) return { name: p, role: 'rep', preview: true, manager: u.name, email: u.email, title: '', dm: '' };
      }
      return u;
    } catch (e) { return null; }
  }
  function setPreview(name) {
    document.cookie = 'kdh_preview=' + encodeURIComponent(name || '') + '; Path=/; Max-Age=' + (name ? 86400 : 0) + '; Secure; SameSite=Lax';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bar() {
    var u = user();
    if (!u || !u.preview || document.getElementById('kdhPreviewBar')) return;
    var b = document.createElement('div');
    b.id = 'kdhPreviewBar';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#12275F;color:#fff;font:600 13.5px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 -4px 16px rgba(0,0,0,.35)';
    b.innerHTML = '<span>Previewing as <b>' + esc(u.name) + '</b> — this is what they see</span>' +
      '<button type="button" style="font:inherit;background:#F2C14E;color:#141414;border:0;border-radius:8px;padding:7px 12px;cursor:pointer">Exit preview</button>';
    b.querySelector('button').addEventListener('click', function () { setPreview(''); location.reload(); });
    document.body.appendChild(b);
    document.body.style.paddingBottom = '64px';
  }
  global.kdhUser = user;
  global.kdhSetPreview = setPreview;
  global.kdhPreviewBar = bar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
})(window);
