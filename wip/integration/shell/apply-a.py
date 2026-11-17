# Step A script edits on the assembled file. Usage: python3 apply-a.py <file>
import sys, re
p = sys.argv[1]
s = open(p).read()
def swap(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: raise SystemExit('expected %d of %r, found %d' % (count, old[:70], n))
    s = s.replace(old, new)

shell = open(__file__.rsplit('/', 1)[0] + '/js-shell.js').read().rstrip('\n')

# the screen switcher becomes the app shell
start = s.index('  /* =========================================================\n   * SCREEN SWITCHING')
end = s.index('  /* =========================================================\n   * EVENT BINDINGS')
s = s[:start] + shell + '\n\n' + s[end:]

# the old menu's render function is Home's
s = s.replace('function renderMenu() {', 'function renderHome() {')
swap("      renderMenu();\n      openLinkedLevel();", "      refreshView();\n      openLinkedLevel();")
swap("    state.menuView = menuViewForStartArg(startArg);\n    renderMenu();\n", "    state.menuView = menuViewForStartArg(startArg);\n")
swap("      if (ms <= 0) { renderMenu(); return; }", "      if (ms <= 0) { renderHome(); return; }")
s = s.replace('        renderMenu();\n        // Scroll to top', '        renderHome();\n        // Scroll to top')
s = s.replace("        state.menuView = btn.dataset.target || 'main';\n        renderMenu();", "        state.menuView = btn.dataset.target || 'main';\n        renderHome();")
# difficulty / satellite handlers of the old menu
s = s.replace("        saveDifficulty(state.difficulty);\n        renderMenu();", "        saveDifficulty(state.difficulty);\n        renderHome();")
s = s.replace("        saveMapStyle(state.mapStyle);\n        renderMenu();", "        saveMapStyle(state.mapStyle);\n        renderHome();")
# everything else that redrew the menu after data changed
left = s.count('renderMenu()')
s = s.replace('renderMenu()', 'refreshView()')
print('renderMenu -> refreshView:', left)

swap("    html += renderModeToggles();\n    html += renderSyncEntry();\n", "    html += renderModeToggles();\n")
swap("    initModeToggles();\n    wireSyncEntryButton();\n", "    initModeToggles();\n")
swap("    menuView: 'main',", "    view: 'home',             // the view showing, or the one to come back to after a round (key into VIEWS)\n    menuView: 'main',")

# results headline: the same difficulty words as the share text
swap("    const difficultyLabel = state.difficulty === 'uncharted' ? ' · Uncharted'\n      : state.hardMode ? ' · Hard Mode' : '';\n", "    const difficultyLabel = difficultyBadge(state.difficulty, state.hardMode);\n")

# sync entry: a row in Settings and a light in the navigation
a = s.index('  // ---- Menu entry button ----')
b = s.index('  // What a failed sync means, in words.')
entry = '''  // ---- Settings row and navigation light ----

  // 'never' (no key yet), 'ok', or 'error' (the last push or pull failed)
  function syncEntryState() {
    if (!syncGetToken()) return 'never';
    return syncGetMeta().lastError ? 'error' : 'ok';
  }

  // The Sync row in Settings: where things stand, and the way into the sync panel
  function renderSyncEntry() {
    const entryState = syncEntryState();
    const status = entryState === 'never' ? 'Keep your progress in step across your devices.'
      : entryState === 'error' ? syncErrorText(syncGetMeta().lastError)
      : 'On. Your progress is mirrored to your other devices.';
    return (
      '<div class="setting">' +
        '<div class="setting-text"><strong>Sync</strong><span>' + syncEscapeHtml(status) + '</span></div>' +
        '<button id="sync-entry-btn" class="btn btn--secondary sync-entry-btn ' + entryState + '" type="button" data-action="open-sync"' +
          (entryState === 'error' ? ' aria-label="Sync: the last attempt failed"' : '') + '>' +
          (entryState === 'never' ? '' : '<span class="dot' + (entryState === 'error' ? ' is-error' : '') + '"></span>') +
          (entryState === 'never' ? 'Set up sync' : 'Sync') +
        '</button>' +
      '</div>'
    );
  }

  // Bring the Settings row and the navigation's sync light in line with the
  // latest status, so a failed push shows at once
  function syncRefreshEntry() {
    const entryState = syncEntryState();
    const row = document.getElementById('settings-sync');
    if (row) row.innerHTML = renderSyncEntry();
    document.querySelectorAll('[data-sync-dot]').forEach(dot => {
      dot.hidden = entryState === 'never';
      dot.classList.toggle('is-error', entryState === 'error');
    });
  }

'''
s = s[:a] + entry + s[b:]
c = s.index('  function wireSyncEntryButton() {')
d = s.index('  // ---- Modal ----')
s = s[:c] + s[d:]

# one click handler for every [data-action] control outside the game
swap("  document.getElementById('back-btn').addEventListener('click', () => switchScreen('menu'));",
'''  // Controls outside the game say what they do with data-action; one
  // listener serves them all, so redrawn markup needs no rewiring
  const ACTIONS = {
    'view': (el) => {
      // The tab already showing scrolls back to its top
      if (el.dataset.view === state.view && document.body.dataset.screen === viewByKey(state.view).screen) {
        document.getElementById(viewByKey(state.view).screen + '-screen').scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } else {
        showView(el.dataset.view);
      }
    },
    'toggle-theme': () => setThemePref(resolveTheme(loadThemePref()) === 'dark' ? 'light' : 'dark'),
    'open-sync': () => syncOpenModal()
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.tagName === 'A') e.preventDefault();
    ACTIONS[el.dataset.action](el, e);
  });

  document.getElementById('back-btn').addEventListener('click', () => switchScreen('menu'));''')

swap("  wireSyncModalChrome();\n  wireFocusChooserChrome();\n",
     "  wireSyncModalChrome();\n  wireFocusChooserChrome();\n\n  renderNav();\n  applyTheme();\n  showView(viewFromHash(), { keepAddress: true });\n")
swap("    state, mastery, LEVELS, COLLECTIONS, startGame, levelByKey, exportProgress, resetProgress,\n",
     "    state, mastery, LEVELS, COLLECTIONS, VIEWS, startGame, levelByKey, showView, exportProgress, resetProgress,\n")
open(p, 'w').write(s)
