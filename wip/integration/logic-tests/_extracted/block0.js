
  // Pick the theme before first paint, so the page never flashes the wrong one.
  // 'atlas-theme' is 'light' | 'dark' | 'system'; 'atlas-motion' is 'reduce' | 'full'.
  (function () {
    var root = document.documentElement, pref = 'system', motion = '';
    try {
      pref = localStorage.getItem('atlas-theme') || 'system';
      motion = localStorage.getItem('atlas-motion') || '';
    } catch (e) { /* storage blocked: follow the system */ }
    var dark = pref === 'dark' ||
      (pref !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (motion === 'reduce' || motion === 'full') root.setAttribute('data-motion', motion);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#101824' : '#f7f1e3');
  })();
