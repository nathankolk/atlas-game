  /* =========================================================
   * THEME & MOTION (per-device preferences, not synced)
   *
   * "atlas-theme" is 'light' | 'dark' | 'system'; without it the page
   * follows the OS. The script in <head> sets data-theme before the first
   * paint; this section keeps it current afterwards. "atlas-motion" is
   * 'reduce' | 'full' (data-motion on <html>); without it the OS decides.
   * ========================================================= */

  const THEME_KEY = 'atlas-theme';
  // Each theme's page colour for the browser chrome (the value of --bg)
  const THEME_COLORS = { light: '#f7f1e3', dark: '#101824' };
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function loadThemePref() {
    try {
      const pref = localStorage.getItem(THEME_KEY);
      if (pref === 'light' || pref === 'dark') return pref;
    } catch (e) { /* storage blocked - follow the system */ }
    return 'system';
  }

  // The theme a preference comes to right now: 'light' or 'dark'
  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return systemDark && systemDark.matches ? 'dark' : 'light';
  }

  // Paint the page in the preferred theme and bring the toggle in line
  function applyTheme() {
    const theme = resolveTheme(loadThemePref());
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    const toggle = document.getElementById('theme-toggle');
    toggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    toggle.setAttribute('aria-label',
      theme === 'dark' ? 'Switch to the Parchment theme' : 'Switch to the Night Chart theme');
  }

  function setThemePref(pref) {
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch (e) { /* private mode or disabled storage - nothing to remember it in */ }
    applyTheme();
  }

  if (systemDark) {
    // Safari before 14 only has addListener
    if (systemDark.addEventListener) systemDark.addEventListener('change', applyTheme);
    else if (systemDark.addListener) systemDark.addListener(applyTheme);
  }

  // True when movement should be kept to a minimum
  function reducedMotion() {
    const set = document.documentElement.getAttribute('data-motion');
    if (set) return set === 'reduce';
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // An icon from the sprite at the top of <body>
  function icon(name, extraClass) {
    return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  /* =========================================================
   * APP SHELL (views, navigation, screen switching)
   *
   * A view is a top-level page reached from the navigation: the top bar
   * on wide windows, the tab bar on phones. Each view has its own .screen
   * ('<screen>-screen') and its own address: '#<key>', or no hash for
   * Home. Adding a view is one entry here plus its screen in the markup.
   * The game and results screens are not views; they cover the
   * navigation while a round is on.
   * ========================================================= */

  const VIEWS = [
    { key: 'home', screen: 'menu', label: 'Home', icon: 'home', render: renderHome },
    { key: 'stats', screen: 'stats', label: 'Stats', icon: 'stats' },
    { key: 'settings', screen: 'settings', label: 'Settings', icon: 'settings', render: renderSettings }
  ];

  function viewByKey(key) {
    return VIEWS.find(view => view.key === key) || null;
  }

  // The view the address bar names ('#stats'); anything else is Home
  function viewFromHash() {
    const key = window.location.hash.replace(/^#/, '');
    return viewByKey(key) ? key : 'home';
  }

  function viewUrl(key) {
    return baseUrl() + (key === 'home' ? '' : '#' + key);
  }

  // One link per view, in the top bar and in the phone's tab bar
  function renderNav() {
    const links = VIEWS.map(view =>
      '<a href="' + (view.key === 'home' ? './' : '#' + view.key) + '" data-action="view" data-view="' + view.key + '">' +
        icon(view.icon) + '<span>' + view.label + '</span>' +
        (view.key === 'settings' ? '<span class="dot nav-dot" data-sync-dot hidden></span>' : '') +
      '</a>').join('');
    document.getElementById('topnav-links').innerHTML = links;
    document.getElementById('tabbar').innerHTML = links;
  }

  // Mark the current view in the navigation and bring the streak chip and
  // the sync light up to date
  function updateNav() {
    document.querySelectorAll('#topnav-links a, #tabbar a').forEach(link => {
      const on = link.dataset.view === state.view;
      link.classList.toggle('is-on', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const streak = mastery.streak().current;
    const chip = document.getElementById('streak-chip');
    chip.hidden = streak < 1;
    chip.innerHTML = icon('flame') + '<span><b>' + streak + '</b><span class="streak-unit">-day streak</span></span>';
    chip.setAttribute('aria-label', streak + '-day streak');
    syncRefreshEntry();
  }

  // opts.keepAddress: leave the address bar as it is (see switchScreen)
  function showView(key, opts) {
    switchScreen((viewByKey(key) || VIEWS[0]).screen, opts);
  }

  // Redraw the view on screen after its data changed underneath it (a sync
  // pull, a reset). Does nothing visible while a round is on.
  function refreshView() {
    const view = viewByKey(state.view);
    if (view.render && document.body.dataset.screen === view.screen) view.render();
    updateNav();
  }

  // Show a screen: 'game', 'results', or a view's screen ('menu' is Home).
  // opts.keepAddress leaves the address bar alone: on load it may still
  // hold a ?play= link that has yet to be read.
  function switchScreen(name, opts) {
    const view = VIEWS.find(v => v.screen === name);
    if (view) {
      state.roundId++;   // whatever the round still had queued up no longer applies
      state.view = view.key;
      // Drawn on the way in, so bests and the daily card reflect the round just played
      if (view.render) view.render();
      if (!(opts && opts.keepAddress)) setAddressBar(viewUrl(view.key));
      updateNav();
    } else {
      hideNotice();   // it spoke about a view, and would sit over the game's controls
    }
    document.body.dataset.screen = name;
    const target = document.getElementById(name + '-screen');
    if (!target || target.classList.contains('active')) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    if (view) playEntrance(target);
  }

  // One fade-up as a view comes in. Redraws while it is showing don't
  // repeat it: the animated element is the page, not what is drawn into it.
  function playEntrance(screen) {
    screen.classList.remove('is-entering');
    void screen.offsetWidth;
    screen.classList.add('is-entering');
  }

  // A hand-typed hash or the browser's back button names another view
  window.addEventListener('hashchange', () => showView(viewFromHash()));

  // Settings so far holds the one control that must stay reachable: sync
  function renderSettings() {
    document.getElementById('settings-sync').innerHTML = renderSyncEntry();
  }
