  /* =========================================================
   * DIALOG (the one modal: questions, short forms, text to copy)
   *
   * #dialog sits over everything with its scrim. openDialog() fills it.
   * Escape, the scrim and the close button dismiss it; focus stays inside
   * while it is open and returns to whatever opened it.
   * ========================================================= */

  const dialog = { open: false, opener: null, confirm: null };

  function openDialog(html) {
    const panel = document.getElementById('dialog');
    if (!dialog.open) dialog.opener = document.activeElement;
    dialog.open = true;
    dialog.confirm = null;
    document.getElementById('dialog-body').innerHTML = html;
    document.getElementById('dialog-scrim').hidden = false;
    panel.hidden = false;
    panel.scrollTop = 0;
    (panel.querySelector('[data-autofocus]') || panel.querySelector('#dialog-body input, #dialog-body button') ||
      panel.querySelector('button')).focus();
  }

  function closeDialog() {
    if (!dialog.open) return;
    const opener = dialog.opener;
    dialog.open = false;
    dialog.opener = null;
    dialog.confirm = null;
    document.getElementById('dialog-scrim').hidden = true;
    document.getElementById('dialog').hidden = true;
    document.getElementById('dialog-body').innerHTML = '';
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  // A dialog's contents: its title, body markup and row of buttons
  function dialogContent(title, body, actions) {
    return '<h2 class="dialog-title" id="dialog-title">' + title + '</h2>' +
      '<div class="dialog-text">' + body + '</div>' +
      '<div class="dialog-actions">' + actions + '</div>';
  }

  // Ask before doing something that can't be taken back. opts: title,
  // body (markup), confirm (the button's label), danger, onConfirm.
  // Focus starts on Cancel, so Enter alone never confirms.
  function confirmDialog(opts) {
    openDialog(dialogContent(opts.title, opts.body,
      '<button type="button" class="btn btn--secondary" data-action="dialog-close" data-autofocus>Cancel</button>' +
      '<button type="button" class="btn ' + (opts.danger ? 'btn--danger-solid' : 'btn--primary') + '" data-action="dialog-confirm">' + opts.confirm + '</button>'));
    dialog.confirm = opts.onConfirm;
  }

  // Text laid out to be copied by hand, for browsers that won't copy it themselves
  function copyDialog(title, text) {
    openDialog(dialogContent(title,
      '<p>This browser wouldn’t copy it for you. Select the text below and copy it.</p>' +
      '<textarea class="input" readonly rows="' + Math.min(8, text.split('\n').length + 1) + '" aria-label="' + escapeHtml(title) + '">' + escapeHtml(text) + '</textarea>',
      '<button type="button" class="btn btn--primary" data-action="dialog-close">Done</button>'));
    const field = document.querySelector('#dialog textarea');
    field.focus();
    field.select();
  }

  // Copy text to the clipboard and say so, or show it to be copied by hand
  async function copyText(text, done, title) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice(done);
    } catch (err) {
      copyDialog(title, text);
    }
  }

  /* =========================================================
   * SETTINGS (appearance, play defaults, sync, data, about)
   *
   * Drawn once into #settings-content. After that only its controls are
   * brought in line with what is stored, so a field being typed in keeps
   * its place when a sync finishes underneath it.
   * ========================================================= */

  const THEME_CHOICES = [
    { value: 'system', label: 'System', preview: ' theme-prev--system' },
    { value: 'light', label: 'Parchment', preview: '' },
    { value: 'dark', label: 'Night Chart', preview: ' theme-prev--dark' }
  ];
  // What Reset progress takes away, as the confirmation lists it
  const RESET_ERASES = [
    'Personal records for every level and difficulty',
    'Mastery of every place, and what is due for review',
    'Your activity history and day streak',
    'Daily Five results and streak',
    'Pin the City rounds and distances',
    'Focus practice lists and Learn progress'
  ];

  function renderSettings() {
    if (!document.getElementById('settings-sync')) {
      const group = (key, title, text, body) =>
        '<section class="settings-group" aria-labelledby="settings-' + key + '">' +
          '<header><h2 id="settings-' + key + '">' + title + '</h2><p>' + text + '</p></header>' +
          '<div class="settings-card">' + body + '</div>' +
        '</section>';
      const tiles = THEME_CHOICES.map(choice =>
        '<button type="button" class="theme-tile" role="radio" data-action="set-theme" data-value="' + choice.value + '">' +
          '<span class="theme-prev' + choice.preview + '"></span>' +
          '<span class="theme-name">' + choice.label + '<span class="radio"></span></span>' +
        '</button>').join('');
      const difficulties = Object.keys(DIFFICULTY_INFO).map(key =>
        '<li><b>' + DIFFICULTY_INFO[key].label + '</b><span>' + DIFFICULTY_INFO[key].desc + '.</span></li>').join('');

      document.getElementById('settings-content').innerHTML =
        '<header class="page-head"><div><p class="eyebrow">This device</p><h1 class="display-l">Settings</h1></div></header>' +
        group('appearance', 'Appearance', 'Two charts of the same world.',
          '<div class="setting setting--stack">' +
            '<div class="setting-text"><strong id="theme-label">Theme</strong></div>' +
            '<div class="themes" role="radiogroup" aria-labelledby="theme-label">' + tiles + '</div>' +
          '</div>' +
          '<div class="setting">' +
            '<div class="setting-text"><strong id="motion-label">Reduce motion</strong>' +
              '<span>Skips screen transitions and animated movement. Follows your device’s setting until you change it here.</span></div>' +
            '<button type="button" class="switch" role="switch" data-action="toggle-motion" aria-labelledby="motion-label"></button>' +
          '</div>') +
        group('play', 'Play', 'Defaults for every level. You can still change them when you start one.',
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Difficulty</strong></div>' + renderDifficultySeg() +
            '<ul class="difflist">' + difficulties + '</ul>' +
          '</div>' +
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Map style</strong><span>Satellite needs a connection. Imagery © Esri.</span>' +
              '<span data-map-note hidden>Uncharted is always played on satellite imagery.</span></div>' + renderMapSeg() +
          '</div>') +
        group('sync', 'Sync', 'Your progress lives on this device. Sync keeps a copy so your other devices match.',
          '<div id="settings-sync"></div>') +
        group('data', 'Data', 'Take a copy of your progress, or start over.',
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Export my progress</strong>' +
              '<span>Downloads everything this device holds as one JSON file: records, mastery, activity, Daily Five and Pin the City history. Your sync code is left out.</span></div>' +
            '<button type="button" class="btn btn--secondary" data-action="export-progress">Export</button>' +
          '</div>' +
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Reset progress</strong>' +
              '<span>Erases every record, all mastery, your streaks and your history. Settings stay as they are.</span></div>' +
            '<button type="button" class="btn btn--danger" data-action="reset-progress">Reset progress…</button>' +
          '</div>') +
        group('about', 'About', 'What this is, and what it is made with.',
          '<div class="about">' +
            '<p><b>Cartographer’s Atlas</b> is a geography trainer. Find countries, states, provinces and cities on the map; it keeps track of the ones you know and brings back the ones you miss. It works offline once loaded, and your progress stays on your own devices.</p>' +
            '<dl class="credits">' +
              '<div><dt>Borders and places</dt><dd>Natural Earth, public domain. US outlines fall back to US Census Bureau data.</dd></div>' +
              '<div><dt>Satellite imagery</dt><dd>Esri World Imagery (Esri, Maxar, Earthstar Geographics)</dd></div>' +
              '<div><dt>Typefaces</dt><dd>Cormorant Garamond and Inter, SIL Open Font License</dd></div>' +
            '</dl>' +
            '<button type="button" class="btn btn--secondary" data-action="share-app">' + icon('share') + 'Share the atlas</button>' +
          '</div>');
    }
    syncThemeControls();
    syncMotionControl();
    syncPlayControls();
    renderSettingsSync();
  }

  // Hand the player everything this device holds as a JSON file
  function downloadProgress() {
    const data = exportProgress();
    const name = 'cartographers-atlas-progress-' + data.exportedAt.slice(0, 10) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice('Saved as ' + name);
  }

  // Reset progress, after saying exactly what goes
  function confirmReset() {
    const synced = !!syncGetToken();
    confirmDialog({
      title: 'Reset all progress?',
      body: '<p>This erases, for good:</p>' +
        '<ul class="dialog-list">' + RESET_ERASES.map(line => '<li>' + line + '</li>').join('') + '</ul>' +
        '<p>' + (synced
          ? 'Your settings and your sync code stay. <b>Sync is on, so your other devices are reset too</b> the next time they sync.'
          : 'Your settings stay as they are.') + '</p>' +
        '<p class="dialog-fine">To keep a copy first, cancel and use Export my progress.</p>',
      confirm: 'Reset progress',
      danger: true,
      onConfirm: () => {
        resetProgress().then(result => {
          showNotice(!synced || result.ok ? 'Progress reset.'
            : 'Progress reset on this device. Your other devices follow once sync can be reached.');
        });
      }
    });
  }

  // Pass the app on: the share sheet where there is one, the link otherwise
  async function shareApp() {
    const url = baseUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cartographer’s Atlas',
          text: 'Learn the world’s countries, states, provinces and cities on the map.',
          url: url
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    copyText(url, 'Link copied.', 'Copy the link');
  }

