  /* =========================================================
   * HOME (masthead, Today, the Library)
   *
   * Drawn into #menu-content in three parts that can be redrawn on their
   * own: the masthead, Today (Daily Five and Smart Review) and the
   * Library (every collection with all of its level cards, from LEVELS).
   * A level card opens the level sheet; nothing starts from Home directly
   * except the Daily Five and a review.
   * ========================================================= */

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // A count as running text: words up to ninety-nine, digits beyond
  function numberWord(n) {
    if (n < 20) return NUMBER_WORDS[n];
    if (n < 100) return TENS_WORDS[Math.floor(n / 10)] + (n % 10 ? '-' + NUMBER_WORDS[n % 10] : '');
    return n.toLocaleString('en-US');
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Singular of each level noun, for a count of one
  const SINGULAR_NOUNS = {
    'countries': 'country', 'states': 'state', 'capitals': 'capital', 'cities': 'city', 'regions': 'region',
    'provinces & territories': 'province or territory', 'provinces & regions': 'province or region', 'places': 'place'
  };

  // "1 state", "6 states"
  function countNoun(n, noun) {
    return n.toLocaleString('en-US') + ' ' + (n === 1 && SINGULAR_NOUNS[noun] ? SINGULAR_NOUNS[noun] : noun);
  }

  // A line about the level that leads each collection, shown on its wider card
  const LEAD_BLURBS = {
    'world': 'Every continent, every nation. The grand tour.',
    'us-state': 'Find each state on the map, Alaska and Hawaii included.',
    'pin-world': 'A blank map and a city name. The closer the pin, the higher the score.'
  };

  /* ----- What is known about a level ----- */

  function skillSeen(skill) {
    return mastery.skills().indexOf(skill) !== -1;
  }

  // Mastery over a set of levels whose names aren't in yet, from the names
  // the store itself holds for the skill; `total` is the known item count
  function storedSummary(skill, total) {
    const summary = mastery.summary(skill);
    summary.total = total;
    summary.new = Math.max(0, total - summary.seen);
    return summary;
  }

  // A level's mastery summary. Until a province map is in, the store's own
  // names stand in, which is exact for a country taught by one level.
  // Russia's three rounds share a skill, so with history there the answer
  // is null until the map says which name belongs to which round.
  function levelSummary(level) {
    if (level.ready()) return mastery.summary(level.skill, level.names());
    const shared = LEVELS.some(other => other !== level && other.skill === level.skill);
    if (shared && skillSeen(level.skill)) return null;
    return storedSummary(level.skill, level.count());
  }

  // One mastery summary per skill among the given levels. Levels that teach
  // the same names share a skill, so each name counts once.
  function skillSummaries(levels) {
    const bySkill = new Map();
    levels.filter(level => level.available).forEach(level => {
      if (!bySkill.has(level.skill)) bySkill.set(level.skill, []);
      bySkill.get(level.skill).push(level);
    });
    return Array.from(bySkill, ([skill, group]) => {
      if (group.every(level => level.ready())) {
        const names = new Set();
        group.forEach(level => level.names().forEach(name => names.add(name)));
        return mastery.summary(skill, Array.from(names));
      }
      return storedSummary(skill, group.reduce((n, level) => n + level.count(), 0));
    });
  }

  function addSummaries(summaries) {
    const sum = { total: 0, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0 };
    summaries.forEach(s => Object.keys(sum).forEach(k => { sum[k] += s[k]; }));
    return sum;
  }

  // Fetch a level's map in the background and redraw when it lands, so a
  // card that could not show its mastery fills in. One try per level per visit.
  const levelDataAsked = new Set();
  function loadLevelData(level) {
    if (levelDataAsked.has(level.key)) return;
    levelDataAsked.add(level.key);
    level.load().then(() => {
      if (level.ready()) refreshView();
    }, () => { /* offline or missing: the card keeps its plain ring */ });
  }

  // The stored record for a level at one difficulty (not Pin the City, whose
  // history lives in the pin store)
  function levelRecord(level, difficulty) {
    return getRecords(resolveGameTarget(level.arg).region, difficulty, level.mode);
  }

  function levelPinStats(level, difficulty) {
    return pinRegionStats(resolveGameTarget(level.arg).region, difficulty);
  }

  // True once a full round of the level has been finished at any difficulty
  function levelPlayed(level) {
    return Object.keys(DIFFICULTY_INFO).some(d =>
      level.mode === 'city-pin' ? levelPinStats(level, d).games > 0 : !!levelRecord(level, d));
  }

  // A level's best at one difficulty in a few characters ("49 / 54",
  // "1,712 pts"), or '' when it has none
  function levelBestText(level, difficulty) {
    if (level.mode === 'city-pin') {
      const stats = levelPinStats(level, difficulty);
      return stats.games ? stats.best.toLocaleString('en-US') + ' pts' : '';
    }
    const rec = levelRecord(level, difficulty);
    return rec && rec.bestAccuracy ? rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total : '';
  }

  // "54 countries", "20 drawn from 120"
  function levelCountText(level) {
    const count = level.count();
    if (level.mode === 'city-pin' && count > PIN_ROUND_SIZE) return PIN_ROUND_SIZE + ' drawn from ' + count;
    return countNoun(count, level.noun);
  }

  // The focus list saved by the level's last full round, or null
  function levelFocusList(level) {
    const focus = getFocusList(level.mode, resolveGameTarget(level.arg).region);
    return focus && focus.names.length > 0 ? focus : null;
  }

  /* ----- Mastery marks ----- */

  // Ring for a summary: the mastered share as a number, the three tiers as arcs
  function renderRing(summary) {
    if (!summary || !summary.seen || !summary.total) return '<span class="ring"></span>';
    const share = n => Math.round(n / summary.total * 1000) / 10;
    const pct = Math.round(summary.mastered / summary.total * 100);
    return '<span class="ring' + (pct === 100 ? ' is-full' : '') + '" style="--a:' + share(summary.mastered) +
      ';--b:' + share(summary.mastered + summary.familiar) +
      ';--c:' + share(summary.mastered + summary.familiar + summary.learning) + '"><b>' + pct + '</b></span>';
  }

  // Bar for a summary: mastered, familiar, learning, new, each as wide as its count
  function renderMasteryBar(summary, extraClass) {
    const part = (n, cls) => n > 0 ? '<i' + (cls ? ' class="' + cls + '"' : '') + ' style="--n:' + n + '"></i>' : '';
    return '<span class="mbar' + (extraClass ? ' ' + extraClass : '') + '" role="img" aria-label="' +
      summary.mastered + ' mastered, ' + summary.familiar + ' familiar, ' + summary.learning + ' learning, ' + summary.new + ' new">' +
      part(summary.mastered, 'm3') + part(summary.familiar, 'm2') + part(summary.learning, 'm1') + part(summary.new, '') +
      '</span>';
  }

  /* ----- Home ----- */

  function renderHome() {
    // The country levels have nothing to show until the world map is in;
    // the loading line in the markup stands until then
    if (!state.allFeatures.length) return;
    const container = document.getElementById('menu-content');
    if (!document.getElementById('home-masthead')) {
      container.innerHTML =
        '<header class="masthead" id="home-masthead"></header>' +
        '<section class="today" aria-labelledby="today-label">' +
          '<h2 class="eyebrow section-label" id="today-label">Today</h2>' +
          '<div class="today-grid" id="home-today"></div>' +
        '</section>' +
        '<section class="library" aria-labelledby="library-title" id="home-library"></section>';
      renderLibraryFrame();
    }
    renderMasthead();
    renderToday();
    syncPlayControls();
    renderCollections();
  }

  // True until this device holds any progress at all
  function isNewPlayer() {
    const totals = mastery.totals();
    return !totals.games && !totals.itemsSeen && !Object.keys(loadAllRecords()).length &&
      !Object.keys(loadDailyAttempts()).length && !loadPinStore().games.length;
  }

  function renderMasthead() {
    const now = new Date();
    const dateLine = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + now.getDate() + ' ' +
      now.toLocaleDateString('en-US', { month: 'long' }) + ' ' + now.getFullYear();
    const hour = now.getHours();
    const fresh = isNewPlayer();
    const greeting = fresh ? 'Welcome.'
      : hour >= 5 && hour < 12 ? 'Good morning.' : hour >= 12 && hour < 18 ? 'Good afternoon.' : 'Good evening.';

    const due = reviewDueCount();
    const dailyDone = !!getDailyAttempt(todayUtcKey());
    let lede;
    if (fresh) {
      lede = 'Find places on the map and the atlas keeps track of the ones you know. Start with today’s Daily Five, or pick a level from the library.';
    } else if (due > 0) {
      lede = '<b>' + capitalize(numberWord(due)) + ' ' + (due === 1 ? 'place</b> is' : 'places</b> are') + ' due for review' +
        (dailyDone ? '. Today’s Daily Five is done.' : ', and today’s Daily Five is waiting.');
    } else {
      lede = dailyDone ? 'Nothing is due for review, and today’s Daily Five is done. Pick any level to keep going.'
        : 'Nothing is due for review. Today’s Daily Five is waiting.';
    }

    const totals = mastery.totals();
    const all = addSummaries(skillSummaries(LEVELS));
    const month = mastery.activity(30).reduce((sum, day) => {
      sum.questions += day.questions;
      sum.firstTry += day.firstTry;
      return sum;
    }, { questions: 0, firstTry: 0 });
    const streak = mastery.streak();
    const figure = (value, unit, label, sub) =>
      '<div><dd class="num' + (value === null ? ' is-empty' : '') + '">' + (value === null ? '—' : value + (unit ? '<small>' + unit + '</small>' : '')) +
      '</dd><dt class="eyebrow">' + label + '</dt><span class="summary-sub">' + sub + '</span></div>';

    document.getElementById('home-masthead').innerHTML =
      '<div class="masthead-copy">' +
        '<p class="eyebrow">' + dateLine + '</p>' +
        '<h1 class="display-xl">' + greeting + '</h1>' +
        '<p class="lede">' + lede + '</p>' +
      '</div>' +
      '<dl class="summary" aria-label="Your progress">' +
        figure(totals.itemsSeen ? all.mastered.toLocaleString('en-US') : null, '', 'Places mastered', 'of ' + all.total.toLocaleString('en-US')) +
        figure(month.questions ? Math.round(month.firstTry / month.questions * 100) : null, '%', 'First-try accuracy', 'last 30 days') +
        figure(totals.games ? streak.current : null, '', 'Day streak', totals.games ? 'longest ' + streak.longest : 'starts with a round') +
      '</dl>';
  }

  /* ----- Today: the Daily Five ----- */

  // The last seven UTC days, oldest first, each with its attempt (or null)
  function dailyWeek() {
    const all = loadDailyAttempts();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = [];
    for (let back = 6; back >= 0; back--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - back);
      const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      days.push({
        key: key,
        name: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        attempt: all[key] || null
      });
    }
    return days;
  }

  // How many of an attempt's five were found on the first try
  function dailyFirstTries(attempt) {
    if (Array.isArray(attempt.sequence)) return attempt.sequence.filter(points => points === 2).length;
    return attempt.correct || 0;
  }

  function renderDailyWeek(streak) {
    const todayKey = todayUtcKey();
    const cells = dailyWeek().map(day => {
      const first = day.attempt ? dailyFirstTries(day.attempt) : null;
      const cls = (first === 5 ? ' is-perfect' : '') + (day.key === todayKey ? ' is-today' : '') + (day.attempt ? ' is-played' : '');
      const said = day.name + ': ' + (day.attempt ? first + ' of 5 on the first try' : day.key === todayKey ? 'not played yet' : 'not played');
      return '<li' + (cls ? ' class="' + cls.trim() + '"' : '') + ' aria-label="' + said + '"><span aria-hidden="true">' + day.name.charAt(0) +
        '</span><i aria-hidden="true">' + (first === null ? '' : first) + '</i></li>';
    }).join('');
    return '<div class="daily-week">' +
      '<ol class="week" aria-label="Your last seven days">' + cells + '</ol>' +
      (streak > 0 ? '<span class="week-label"><b>' + streak + (streak === 1 ? ' day' : ' days') + '</b> running</span>' : '') +
    '</div>';
  }

  function renderDailyCard() {
    const dateKey = todayUtcKey();
    const attempt = getDailyAttempt(dateKey);
    const streak = calculateDailyStreak();
    const art = '<svg class="daily-art" viewBox="0 0 200 200" aria-hidden="true"><use href="#art-globe"/></svg>';
    const eyebrow = '<span class="eyebrow">Puzzle <b>No. ' + dailyPuzzleNumber(dateKey) + '</b></span>';

    if (!attempt) {
      return '<article class="daily" data-daily="unplayed" data-action="play-daily">' + art +
        '<div class="daily-top">' + eyebrow +
          '<span class="daily-count">' + icon('clock', 'icon--sm') + 'Resets in <span data-countdown="words"></span></span>' +
        '</div>' +
        '<div class="daily-body">' +
          '<h3 class="daily-title">The Daily Five</h3>' +
          '<p class="daily-desc">Five countries, easy to hard. The same puzzle for everyone, once a day.</p>' +
        '</div>' +
        '<div class="daily-foot">' + renderDailyWeek(streak) +
          '<button type="button" class="btn btn--inverse" data-action="play-daily">Play today’s five ' + icon('arrow') + '</button>' +
        '</div>' +
      '</article>';
    }

    const pct = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0;
    const said = { 2: 'first try', 1: 'second try', 0: 'missed' };
    const marks = (attempt.sequence || []).map(points =>
      '<li class="mark mark--' + (points === 2 ? 'first' : points === 1 ? 'second' : 'missed') + '" aria-label="' + said[points] + '">' +
        (points === 2 ? icon('check') : points === 1 ? '2' : icon('close')) + '</li>').join('');
    return '<article class="daily is-done" data-daily="played">' + art +
      '<div class="daily-top">' + eyebrow +
        '<span class="daily-count">' + icon('clock', 'icon--sm') + 'Next puzzle in <span data-countdown="clock"></span></span>' +
      '</div>' +
      '<div class="daily-body">' +
        '<h3 class="daily-title">Today’s puzzle complete</h3>' +
        '<div class="daily-result">' +
          '<ol class="marks" aria-label="Your five answers">' + marks + '</ol>' +
          '<p class="daily-score"><b>' + attempt.correct + '/' + attempt.total + ' found</b> · ' + attempt.score + ' pts · ' + pct + '%</p>' +
        '</div>' +
      '</div>' +
      '<div class="daily-foot">' + renderDailyWeek(streak) +
        '<div class="daily-actions">' +
          '<button type="button" class="btn btn--inverse daily-share-btn" data-action="share-daily">Share Result</button>' +
          '<button type="button" class="btn btn--secondary" data-action="replay-daily">Practice Replay</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  // Keeps the Daily Five card's countdown to the next puzzle (UTC midnight)
  // current: "5 h 12 m" on the card still to play, HH:MM:SS once played.
  // Each redraw of Today restarts it; it stops when the card is gone.
  function startDailyCountdown() {
    clearTimeout(startDailyCountdown._t);
    function tick() {
      const el = document.querySelector('[data-countdown]');
      if (!el) return;
      const next = new Date();
      next.setUTCHours(24, 0, 0, 0);
      const ms = next - new Date();
      // The day rolled over while the page sat open: show the new puzzle
      if (ms <= 0) { renderToday(); return; }
      const hrs = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      el.textContent = el.dataset.countdown === 'words'
        ? (hrs ? hrs + ' h ' : '') + mins + ' m'
        : String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      startDailyCountdown._t = setTimeout(tick, 1000);
    }
    tick();
  }

  function renderReviewCard() {
    const names = reviewDueNames();
    if (!names.length) {
      return '<section class="review review--empty" aria-label="Smart Review">' +
        '<span class="eyebrow">Smart Review</span>' +
        '<div class="review-body">' +
          '<span class="review-icon">' + icon('check', 'icon--lg') + '</span>' +
          '<div><strong>Nothing due</strong>' +
          '<p>Places you miss come back here when it is time to see them again.</p></div>' +
        '</div>' +
      '</section>';
    }
    const totals = mastery.totals();
    // A typical answer takes this player this long; eight seconds until there is history
    const perAnswer = totals.questions >= 20 ? Math.min(20, Math.max(4, totals.seconds / totals.questions)) : 8;
    const minutes = Math.max(1, Math.round(names.length * perAnswer / 60));
    const shown = names.slice(0, 2);
    return '<section class="review" aria-label="Smart Review">' +
      '<span class="eyebrow">Smart Review</span>' +
      '<div class="review-body">' +
        '<span class="num review-num">' + names.length + '</span>' +
        '<div><strong>' + (names.length === 1 ? 'place' : 'places') + ' due for review</strong>' +
        '<p>The ones you’re closest to forgetting. About ' + numberWord(minutes) + (minutes === 1 ? ' minute.' : ' minutes.') + '</p></div>' +
      '</div>' +
      '<div class="review-foot">' +
        '<div class="chips">' + shown.map(name => '<span class="chip">' + escapeHtml(name) + '</span>').join('') +
          (names.length > shown.length ? '<span class="chip chip--more">+' + (names.length - shown.length) + '</span>' : '') +
        '</div>' +
        '<button type="button" class="btn btn--primary" data-action="start-review">Start review</button>' +
      '</div>' +
    '</section>';
  }

  function renderToday() {
    const today = document.getElementById('home-today');
    if (!today) return;
    today.innerHTML = renderDailyCard() + renderReviewCard();
    startDailyCountdown();
  }

  /* ----- The Library ----- */

  const DIFFICULTY_INFO = {
    normal: { label: 'Normal', desc: 'Found targets stay marked on the map' },
    hard: { label: 'Hard', desc: 'No process of elimination — completed targets stay unmarked' },
    uncharted: { label: 'Uncharted', desc: 'Satellite only, no borders — a shape shows only once you answer' }
  };
  // Pin the City draws no names at any difficulty, so its three mean something else
  const PIN_DIFFICULTY_DESCS = {
    normal: 'Country borders drawn, no names',
    hard: 'No borders — just coastlines and your memory',
    uncharted: 'Satellite only, no borders'
  };

  // Difficulty picker. bests (optional): difficulty -> a line shown under its label.
  function renderDifficultySeg(extraClass, bests) {
    return '<div class="seg' + (extraClass ? ' ' + extraClass : '') + '" role="radiogroup" aria-label="Difficulty">' +
      Object.keys(DIFFICULTY_INFO).map(key =>
        '<button type="button" role="radio" data-action="set-difficulty" data-value="' + key + '">' +
          '<span>' + DIFFICULTY_INFO[key].label + '</span>' +
          (bests ? '<small>' + (bests[key] || 'No best yet') + '</small>' : '') +
        '</button>').join('') +
    '</div>';
  }

  function renderMapSeg(extraClass) {
    return '<div class="seg' + (extraClass ? ' ' + extraClass : '') + '" role="radiogroup" aria-label="Map style">' +
      '<button type="button" role="radio" data-action="set-map" data-value="parchment">' + icon('map', 'icon--sm') + 'Chart</button>' +
      '<button type="button" role="radio" data-action="set-map" data-value="satellite">' + icon('sat', 'icon--sm') + 'Satellite</button>' +
    '</div>';
  }

  // Bring every difficulty and map control on the page (Home's and the
  // level sheet's) in line with the settings. Uncharted is satellite only,
  // so the map control locks there.
  function syncPlayControls() {
    const uncharted = state.difficulty === 'uncharted';
    const satellite = uncharted || state.mapStyle === 'satellite';
    const mark = (btn, on) => {
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    };
    document.querySelectorAll('[data-action="set-difficulty"]').forEach(btn => mark(btn, btn.dataset.value === state.difficulty));
    document.querySelectorAll('[data-action="set-map"]').forEach(btn => {
      mark(btn, (btn.dataset.value === 'satellite') === satellite);
      btn.disabled = uncharted && btn.dataset.value !== 'satellite';
    });
    document.querySelectorAll('[data-difficulty-note]').forEach(el => {
      const descs = el.dataset.difficultyNote === 'pin' ? PIN_DIFFICULTY_DESCS : null;
      el.innerHTML = '<b>' + DIFFICULTY_INFO[state.difficulty].label + '</b> · ' +
        (descs ? descs[state.difficulty] : DIFFICULTY_INFO[state.difficulty].desc);
    });
    document.querySelectorAll('[data-map-note]').forEach(el => { el.hidden = !uncharted; });
  }

  function chooseDifficulty(difficulty) {
    if (difficulty === state.difficulty) return;
    setDifficulty(difficulty);
    saveDifficulty(state.difficulty);
    syncPlayControls();
    renderCollections();
    if (sheet.level) renderSheetInfo();
  }

  function chooseMapStyle(style) {
    if (state.difficulty === 'uncharted' || style === state.mapStyle) return;
    state.mapStyle = style;
    saveMapStyle(state.mapStyle);
    syncPlayControls();
  }

  // The Library's heading, controls and collection chips. Drawn once; the
  // collections under it are redrawn whenever progress or difficulty changes.
  function renderLibraryFrame() {
    const playable = LEVELS.filter(level => level.available).length;
    document.getElementById('home-library').innerHTML =
      '<div class="library-head">' +
        '<div>' +
          '<h2 class="display-l" id="library-title">The Library</h2>' +
          '<p>' + capitalize(numberWord(playable)) + ' levels in ' + numberWord(COLLECTIONS.length) + ' collections.</p>' +
        '</div>' +
        '<div>' +
          '<div class="playbar">' +
            '<div class="field"><span class="eyebrow">Difficulty</span>' + renderDifficultySeg() + '</div>' +
            '<div class="field"><span class="eyebrow">Map</span>' + renderMapSeg() + '</div>' +
          '</div>' +
          '<p class="playbar-note" data-difficulty-note></p>' +
        '</div>' +
      '</div>' +
      '<nav class="chips jump" aria-label="Collections">' +
        COLLECTIONS.map(collection =>
          '<button type="button" class="chip" data-action="jump" data-collection="' + collection.key + '">' + escapeHtml(collection.title) + '</button>').join('') +
      '</nav>' +
      '<div id="library-collections"></div>';
  }

  function renderLevelCard(level, lead) {
    const title = escapeHtml(level.title);
    if (!level.available) {
      return '<div class="level is-soon">' +
        '<span class="level-title">' + title + '</span>' +
        '<span class="level-sub"><span class="level-meta">Coming soon</span></span>' +
        '<span class="level-due"><span class="tag">Soon</span></span>' +
      '</div>';
    }

    const summary = levelSummary(level);
    if (!summary) loadLevelData(level);
    const said = [level.title, levelCountText(level)];

    let meta = levelCountText(level);
    let best = '';
    if (level.mode === 'city-pin') {
      const stats = levelPinStats(level, state.difficulty);
      if (stats.games && stats.recentKm != null) meta += ' · avg ' + formatKm(stats.recentKm);
      if (stats.games) best = '<em>Best</em>' + levelBestText(level, state.difficulty);
    } else {
      const rec = levelRecord(level, state.difficulty);
      if (rec && rec.bestAccuracy) {
        best = '<em>Best</em>' + levelBestText(level, state.difficulty) +
          (rec.bestTime ? '<span class="t"><span class="sep">·</span>' + formatTimeSeconds(rec.bestTime.value) + '</span>' : '');
      }
    }
    const hasBest = !!best;
    const ladder = level.mode === 'province' ? getLearnProgress(level.arg) : null;
    const untouched = !!summary && !summary.seen && !ladder && !levelPlayed(level);
    if (hasBest) {
      said.push('best ' + levelBestText(level, state.difficulty).replace(' / ', ' of '));
    } else if (!untouched) {
      best = ladder ? 'Learning · level ' + ladder.level + ' of ' + ladder.order.length
        : levelPlayed(level) ? 'Not played on ' + DIFFICULTY_INFO[state.difficulty].label
        : 'Not played yet';
      said.push(best);
    }

    // Trailing slot: what there is to do here, if anything
    let due = '';
    if (summary && summary.due > 0) due = summary.due + ' due';
    else if (untouched) due = 'New';
    if (due) said.push(due);
    if (summary && summary.seen) said.splice(2, 0, summary.mastered + ' of ' + summary.total + ' mastered');

    const blurb = lead && LEAD_BLURBS[level.key];
    return '<a class="level' + (lead ? ' level--feature' : '') + (hasBest ? '' : ' no-best') + '" href="?play=' + level.key +
        '" data-action="open-level" data-level="' + level.key + '" aria-haspopup="dialog" aria-label="' + escapeHtml(said.join(', ')) + '">' +
      '<span class="level-title">' + title + '</span>' +
      '<span class="level-sub"><span class="level-meta">' + meta + '</span>' + (best ? '<span class="level-best">' + best + '</span>' : '') + '</span>' +
      (blurb ? '<span class="level-blurb">' + blurb + '</span>' : '') +
      '<span class="level-due' + (summary && summary.due > 0 ? ' is-due' : '') + '">' + due + '</span>' +
      renderRing(summary) +
    '</a>';
  }

  function renderCollections() {
    const container = document.getElementById('library-collections');
    if (!container) return;
    const focused = document.activeElement && container.contains(document.activeElement)
      ? document.activeElement.dataset.level : null;

    container.innerHTML = COLLECTIONS.map(collection => {
      const levels = LEVELS.filter(level => level.collection === collection.key);
      const sum = addSummaries(skillSummaries(levels));
      // Seven cards sit as a wide lead plus two rows of three; six as two rows of three
      const lead = levels.length % 4 === 3;
      const three = !lead && levels.length % 3 === 0 && levels.length % 4 !== 0;
      return '<section class="collection" id="collection-' + collection.key + '" aria-labelledby="collection-' + collection.key + '-title">' +
        '<header class="collection-head">' +
          '<span class="collection-icon">' + icon(collection.icon) + '</span>' +
          '<h3 class="collection-title" id="collection-' + collection.key + '-title">' + escapeHtml(collection.title) + '</h3>' +
          '<p class="collection-desc">' + escapeHtml(collection.desc) + '.</p>' +
          '<span class="collection-sum">' + renderMasteryBar(sum) +
            '<span><b>' + sum.mastered.toLocaleString('en-US') + '</b> of ' + sum.total.toLocaleString('en-US') + '<span class="x"> mastered</span></span>' +
          '</span>' +
        '</header>' +
        '<div class="levels' + (three ? ' levels--three' : '') + '">' +
          levels.map((level, i) => renderLevelCard(level, lead && i === 0)).join('') +
        '</div>' +
      '</section>';
    }).join('');

    if (focused) {
      const card = container.querySelector('[data-level="' + focused + '"]');
      if (card) card.focus({ preventScroll: true });
    }
  }

  function jumpToCollection(key) {
    const section = document.getElementById('collection-' + key);
    if (section) section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* =========================================================
   * SMART REVIEW (what is due, as a playlist of practice rounds)
   *
   * Due names come from the mastery store, skill by skill. Each is handed
   * to a level that can quiz exactly those names as a practice round, so a
   * review never touches records or focus lists. The rounds run largest
   * first; after each, the results screen offers the next.
   * ========================================================= */

  // Skills taught by several levels name the one that hosts their reviews.
  // The rest (cities, provinces) go to whichever level holds each name.
  const REVIEW_HOSTS = { 'country': 'world', 'us-state': 'us-state', 'us-capital': 'us-state-to-capital' };

  // The levels that can run reviews for a skill; none for Pin the City,
  // whose practice rounds would be saved as full games
  function reviewLevels(skill) {
    if (REVIEW_HOSTS[skill]) return [levelByKey(REVIEW_HOSTS[skill])];
    return LEVELS.filter(level => level.skill === skill && level.available && level.mode !== 'city-pin');
  }

  // Due names per reviewable skill, biggest group first. Names the store
  // still holds for something no level asks any more are left out, as far
  // as the maps loaded so far can tell.
  function reviewDue() {
    const skills = [];
    LEVELS.forEach(level => {
      if (level.available && level.mode !== 'city-pin' && skills.indexOf(level.skill) === -1) skills.push(level.skill);
    });
    return skills.map(skill => {
      const levels = reviewLevels(skill);
      let names = mastery.due(skill);
      if (levels.every(level => level.ready())) {
        const asked = new Set();
        levels.forEach(level => level.names().forEach(name => asked.add(name)));
        names = names.filter(name => asked.has(name));
      }
      return { skill: skill, levels: levels, names: names };
    }).filter(group => group.names.length > 0).sort((a, b) => b.names.length - a.names.length);
  }

  function reviewDueNames() {
    return reviewDue().reduce((all, group) => all.concat(group.names), []);
  }

  function reviewDueCount() {
    return reviewDueNames().length;
  }

  // Resolves to the review as practice rounds, largest first:
  // [{ level, names }]. Loads the maps it needs; a skill whose map can't be
  // fetched is left for another day.
  async function buildReviewPlaylist() {
    const steps = [];
    for (const group of reviewDue()) {
      try {
        await Promise.all(group.levels.map(level => level.load()));
      } catch (err) {
        continue;
      }
      const left = new Set(group.names);
      group.levels.forEach(level => {
        const names = level.names().filter(name => left.has(name));
        names.forEach(name => left.delete(name));
        if (names.length) steps.push({ level: level, names: names });
      });
    }
    return steps.sort((a, b) => b.names.length - a.names.length);
  }

  async function startReview() {
    if (startReview.busy) return;
    startReview.busy = true;
    showLoadingOverlay('Gathering your review');
    let steps = [];
    try {
      steps = await buildReviewPlaylist();
    } finally {
      hideLoadingOverlay();
      startReview.busy = false;
    }
    if (!steps.length) {
      renderToday();
      showNotice('Nothing could be gathered for review just now.');
      return;
    }
    state.review = { queue: steps };
    startNextReview();
  }

  // Play the next round of the review in progress
  function startNextReview() {
    const review = state.review;
    const step = review && review.queue.shift();
    if (!step) return;
    startGame(step.level.arg, { practice: step.names, review: review });
  }

  // The results action that carries a review on: "Next: 6 states" while
  // rounds are left, hidden otherwise
  function showReviewNext() {
    const step = state.review && state.review.queue[0];
    const btn = document.getElementById('review-next-btn');
    btn.style.display = step ? '' : 'none';
    if (step) btn.textContent = 'Next: ' + countNoun(step.names.length, step.level.noun);
  }

  /* =========================================================
   * LEVEL SHEET (what a level card opens)
   *
   * One dialog per level: its mastery, bests at each difficulty, the ways
   * to play it (a full round; focus practice when the last full round left
   * a list; Learn for province levels), difficulty and map style, and
   * Start. Centred on wide windows, a bottom sheet on phones.
   * ========================================================= */

  // What a round of each mode asks for, in a few words
  const MODE_HOW = {
    'world-country': 'find each on the map',
    'us-state': 'find each on the map',
    'us-capital-to-state': 'a capital is named, find its state',
    'us-state-to-capital': 'a state is shown, pick its capital',
    'us-city': 'find each city on the map',
    'city-pin': 'drop a pin, score by how close you land',
    'province': 'find each on the map'
  };

  // The level on show (null when closed), the way to play picked in it, and
  // the card that opened it, which gets the focus back
  const sheet = { level: null, way: 'play', opener: null };

  function openLevelSheet(key, opener) {
    const level = levelByKey(key);
    if (!level || !level.available) return;
    sheet.level = level;
    sheet.way = 'play';
    sheet.opener = opener || null;
    renderSheetInfo();
    renderSheetPlay();
    document.getElementById('level-sheet-scrim').hidden = false;
    document.getElementById('level-sheet').hidden = false;
    document.getElementById('sheet-start-btn').focus();
    // A province map that isn't in yet: fetch it now, so the breakdown can
    // fill in and Start has nothing left to wait for
    if (!level.ready()) {
      level.load().then(() => {
        if (sheet.level === level) renderSheetInfo();
        refreshView();
      }, () => { /* Start will try again and say so if it still can't */ });
    }
  }

  // opts.keepFocus: leave the focus where it is (a round is about to start)
  function closeLevelSheet(opts) {
    if (!sheet.level) return;
    const key = sheet.level.key;
    const opener = sheet.opener;
    sheet.level = null;
    sheet.opener = null;
    document.getElementById('level-sheet-scrim').hidden = true;
    document.getElementById('level-sheet').hidden = true;
    if (opts && opts.keepFocus) return;
    // The library may have been redrawn since: find the card again by its level
    const card = opener && document.contains(opener) ? opener : document.querySelector('[data-level="' + key + '"]');
    if (card) card.focus({ preventScroll: true });
  }

  function renderSheetInfo() {
    const level = sheet.level;
    const collection = COLLECTIONS.find(c => c.key === level.collection);
    const round = PROVINCE_ROUNDS[level.arg];
    const summary = levelSummary(level);
    const pin = level.mode === 'city-pin';
    const dash = '—';

    let mastered = '';
    if (summary) {
      const step = (n, cls, label) =>
        '<div><dd class="num">' + n + '</dd><dt><i class="swatch' + (cls ? ' ' + cls : '') + '"></i>' + label + '</dt></div>';
      mastered =
        '<div class="sheet-block">' +
          '<p class="eyebrow">Your mastery <span class="muted">' + summary.mastered + ' of ' + summary.total + ' mastered</span></p>' +
          renderMasteryBar(summary, 'mbar--lg') +
          '<dl class="breakdown">' +
            step(summary.mastered, 'm3', 'Mastered') + step(summary.familiar, 'm2', 'Familiar') +
            step(summary.learning, 'm1', 'Learning') + step(summary.new, '', 'New') +
          '</dl>' +
        '</div>';
    }

    let rows = '';
    let games = 0;
    let last = 0;
    Object.keys(DIFFICULTY_INFO).forEach(d => {
      let cells;
      if (pin) {
        const stats = levelPinStats(level, d);
        games += stats.games;
        cells = stats.games
          ? '<td class="is-strong">' + stats.best.toLocaleString('en-US') + '</td><td>' + Math.round(stats.recentAvg).toLocaleString('en-US') +
            '</td><td>' + (stats.recentKm != null ? formatKm(stats.recentKm) : dash) + '</td><td>' + stats.games + '</td>'
          : null;
      } else {
        const rec = levelRecord(level, d);
        if (rec) {
          games += rec.gamesPlayed || 0;
          last = Math.max(last, new Date(rec.lastPlayed).getTime() || 0);
        }
        cells = rec && rec.bestAccuracy
          ? '<td class="is-strong">' + rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total + '</td><td>' +
            (rec.bestTime ? formatTimeSeconds(rec.bestTime.value) : dash) + '</td><td>' + rec.bestAccuracy.pct + '%</td><td>' + (rec.gamesPlayed || 0) + '</td>'
          : null;
      }
      rows += '<tr class="' + (d === state.difficulty ? 'is-current' : '') + (cells ? '' : ' is-empty') + '">' +
        '<th scope="row">' + DIFFICULTY_INFO[d].label + '</th>' +
        (cells || '<td>' + dash + '</td><td>' + dash + '</td><td>' + dash + '</td><td>0</td>') + '</tr>';
    });
    if (pin) {
      const store = loadPinStore().games.filter(g => g.region === resolveGameTarget(level.arg).region);
      last = store.reduce((m, g) => Math.max(m, g.at || 0), 0);
    }
    const head = pin ? ['Best', 'Average', 'Avg miss', 'Rounds'] : ['Best', 'Time', 'Accuracy', 'Rounds'];
    let note = games ? (games === 1 ? '1 round' : games + ' rounds') + ' in all' : 'No full round played yet';
    if (games && last) {
      note = 'Last played ' + new Date(last).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + note;
    }
    if (pin) {
      note += '. 100 points within ' + PIN_PERFECT_KM + ' km of the city · ' + pinPoints(100) + ' at 100 km · ' +
        pinPoints(250) + ' at 250 km · ' + pinPoints(500) + ' at 500 km · ' + pinPoints(1000) + ' at 1,000 km';
    }

    document.getElementById('sheet-info').innerHTML =
      '<header class="sheet-head">' +
        '<p class="eyebrow">' + escapeHtml(collection.title) + '</p>' +
        '<h2 class="display-l" id="sheet-title">' + escapeHtml(level.title) + '</h2>' +
        '<p class="sheet-sub">' + (round ? capitalize(round.subname) : levelCountText(level)) +
          '<span class="x"> · ' + MODE_HOW[level.mode] + '</span></p>' +
      '</header>' +
      mastered +
      '<div class="sheet-block sheet-block--bests">' +
        '<p class="eyebrow">Personal bests</p>' +
        '<table class="bests">' +
          '<thead><tr><th scope="col">Difficulty</th>' + head.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<p class="sheet-note">' + note + '</p>' +
      '</div>';
  }

  // The ways to play this level: [{ key, icon, title, desc, count }]
  function sheetWays(level) {
    const count = level.count();
    const drawn = level.mode === 'city-pin' && count > PIN_ROUND_SIZE;
    const ways = [{
      key: 'play', icon: 'play', title: 'Play',
      desc: (drawn ? capitalize(numberWord(PIN_ROUND_SIZE)) + ' cities drawn from ' + count : 'All ' + countNoun(count, level.noun) + ', in random order') +
        ' · counts toward your records'
    }];
    const focus = levelFocusList(level);
    if (focus) {
      const n = focus.names.length;
      const savedOn = new Date(focus.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ways.push({
        key: 'focus', icon: 'focus', title: 'Focus Practice', count: n,
        desc: (n === 1 ? 'Just the one' : 'Just the ' + numberWord(n)) + ' you missed or found on a second try in your last full game (' + savedOn +
          ') · practice only, your records stay as they are'
      });
    }
    if (level.mode === 'province') {
      const ladder = getLearnProgress(level.arg);
      ways.push({
        key: 'learn', icon: 'learn', title: ladder ? 'Keep Learning' : 'Learn Them',
        desc: (ladder ? 'Pick up at level ' + ladder.level + ' of ' + ladder.order.length + ' · ' : '') +
          'Start with one, add one each level. A miss restarts the level · practice only'
      });
    }
    return ways;
  }

  function renderSheetPlay() {
    const level = sheet.level;
    const ways = sheetWays(level);
    if (!ways.some(way => way.key === sheet.way)) sheet.way = 'play';
    const bests = {};
    Object.keys(DIFFICULTY_INFO).forEach(d => { bests[d] = levelBestText(level, d); });
    const ladder = level.mode === 'province' ? getLearnProgress(level.arg) : null;

    document.getElementById('sheet-play').innerHTML =
      '<div>' +
        '<p class="eyebrow" id="sheet-ways-label">Ways to play</p>' +
        '<div class="modes" role="radiogroup" aria-labelledby="sheet-ways-label">' +
          ways.map(way =>
            '<button type="button" class="mode" role="radio" data-action="sheet-way" data-value="' + way.key + '" aria-checked="' + (way.key === sheet.way) +
              '" tabindex="' + (way.key === sheet.way ? 0 : -1) + '">' +
              '<span class="mode-icon">' + icon(way.icon) + '</span>' +
              '<span class="mode-text"><strong>' + way.title + (way.count ? ' <i class="count">' + way.count + '</i>' : '') + '</strong>' +
                '<span>' + way.desc + '</span></span>' +
              '<span class="radio"></span>' +
            '</button>').join('') +
        '</div>' +
        (ladder ? '<button type="button" class="link sheet-reset" data-action="sheet-learn-reset">Start learning over from one</button>' : '') +
      '</div>' +
      '<div class="sheet-options">' +
        '<div class="option">' +
          '<p class="eyebrow">Difficulty</p>' +
          renderDifficultySeg('seg--block seg--rich', bests) +
          '<p class="option-note" data-difficulty-note="' + (level.mode === 'city-pin' ? 'pin' : '') + '"></p>' +
        '</div>' +
        '<div class="option">' +
          '<p class="eyebrow">Map</p>' +
          renderMapSeg('seg--block') +
          '<p class="option-note" data-map-note hidden>Always on in Uncharted</p>' +
        '</div>' +
      '</div>';
    syncPlayControls();
    renderSheetStart();
  }

  // Start's label says what is about to begin
  function renderSheetStart() {
    const level = sheet.level;
    let what = levelCountText(level);
    if (sheet.way === 'focus') {
      const focus = levelFocusList(level);
      what = focus ? focus.names.length + ' to revisit' : what;
    } else if (sheet.way === 'learn') {
      const ladder = getLearnProgress(level.arg);
      what = ladder ? 'level ' + ladder.level + ' of ' + ladder.order.length : 'from one';
    }
    document.getElementById('sheet-start-btn').innerHTML =
      (sheet.way === 'learn' ? 'Learn' : 'Start') + ' <span class="btn-count">· ' + what + '</span>' + icon('arrow');
  }

  function chooseSheetWay(way) {
    sheet.way = way;
    document.querySelectorAll('[data-action="sheet-way"]').forEach(btn => {
      const on = btn.dataset.value === way;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    renderSheetStart();
  }

  // Start the level the way the sheet says. opts.learnFresh: begin the
  // Learn ladder again from one.
  function startFromSheet(opts) {
    const level = sheet.level;
    if (!level) return;
    const way = opts && opts.learnFresh ? 'learn' : sheet.way;
    const focus = levelFocusList(level);
    closeLevelSheet({ keepFocus: true });
    if (way === 'learn') startGame(level.arg, { learn: true, learnFresh: !!(opts && opts.learnFresh) });
    else if (way === 'focus' && focus) startGame(level.arg, { practice: focus.names });
    else startGame(level.arg);
  }

  // Escape closes the sheet; Tab stays inside it
  document.addEventListener('keydown', (e) => {
    if (!sheet.level) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLevelSheet();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('level-sheet');
    const stops = Array.from(panel.querySelectorAll('button, a[href], [tabindex]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!panel.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Arrow keys move through a radio group and pick as they go, the way
  // native radio buttons do
  document.addEventListener('keydown', (e) => {
    const radio = e.target && e.target.getAttribute && e.target.getAttribute('role') === 'radio' ? e.target : null;
    if (!radio) return;
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
    if (!step) return;
    const group = radio.closest('[role="radiogroup"]');
    const radios = group ? Array.from(group.querySelectorAll('[role="radio"]')).filter(el => !el.disabled) : [];
    if (radios.length < 2) return;
    e.preventDefault();
    const next = radios[(radios.indexOf(radio) + step + radios.length) % radios.length];
    next.focus();
    next.click();
  });

