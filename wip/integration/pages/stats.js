  /* =========================================================
   * STATS (the progress page)
   *
   * Drawn into #stats-content from the stores as they stand: the mastery
   * store for the headline figures, the breakdown by collection and
   * level, the calendar and the places that need work; atlas-records for
   * the bests; atlas-daily-attempts and atlas-pin for their own panels.
   * Every value is printed on the page; nothing waits behind a hover.
   * ========================================================= */

  const STATS_WEEKS = 12;
  // Answers in a day that reach each calendar shade, lightest first
  const HEAT_STEPS = [1, 10, 25, 50];
  const WEAK_ROWS = 8;
  // A place needs work while its first-try rate is under this
  const WEAK_BELOW = 0.7;
  const DAILY_STRIP_DAYS = 30;
  const PIN_TREND_ROUNDS = 12;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Which collections are opened out into their levels in the mastery
  // table: every one on a wide window, none on a phone, then as toggled
  const statsOpen = new Map();

  function formatCount(n) {
    return n.toLocaleString('en-US');
  }

  // Seconds as a figure with small units: "7h 05m", or "42m" under an hour
  function durationFigure(seconds) {
    const mins = Math.round(seconds / 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? h + '<small>h</small>' + String(m).padStart(2, '0') + '<small>m</small>' : m + '<small>m</small>';
  }

  // Seconds in running text: "7 h 5 min", "42 min"
  function durationText(seconds) {
    const mins = Math.round(seconds / 60);
    const h = Math.floor(mins / 60);
    return (h ? h + ' h ' : '') + (mins % 60) + ' min';
  }

  // "12 Nov", with the year when it isn't this one
  function shortDate(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] +
      (date.getFullYear() === new Date().getFullYear() ? '' : ' ' + date.getFullYear());
  }

  // A stored 'YYYY-MM-DD' as a date on the local calendar
  function dateFromKey(key) {
    const parts = String(key).slice(0, 10).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  // Totals over rows of mastery.activity()
  function sumActivity(days) {
    return days.reduce((sum, day) => {
      sum.games += day.games;
      sum.questions += day.questions;
      sum.firstTry += day.firstTry;
      sum.seconds += day.seconds;
      if (day.games) sum.active++;
      return sum;
    }, { games: 0, questions: 0, firstTry: 0, seconds: 0, active: 0 });
  }

  // The smallest round number at or above v, for the end of an axis
  function niceCeil(v) {
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
    return [1, 2, 2.5, 4, 5, 8, 10].map(step => step * mag).find(end => end >= v);
  }

  function renderEmpty(text, action) {
    return '<div class="empty"><p>' + text + '</p>' + (action || '') + '</div>';
  }

  function renderStats() {
    document.getElementById('stats-content').innerHTML =
      '<header class="page-head"><div>' +
        '<p class="eyebrow">Your atlas</p>' +
        '<h1 class="display-l">Statistics</h1>' +
        (isNewPlayer() ? '<p>Nothing has been played on this device yet. Each panel fills in as you play.</p>' : '') +
      '</div></header>' +
      renderStatsFigures() +
      '<div class="panels">' +
        renderStatsMastery() + renderStatsActivity() + renderStatsWeak() + renderStatsDaily() +
        renderStatsRecords() + renderStatsPin() +
      '</div>';
  }

  /* ----- Headline figures ----- */

  function renderStatsFigures() {
    const totals = mastery.totals();
    const all = addSummaries(skillSummaries(LEVELS));
    const days = mastery.activity(60);
    const month = sumActivity(days.slice(30));
    const before = sumActivity(days.slice(0, 30));
    const week = sumActivity(days.slice(-7));
    const streak = mastery.streak();
    const kpi = (label, value, sub, extra) =>
      '<div class="kpi"><dt class="eyebrow">' + label + '</dt>' +
        '<dd class="num' + (value === null ? ' is-empty' : '') + '">' + (value === null ? '—' : value) + '</dd>' +
        (extra || '') + '<span class="kpi-sub">' + sub + '</span></div>';

    const pct = month.questions ? Math.round(month.firstTry / month.questions * 100) : null;
    let accuracySub = 'last 30 days';
    // Compared with the month before, once that month has enough answers to mean something
    if (pct !== null && before.questions >= 20) {
      const change = pct - Math.round(before.firstTry / before.questions * 100);
      accuracySub = change === 0 ? 'last 30 days, level with the 30 before'
        : '<b>' + (change > 0 ? '+' : '−') + Math.abs(change) + (Math.abs(change) === 1 ? ' pt' : ' pts') + '</b> on the 30 days before';
    }

    return '<dl class="kpis" aria-label="Your progress">' +
      kpi('Places mastered',
        totals.itemsSeen ? formatCount(all.mastered) + '<span class="of">of ' + formatCount(all.total) + '</span>' : null,
        totals.itemsSeen ? formatCount(all.familiar) + ' familiar · ' + formatCount(all.learning) + ' learning · ' + formatCount(all.new) + ' new'
          : 'of ' + formatCount(all.total) + ' places',
        totals.itemsSeen ? renderMasteryBar(all) : '') +
      kpi('First-try accuracy', pct === null ? null : pct + '<small>%</small>', accuracySub) +
      kpi('Day streak', totals.games ? streak.current : null,
        totals.games ? 'longest ' + streak.longest + (streak.longest === 1 ? ' day' : ' days') : 'starts with a round') +
      kpi('Rounds played', totals.games ? formatCount(totals.games) : null,
        totals.games ? formatCount(week.games) + ' in the last 7 days' : 'none yet') +
      kpi('Time played', totals.seconds ? durationFigure(totals.seconds) : null,
        totals.seconds && totals.daysActive ? 'about ' + Math.max(1, Math.round(totals.seconds / totals.daysActive / 60)) + ' min on a day you play' : 'none yet') +
    '</dl>';
  }

  /* ----- Mastery by collection and level ----- */

  function renderStatsMastery() {
    const wide = !window.matchMedia || window.matchMedia('(min-width: 761px)').matches;
    const count = (n, unit) => '<td class="mtable-n' + (n ? '' : ' is-zero') + '">' + formatCount(n) +
      '<span class="mtable-unit"> ' + unit + '</span></td>';
    // The cells after a row's name; a level whose names aren't in yet says so
    const cells = summary => summary
      ? '<td class="mtable-bar">' + renderMasteryBar(summary, 'mbar--sm') + '</td>' +
        count(summary.mastered, 'mastered') + count(summary.familiar, 'familiar') +
        count(summary.learning, 'learning') + count(summary.new, 'new') +
        '<td class="mtable-total">of ' + formatCount(summary.total) + '</td>'
      : '<td class="mtable-bar"></td><td class="mtable-n" colspan="4">Loading</td><td class="mtable-total"></td>';

    const groups = COLLECTIONS.map(collection => {
      const levels = LEVELS.filter(level => level.collection === collection.key && level.available);
      if (!statsOpen.has(collection.key)) statsOpen.set(collection.key, wide);
      const open = statsOpen.get(collection.key);
      return '<tbody>' +
        '<tr class="mtable-group"><th scope="row">' +
          '<button type="button" class="mtable-toggle" data-action="toggle-stats-group" data-collection="' + collection.key +
            '" aria-expanded="' + open + '">' + icon('chevron', 'icon--sm') + escapeHtml(collection.title) + '</button></th>' +
          cells(addSummaries(skillSummaries(levels))) +
        '</tr>' +
        levels.map(level => {
          const summary = levelSummary(level);
          if (!summary) loadLevelData(level);
          return '<tr class="mtable-level"' + (open ? '' : ' hidden') + '><th scope="row">' + escapeHtml(level.title) + '</th>' +
            cells(summary) + '</tr>';
        }).join('') +
      '</tbody>';
    }).join('');

    const step = (cls, name) => '<th scope="col" class="mtable-n"><span class="swatch' + (cls ? ' ' + cls : '') + '"></span><span class="vh">' + name + '</span></th>';
    return '<section class="panel panel--7" aria-labelledby="stats-mastery-title">' +
      '<div class="panel-head">' +
        '<div><h2 id="stats-mastery-title">Mastery</h2><p>How well each place has stuck, by collection and level.</p></div>' +
        '<div class="legend" aria-hidden="true">' +
          '<span><i class="swatch m3"></i>Mastered</span><span><i class="swatch m2"></i>Familiar</span>' +
          '<span><i class="swatch m1"></i>Learning</span><span><i class="swatch"></i>New</span>' +
        '</div>' +
      '</div>' +
      '<table class="mtable">' +
        '<thead><tr><th scope="col"><span class="vh">Collection or level</span></th><th scope="col"><span class="vh">Share</span></th>' +
          step('m3', 'Mastered') + step('m2', 'Familiar') + step('m1', 'Learning') + step('', 'New') +
          '<th scope="col" class="mtable-total"><span class="vh">Places</span></th></tr></thead>' +
        groups +
      '</table>' +
    '</section>';
  }

  // Open or close one collection's levels in the mastery table
  function toggleStatsGroup(button) {
    const open = !statsOpen.get(button.dataset.collection);
    statsOpen.set(button.dataset.collection, open);
    button.setAttribute('aria-expanded', String(open));
    button.closest('tbody').querySelectorAll('.mtable-level').forEach(row => { row.hidden = !open; });
  }

  /* ----- Activity calendar ----- */

  function renderStatsActivity() {
    const all = mastery.activity(STATS_WEEKS * 7);
    // Columns are weeks that run Monday to Sunday; the last one holds today
    const weekday = (dateFromKey(all[all.length - 1].date).getDay() + 6) % 7;
    const shown = all.slice(all.length - ((STATS_WEEKS - 1) * 7 + weekday + 1));
    const sum = sumActivity(shown);

    let cells = '';
    for (let i = 0; i < STATS_WEEKS * 7; i++) {
      const day = shown[i];
      if (!day) {
        cells += '<i class="is-future"></i>';
        continue;
      }
      const shade = HEAT_STEPS.filter(min => day.questions >= min).length;
      cells += '<i class="h' + shade + (i === shown.length - 1 ? ' is-today' : '') + '"></i>';
    }
    let months = '';
    let sums = '';
    for (let w = 0; w < STATS_WEEKS; w++) {
      const month = dateFromKey(shown[w * 7].date).getMonth();
      const turned = w === 0 || month !== dateFromKey(shown[(w - 1) * 7].date).getMonth();
      months += '<span>' + (turned ? MONTHS[month] : '') + '</span>';
      sums += '<span>' + (sumActivity(shown.slice(w * 7, w * 7 + 7)).questions || '–') + '</span>';
    }
    const legend = '<span><i></i>0</span>' + HEAT_STEPS.map((min, i) =>
      '<span><i class="h' + (i + 1) + '"></i>' + (i + 1 < HEAT_STEPS.length ? min + '–' + (HEAT_STEPS[i + 1] - 1) : min + '+') + '</span>').join('');

    return '<section class="panel panel--5" aria-labelledby="stats-activity-title">' +
      '<div class="panel-head"><div><h2 id="stats-activity-title">Activity</h2>' +
        '<p>Answers each day over the last ' + STATS_WEEKS + ' weeks, and each week’s total.</p></div></div>' +
      '<div class="cal">' +
        '<div class="cal-months" aria-hidden="true">' + months + '</div>' +
        '<div class="cal-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>' +
        '<div class="cal-grid" role="img" aria-label="' + (sum.active
          ? sum.active + ' active days in the last ' + STATS_WEEKS + ' weeks'
          : 'No activity in the last ' + STATS_WEEKS + ' weeks') + '">' + cells + '</div>' +
        '<span class="cal-sums-label">Week</span>' +
        '<div class="cal-sums" aria-label="Answers each week, oldest first">' + sums + '</div>' +
      '</div>' +
      '<div class="panel-foot cal-foot">' +
        '<span>' + (sum.games
          ? '<b>' + sum.active + '</b> active ' + (sum.active === 1 ? 'day' : 'days') + ' · <b>' + formatCount(sum.games) + '</b> ' + (sum.games === 1 ? 'round' : 'rounds') +
            ' · <b>' + formatCount(sum.questions) + '</b> answers · <b>' + durationText(sum.seconds) + '</b>'
          : 'No rounds in these weeks. A day lights up once you finish one.') + '</span>' +
        '<span class="heat-legend" aria-label="Answers in a day">' + legend + '</span>' +
      '</div>' +
    '</section>';
  }

  /* ----- Needs work ----- */

  // What a skill's places are called in a list that mixes skills
  function skillLabel(skill) {
    if (skill.indexOf('province:') === 0) {
      const country = PROVINCE_COUNTRIES[skill.slice('province:'.length)];
      if (country) return country.name;
    }
    const named = { 'country': 'Countries', 'us-state': 'US states', 'us-capital': 'US capitals', 'us-city': 'US cities' };
    if (named[skill]) return named[skill];
    const level = LEVELS.find(l => l.skill === skill);
    return level ? capitalize(level.noun) : 'Places';
  }

  // The places with the lowest first-try rates among those a practice
  // round can quiz, weakest first: [{ skill, name, item }]
  function weakPlaces() {
    const rows = [];
    reviewGroups(skill => mastery.weakest(skill)).forEach(group => {
      group.names.forEach(name => {
        const item = mastery.get(group.skill, name);
        if (item.accuracy !== null && item.accuracy < WEAK_BELOW) rows.push({ skill: group.skill, name: name, item: item });
      });
    });
    return rows.sort((a, b) => a.item.accuracy - b.item.accuracy || b.item.missed - a.item.missed || b.item.last - a.item.last)
      .slice(0, WEAK_ROWS);
  }

  // Practice the places listed under Needs work, as a review playlist
  function startWeakPractice() {
    const bySkill = new Map();
    weakPlaces().forEach(row => {
      if (!bySkill.has(row.skill)) bySkill.set(row.skill, []);
      bySkill.get(row.skill).push(row.name);
    });
    startReview(Array.from(bySkill, ([skill, names]) => ({ skill: skill, levels: reviewLevels(skill), names: names })));
  }

  function renderStatsWeak() {
    const rows = weakPlaces();
    const list = rows.map((row, i) => {
      const pct = Math.round(row.item.accuracy * 100);
      return '<li><span class="weak-rank">' + (i + 1) + '</span>' +
        '<div><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(skillLabel(row.skill)) + ' · ' +
          row.item.first + ' of ' + row.item.seen + ' on the first try</small></div>' +
        '<span class="meter" aria-hidden="true"><i style="--v:' + pct + '"></i></span>' +
        '<span class="weak-pct">' + pct + '%</span></li>';
    }).join('');
    const limit = Math.round(WEAK_BELOW * 100) + '%';
    return '<section class="panel panel--5" aria-labelledby="stats-weak-title">' +
      '<div class="panel-head"><div><h2 id="stats-weak-title">Needs work</h2>' +
        '<p>Your weakest places, by how often the first try lands.</p></div></div>' +
      (rows.length
        ? '<ol class="weak">' + list + '</ol>' +
          '<div class="panel-foot"><span>Seen at least twice, first try under ' + limit + '</span>' +
            '<button type="button" class="btn btn--primary" data-action="practice-weak">Practice ' +
              (rows.length === 1 ? 'this one' : 'these ' + rows.length) + '</button></div>'
        : renderEmpty(mastery.totals().itemsSeen
          ? 'Nothing needs work. Every place you have seen twice or more lands on the first try at least ' + limit + ' of the time.'
          : 'Nothing here yet. Once a place has been asked twice and keeps slipping, it is listed here with a way to practice it.')) +
    '</section>';
  }

  /* ----- Daily Five ----- */

  function renderStatsDaily() {
    const days = dailyDays(DAILY_STRIP_DAYS);
    const played = days.filter(day => day.attempt);
    const head = '<div class="panel-head"><div><h2 id="stats-daily-title">Daily Five</h2>' +
      '<p>One puzzle a day, scored out of 10. The last ' + DAILY_STRIP_DAYS + ' days.</p></div></div>';
    if (!played.length) {
      return '<section class="panel panel--7" aria-labelledby="stats-daily-title">' + head +
        renderEmpty('No Daily Five in the last ' + DAILY_STRIP_DAYS + ' days. Each day you play appears here with its score, and your streak starts counting.',
          '<button type="button" class="btn btn--secondary" data-action="play-daily">Play today’s five ' + icon('arrow') + '</button>') +
      '</section>';
    }

    let best = 0;
    let run = 0;
    days.forEach(day => {
      run = day.attempt ? run + 1 : 0;
      best = Math.max(best, run);
    });
    const scores = played.map(day => day.attempt.score || 0);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const perfect = played.filter(day => day.attempt.score === day.attempt.total * 2).length;
    // Rounds counted in the records reach back before these thirty days
    const ever = Object.keys(DIFFICULTY_INFO).reduce((n, difficulty) => {
      const rec = getRecords('Daily', difficulty, 'daily-five');
      return n + (rec ? rec.gamesPlayed || 0 : 0);
    }, 0);
    const fig = (label, value, unit) => '<div><dt class="eyebrow">' + label + '</dt><dd class="num">' + value +
      (unit ? '<small>' + unit + '</small>' : '') + '</dd></div>';

    const todayKey = todayUtcKey();
    const strip = days.map(day => {
      const date = dateFromKey(day.key);
      const said = shortDate(date) + ': ' + (day.attempt ? day.attempt.score + ' of ' + day.attempt.total * 2 : 'not played');
      const cls = (day.attempt ? ' is-played' : '') + (day.attempt && day.attempt.score === day.attempt.total * 2 ? ' is-perfect' : '') +
        (day.key === todayKey ? ' is-today' : '');
      return '<li' + (cls ? ' class="' + cls.trim() + '"' : '') + ' aria-label="' + said + '">' + (day.attempt ? day.attempt.score : '') + '</li>';
    }).join('');

    const tally = [];
    for (let score = 0; score <= 10; score++) tally.push(scores.filter(s => s === score).length);
    const most = Math.max.apply(null, tally);
    const columns = tally.map((n, score) =>
      '<li><div class="cols-plot">' + (n ? '<b>' + n + '</b><i style="--v:' + (n / most * 100) + '"></i>' : '') + '</div>' +
      '<span class="cols-x">' + score + '</span></li>').join('');

    return '<section class="panel panel--7" aria-labelledby="stats-daily-title">' + head +
      '<dl class="figs">' +
        fig('Current streak', calculateDailyStreak(), calculateDailyStreak() === 1 ? 'day' : 'days') +
        fig('Best streak', best, best === 1 ? 'day' : 'days') +
        fig('Days played', played.length, 'of ' + DAILY_STRIP_DAYS) +
        fig('Average score', average.toFixed(1), 'of 10') +
      '</dl>' +
      '<h3 class="eyebrow subhead">Score each day</h3>' +
      '<ol class="strip">' + strip + '</ol>' +
      '<div class="strip-ends" aria-hidden="true"><span>' + shortDate(dateFromKey(days[0].key)) + '</span><span>Today</span></div>' +
      '<h3 class="eyebrow subhead">Days at each score</h3>' +
      '<ol class="cols" style="--n:11" aria-label="Days at each score, 0 to 10">' + columns + '</ol>' +
      '<p class="panel-note"><b>' + perfect + '</b> perfect ' + (perfect === 1 ? 'day' : 'days') + ' in these ' + DAILY_STRIP_DAYS +
        (ever > played.length ? ' · <b>' + formatCount(ever) + '</b> puzzles played in all' : '') + '</p>' +
    '</section>';
  }

  /* ----- Personal records ----- */

  // Every best on this device as { group, title, difficulty, rec }, in
  // library order. Records are looked up by each level's stored key, so
  // whatever else the store holds is left alone.
  function statsRecordRows() {
    const rows = [];
    const add = (group, title, mode, region) => Object.keys(DIFFICULTY_INFO).forEach(difficulty => {
      const rec = getRecords(region, difficulty, mode);
      if (rec && rec.bestAccuracy && rec.bestAccuracy.total > 0) rows.push({ group: group, title: title, difficulty: difficulty, rec: rec });
    });
    COLLECTIONS.forEach(collection => {
      LEVELS.filter(level => level.collection === collection.key && level.available && level.mode !== 'city-pin')
        .forEach(level => add(collection.title, level.title, level.mode, resolveGameTarget(level.arg).region));
    });
    add('Daily', 'Daily Five', 'daily-five', 'Daily');
    return rows;
  }

  function renderStatsRecords() {
    const rows = statsRecordRows();
    const head = '<div class="panel-head"><div><h2 id="stats-records-title">Personal records</h2>' +
      '<p>Your best full round on each level and difficulty. Pin the City keeps its own figures below.</p></div></div>';
    if (!rows.length) {
      return '<section class="panel panel--12" aria-labelledby="stats-records-title">' + head +
        renderEmpty('No records yet. Finish a full round of any level and its best score, accuracy and time are kept here.') +
      '</section>';
    }
    const star = '<svg class="star" viewBox="0 0 24 24" role="img" aria-label="perfect"><use href="#i-star"/></svg>';
    let table = '';
    let list = '';
    let group = null;
    rows.forEach(row => {
      const rec = row.rec;
      if (row.group !== group) {
        table += (group === null ? '' : '</tbody>') + '<tbody><tr class="records-group"><th colspan="8" scope="colgroup">' + escapeHtml(row.group) + '</th></tr>';
        list += '<li class="recs-group eyebrow">' + escapeHtml(row.group) + '</li>';
        group = row.group;
      }
      const accuracy = rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total;
      const perfect = rec.bestAccuracy.pct === 100 ? star : '';
      const score = rec.bestScore ? rec.bestScore.value + ' / ' + rec.bestScore.max : '—';
      const time = rec.bestTime ? formatTimeSeconds(rec.bestTime.value) : '—';
      const rounds = rec.gamesPlayed || 0;
      const last = rec.lastPlayed ? shortDate(dateFromKey(rec.lastPlayed)) : '—';
      const difficulty = DIFFICULTY_INFO[row.difficulty].label;
      table += '<tr><th scope="row">' + escapeHtml(row.title) + '</th><td>' + difficulty + '</td>' +
        '<td class="is-strong">' + accuracy + perfect + '</td><td>' + rec.bestAccuracy.pct + '%</td><td>' + score + '</td>' +
        '<td>' + time + '</td><td>' + rounds + '</td><td>' + last + '</td></tr>';
      list += '<li><strong>' + escapeHtml(row.title) + '<span class="tag">' + difficulty + '</span></strong>' +
        '<span class="recs-score">' + accuracy + perfect + '</span>' +
        '<small>' + rec.bestAccuracy.pct + '% · ' + score + ' pts' + (rec.bestTime ? ' · ' + time : '') +
          ' · ' + rounds + (rounds === 1 ? ' round' : ' rounds') + ' · ' + last + '</small></li>';
    });
    return '<section class="panel panel--12" aria-labelledby="stats-records-title">' + head +
      '<table class="records">' +
        '<thead><tr><th scope="col">Level</th><th scope="col">Difficulty</th><th scope="col">Best found</th><th scope="col">Accuracy</th>' +
          '<th scope="col">Best score</th><th scope="col">Clean sweep</th><th scope="col">Rounds</th><th scope="col">Last played</th></tr></thead>' +
        table + '</tbody>' +
      '</table>' +
      '<ul class="recs">' + list + '</ul>' +
    '</section>';
  }

  /* ----- Pin the City ----- */

  function renderStatsPin() {
    const games = loadPinStore().games;
    const head = '<div class="panel-head"><div><h2 id="stats-pin-title">Pin the City</h2>' +
      '<p>How far your pins land from the city, in kilometres. Shorter is better.</p></div></div>';
    if (!games.length) {
      return '<section class="panel panel--12" aria-labelledby="stats-pin-title">' + head +
        renderEmpty('No pins dropped yet. Play a round of Pin the City and each region’s rounds, best score and average distance are charted here.') +
      '</section>';
    }

    const regions = LEVELS.filter(level => level.mode === 'city-pin' && level.available).map(level => {
      const played = games.filter(g => g.region === resolveGameTarget(level.arg).region);
      const kms = played.slice(-10).filter(g => g.avgKm != null).map(g => g.avgKm);
      return {
        title: level.title,
        rounds: played.length,
        best: played.reduce((m, g) => Math.max(m, g.score), 0),
        km: kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null
      };
    });
    const end = niceCeil(Math.max.apply(null, regions.map(r => r.km || 0).concat([1])));
    const body = regions.map(r =>
      '<tr><th scope="row">' + escapeHtml(r.title) + '</th>' +
        '<td class="pin-bar">' + (r.km === null
          ? '<span class="hbar-none">' + (r.rounds ? 'Every city skipped' : 'Not played yet') + '</span>'
          : '<div class="hbar"><i style="--v:' + (r.km / end * 100) + '"></i><b>' + formatKm(r.km) + '</b></div>') + '</td>' +
        '<td>' + (r.rounds ? r.rounds + '<span class="pin-unit">' + (r.rounds === 1 ? ' round' : ' rounds') + '</span>' : '') + '</td>' +
        '<td>' + (r.rounds ? '<span class="pin-unit">best </span>' + formatCount(r.best) : '') + '</td></tr>').join('');

    const recent = games.filter(g => g.avgKm != null).slice(-PIN_TREND_ROUNDS);
    let trend = renderEmpty('The chart starts with your second round.');
    if (recent.length > 1) {
      const top = Math.max.apply(null, recent.map(g => g.avgKm));
      const mean = list => Math.round(list.reduce((sum, g) => sum + g.avgKm, 0) / list.length);
      const half = Math.min(5, Math.floor(recent.length / 2));
      trend = '<ol class="cols" style="--n:' + recent.length + '" aria-label="Average distance in kilometres, round by round, oldest first">' +
          recent.map(g => '<li><div class="cols-plot"><b>' + Math.round(g.avgKm) + '</b><i style="--v:' + (g.avgKm / top * 100) + '"></i></div></li>').join('') +
        '</ol>' +
        '<div class="cols-ends" aria-hidden="true"><span>' + shortDate(new Date(recent[0].at)) + '</span><span>Latest</span></div>' +
        '<p class="panel-note">Last ' + half + ' ' + (half === 1 ? 'round' : 'rounds') + ' average <b>' + formatKm(mean(recent.slice(-half))) +
          '</b>; the ' + half + ' before, <b>' + formatKm(mean(recent.slice(-half * 2, -half))) + '</b>.</p>';
    }

    return '<section class="panel panel--12" aria-labelledby="stats-pin-title">' + head +
      '<div class="pin-grid">' +
        '<div>' +
          '<table class="pintable">' +
            '<thead><tr><th scope="col">Region</th><th scope="col">Average distance, last 10 rounds</th><th scope="col">Rounds</th><th scope="col">Best score</th></tr></thead>' +
            '<tbody>' + body + '</tbody>' +
            '<tfoot><tr><td></td><td class="pin-bar"><div class="pin-axis" aria-hidden="true"><span style="left:0">0</span>' +
              '<span style="left:50%">' + formatCount(end / 2) + '</span><span style="left:100%">' + formatKm(end) + '</span></div></td><td></td><td></td></tr></tfoot>' +
          '</table>' +
        '</div>' +
        '<div>' +
          '<h3 class="eyebrow subhead">Average distance, last ' + Math.max(recent.length, 2) + ' rounds, km</h3>' +
          trend +
        '</div>' +
      '</div>' +
    '</section>';
  }

