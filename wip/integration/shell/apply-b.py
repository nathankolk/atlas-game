# Steps B and C: Home replaces the menu tree, the level sheet replaces the focus chooser.
# Usage: python3 apply-b.py <index.html>   (the file as committed after step A)
import sys
here = __file__.rsplit('/', 1)[0]
p = sys.argv[1]
s = open(p).read()
def swap(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: raise SystemExit('expected %d of %r, found %d' % (count, old[:80], n))
    s = s.replace(old, new)
def cut(start, end, keep=''):
    global s
    a = s.index(start); b = s.index(end, a)
    s = s[:a] + keep + s[b:]

# ---------- CSS ----------
cut('  /* ---------- MENU SCREEN ---------- */', '  /* ---------- GAME SCREEN ---------- */')
cut('  /* Fresh-vs-focus chooser (frame reuses the sync modal styles) */', '  .results-actions {')
cut('  /* Animations */', '  /* US mode - choices panel for state → capital */',
    '  /* Cormorant sets old-style figures by default; scores read better lined up */\n'
    '  .stat-value, .grade-big, .r-stat-value, .best-value { font-variant-numeric: lining-nums; }\n\n')
cut('  .focus-choice.learn {', '  /* ===== Pin the City ===== */')
cut('  .pin-scoring-note {', '  .pin-weak {')
cut('  /* Section divider between world and US sections on menu */', '  /* Loading overlay for lazy-loaded datasets */')
cut('    /* Sub-menu adjustments for narrow screens */', '  }\n\n  /* ===== Tablet and small laptop ===== */')
swap('  /* Responsive */\n  @media (max-width: 720px) {', '  /* Game and results on narrow windows */\n  @media (max-width: 720px) {')

# ---------- markup ----------
cut('  <!-- FOCUS CHOOSER', '</div>\n\n<nav class="tabbar"', open(here + '/body-sheet.html').read() + '\n')
swap('        <button class="ctrl-btn primary" id="practice-btn" style="display:none;">Practice These</button>',
     '        <button class="ctrl-btn primary" id="review-next-btn" style="display:none;">Next</button>\n'
     '        <button class="ctrl-btn primary" id="practice-btn" style="display:none;">Practice These</button>')

# ---------- script ----------
home = open(here + '/js-home.js').read()
cut('  /* =========================================================\n   * MENU\n', '  /* =========================================================\n   * GAME\n', home)
cut('  // The menu folder a level\'s card lives in', '  // On load: start the level named in ?play=.')
swap("    state.menuView = menuViewForStartArg(startArg);\n", "")
cut('  /* =========================================================\n   * FOCUS CHOOSER', '  /* =========================================================\n   * DIFFICULTY & MAP STYLE PREFERENCES')
cut('  // The menu DOM is recreated on every ', '  /* =========================================================\n   * SHARE RESULTS')
swap("  // Load once at startup, before the first menu render reads them\n", "  // Load once at startup, before anything is drawn from them\n")
cut('  // Menu card line: "Best 1,640 · last 10 avg 1,420"', '  /* =========================================================\n   * LEARN MODE')
swap("  wireSyncModalChrome();\n  wireFocusChooserChrome();\n", "  wireSyncModalChrome();\n")

swap("    view: 'home',             // the view showing, or the one to come back to after a round (key into VIEWS)\n    menuView: 'main',         // 'main' | 'continents' | 'us' | 'us-cities' | 'provinces' | 'provinces-russia'\n",
     "    view: 'home',             // the view showing, or the one to come back to after a round (key into VIEWS)\n"
     "    review: null,             // Smart Review in progress: { queue: [{ level, names }] } still to play\n")

# collections carry their icon
swap("{ key: 'world', title: 'World & Continents', desc: 'Find every country on the globe' }", "{ key: 'world', icon: 'globe', title: 'World & Continents', desc: 'Find every country on the globe' }")
swap("{ key: 'us', title: 'United States', desc: 'States, capitals and cities' }", "{ key: 'us', icon: 'star', title: 'United States', desc: 'States, capitals and cities' }")
swap("{ key: 'provinces', title: 'Provinces & States', desc: 'The inner divisions of Canada, China, India and Russia' }", "{ key: 'provinces', icon: 'layers', title: 'Provinces & States', desc: 'The inner divisions of Canada, China, India and Russia' }")
swap("{ key: 'pins', title: 'Pin the City', desc: 'A blank map, a city name, and a pin' }", "{ key: 'pins', icon: 'pin', title: 'Pin the City', desc: 'A blank map, a city name, and a pin' }")
import re
s, n = re.subn(r" short: '[^']*',", "", s)
if n != 6: raise SystemExit('short fields: %d' % n)

# daily streak: an open puzzle today doesn't break a run that reached yesterday
swap("""  // Daily streak: consecutive days played (any result) ending today.
""", """  // Daily streak: consecutive days played (any result) ending today, or
  // ending yesterday while today's puzzle is still to play.
""")
swap("""      if (all[k]) streak++;
      else break;
""", """      if (all[k]) streak++;
      else if (offset > 0) break;
""")

# startGame
swap("""    state.practice = false;
    state.learn = null;
    state.pin = null;
""", """    state.practice = false;
    state.learn = null;
    state.pin = null;
    // Any round that isn't the next step of a review ends the review
    state.review = (opts && opts.review) || null;
""")
swap("""      if (existing) {
        showDailyAlreadyPlayed(existing, dateKey);
        return;
      }
""", """      if (existing) {
        switchScreen('menu');   // Home's card shows today's result
        return;
      }
""")
swap("    if (state.practice) headerLabel += ' · Practice';\n", "    if (state.practice) headerLabel += state.review ? ' · Review' : ' · Practice';\n")
swap("    switchScreen('results');\n  }\n", "    showReviewNext();\n    switchScreen('results');\n  }\n", 3)

# shell
swap("""  function switchScreen(name, opts) {
    const view = VIEWS.find(v => v.screen === name);
""", """  function switchScreen(name, opts) {
    const view = VIEWS.find(v => v.screen === name);
    closeLevelSheet({ keepFocus: true });
""")
swap("""      state.roundId++;   // whatever the round still had queued up no longer applies
      state.view = view.key;
""", """      state.roundId++;   // whatever the round still had queued up no longer applies
      state.review = null;
      state.view = view.key;
""")
swap("""    'toggle-theme': () => setThemePref(resolveTheme(loadThemePref()) === 'dark' ? 'light' : 'dark'),
    'open-sync': () => syncOpenModal()
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.tagName === 'A') e.preventDefault();
""", """    'toggle-theme': () => setThemePref(resolveTheme(loadThemePref()) === 'dark' ? 'light' : 'dark'),
    'open-sync': () => syncOpenModal(),
    'play-daily': () => startGame('daily-five'),
    'share-daily': () => shareDailyResultFromMenu(),
    'replay-daily': () => startDailyReplay(todayUtcKey()),
    'start-review': () => startReview(),
    'set-difficulty': (el) => chooseDifficulty(el.dataset.value),
    'set-map': (el) => chooseMapStyle(el.dataset.value),
    'jump': (el) => jumpToCollection(el.dataset.collection),
    'open-level': (el) => openLevelSheet(el.dataset.level, el),
    'sheet-close': () => closeLevelSheet(),
    'sheet-way': (el) => chooseSheetWay(el.dataset.value),
    'sheet-start': () => startFromSheet(),
    'sheet-learn-reset': () => startFromSheet({ learnFresh: true })
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.tagName === 'A') {
      // Leave "open in a new tab" and its relatives to the browser
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
""")
swap("  document.getElementById('practice-btn').addEventListener('click', () => {",
     "  document.getElementById('review-next-btn').addEventListener('click', startNextReview);\n  document.getElementById('practice-btn').addEventListener('click', () => {")
open(p, 'w').write(s)
