  function finishGame() {
    state.lastWasLearn = false;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const total = state.correct + state.wrong;
    const pct = total > 0 ? Math.round((state.correct / total) * 100) : 0;
    const maxScore = state.totalQuestions * 2;
    stopClock(elapsed);

    // What this round says to work on next: misses first, then second tries
    state.roundNeedsWork = state.missed.concat(state.secondTry);

    mastery.recordSession({
      questions: state.sequence.length,
      firstTry: state.sequence.filter(points => points === 2).length,
      seconds: elapsed
    });

    // Focus rounds and daily replays are practice: no records, no share
    const isPractice = state.practice || !!state.dailyReplay;

    if (isPractice) {
      // Focus rounds are a subset of the level, so they'd distort the
      // level's bests; a daily replay is a puzzle you've already seen.
      // Practice also leaves the saved focus list alone — only a full game
      // rewrites it.
      state.brokenRecords = {};
      state.priorRecords = null;
      state.currentRecords = null;
    } else {
      // Snapshot previous records BEFORE committing this session so we can
      // show the user what they beat (or how close they came).
      const priorRecords = getRecords(state.currentContinent, state.difficulty, state.gameMode);

      const commitResult = commitSessionRecords({
        region: state.currentContinent,
        difficulty: state.difficulty,
        gameMode: state.gameMode,
        score: state.score,
        correct: state.correct,
        totalQuestions: state.totalQuestions,
        timeSeconds: elapsed
      });
      state.brokenRecords = commitResult.broken;
      state.priorRecords = priorRecords;
      state.currentRecords = commitResult.records;

      if (state.gameMode !== 'daily-five') {
        saveFocusList(state.gameMode, state.currentContinent, state.roundNeedsWork, state.totalQuestions);
      }
    }

    // Daily mode: persist this attempt so the player gets the locked-out
    // "already played today" view if they reload or come back later.
    // Practice replays don't write to storage so they never "use up" the day.
    if (state.gameMode === 'daily-five' && !state.dailyReplay && state.dailyDateKey) {
      saveDailyAttempt(state.dailyDateKey, {
        dateKey: state.dailyDateKey,
        puzzleNumber: dailyPuzzleNumber(state.dailyDateKey),
        countries: generateDailyPuzzle(state.dailyDateKey),
        sequence: state.sequence.slice(),
        score: state.score,
        correct: state.correct,
        wrong: state.wrong,
        total: state.totalQuestions,
        timeSeconds: elapsed,
        hardMode: state.hardMode,
        difficulty: state.difficulty,
        completedAt: Date.now()
      });
    }

    // Mirror to cloud after every round (fire-and-forget; no-op if sync
    // isn't set up). Practice rounds count too: they add to the mastery history.
    syncAfterGameEnd();

    const daily = state.gameMode === 'daily-five';
    let regionLabel = GAME_MODES[state.gameMode].label(state.currentContinent);
    if (daily) {
      regionLabel = 'Daily #' + dailyPuzzleNumber(state.dailyDateKey);
      if (state.dailyReplay) regionLabel += ' (Practice)';
    }
    if (state.practice) regionLabel += ' · Practice';

    const second = state.secondTry.length;
    const first = state.correct - second;
    const skipped = state.missed.filter(name => (state.roundLog.get(name) || {}).skipped).length;
    const noun = targetNoun(state.gameMode, state.currentContinent);
    // The capital modes ask about a state through its capital: say which
    const capitalMode = state.gameMode === 'us-capital-to-state' || state.gameMode === 'us-state-to-capital';
    const row = (name, isSecond) => ({
      second: isSecond,
      name: name,
      story: (capitalMode ? US_CAPITALS[name] + ' · ' : '') + answerStory(name, isSecond)
    });

    renderResults({
      label: regionLabel + difficultyBadge(state.difficulty, state.hardMode),
      badge: recordHeadline(),
      ring: { first: first, second: second, missed: state.wrong, big: String(state.correct), unit: 'of ' + total + ' found' },
      title: resultsTitle(pct, state.wrong === 0 && second === 0),
      line: state.score + ' of ' + maxScore + ' points · ' + pct + '% accuracy',
      cells: [
        { value: first, label: 'First try', dot: 'good', note: '2 points each' },
        { value: second, label: 'Second try', dot: 'second', note: '1 point each' },
        { value: state.wrong, label: 'Missed', dot: 'bad', note: skipped ? skipped + ' skipped' : 'no points' },
        { value: formatTimeSeconds(elapsed), label: 'Time', icon: 'clock', note: timeNote(elapsed) }
      ],
      gain: true,
      // The Daily Five's answers in order; only today's real attempt is shared
      daily: daily ? { sequence: state.sequence, share: !state.dailyReplay } : null,
      bests: recordsBests(),
      revisit: state.roundNeedsWork.length === 0 ? null : {
        heading: noun + ' to revisit',
        rows: state.missed.map(name => row(name, false)).concat(state.secondTry.map(name => row(name, true)))
      },
      actions: {
        // Practice drills the list shown beside it. The Daily Five can't be
        // replayed for the record, so it offers a practice replay instead.
        practice: daily ? 0 : state.roundNeedsWork.length,
        replay: daily ? null : state.practice ? 'Full round' : 'Play again',
        dailyReplay: daily,
        // Marks don't stay on the map in Hard and Uncharted: nothing to look back at
        viewMap: !state.hardMode,
        // Sharing a practice round would read like a real score for the level
        share: !isPractice
      }
    });
    switchScreen('results');
  }

  /* =========================================================
   * RESULTS (the screen after a round)
   * ========================================================= */

  // A headline for how the round went, by the share found (or of points won)
  function resultsTitle(pct, flawless) {
    if (flawless) return 'Flawless';
    if (pct >= 100) return 'A Clean Sweep';
    if (pct >= 90) return 'Seasoned Navigator';
    if (pct >= 75) return 'Steady Hand';
    if (pct >= 50) return 'Finding Your Bearings';
    return 'Uncharted Waters';
  }

  // The record badge's line for the round just committed, or null
  function recordHeadline() {
    const broken = state.brokenRecords || {};
    const list = ['score', 'time', 'accuracy'].filter(kind => broken[kind]);
    if (list.length === 0) return null;
    if (list.length === 3) return 'Three new records';
    return list.length === 2 ? 'Two new records' : 'New ' + list[0] + ' record';
  }

  // The round's time against the level's fastest clean sweep. Only a round
  // with everything found sets that record, so only such a round compares.
  function timeNote(elapsed) {
    const prior = state.priorRecords && state.priorRecords.bestTime;
    const now = state.currentRecords && state.currentRecords.bestTime;
    if (!state.currentRecords) return '';
    if (state.wrong === 0 && prior) {
      const diff = elapsed - prior.value;
      return diff < 0
        ? '<b>−' + formatTimeSeconds(-diff) + '</b> vs best'
        : '+' + formatTimeSeconds(diff) + ' vs best';
    }
    if (state.wrong === 0) return 'first clean sweep';
    return now ? 'best sweep ' + formatTimeSeconds(now.value) : '';
  }

  // The level's bests after this round, for the results screen (null after practice)
  function recordsBests() {
    const rec = state.currentRecords;
    if (!rec) return null;
    const broken = state.brokenRecords || {};
    const items = [];
    if (rec.bestScore) {
      items.push({ label: 'Best score', value: rec.bestScore.value, sub: '/' + rec.bestScore.max, record: broken.score });
    }
    if (rec.bestAccuracy) {
      items.push({
        label: 'Best accuracy', value: rec.bestAccuracy.pct + '%',
        sub: rec.bestAccuracy.correct + '/' + rec.bestAccuracy.total, record: broken.accuracy
      });
    }
    if (rec.bestTime) {
      items.push({ label: 'Fastest clean sweep', value: formatTimeSeconds(rec.bestTime.value), record: broken.time });
    }
    items.push({ label: 'Rounds played', value: String(rec.gamesPlayed || 0) });
    return { heading: 'Your personal bests', items: items };
  }

  // What happened on a question that needs another look, in a few words
  function answerStory(name, second) {
    const log = state.roundLog.get(name) || { picks: [], skipped: false };
    const picks = log.picks.filter(Boolean);
    if (second) return picks.length ? 'Second try, after ' + picks[0] : 'Second try';
    if (log.skipped) return picks.length ? 'You chose ' + picks[0] + ', then skipped' : 'Skipped';
    if (picks.length >= 2) {
      return picks[0] === picks[1]
        ? 'You chose ' + picks[0] + ' twice'
        : 'You chose ' + picks[0] + ', then ' + picks[1];
    }
    return picks.length ? 'You chose ' + picks[0] : 'Missed';
  }

  // The names a round's mastery gain is measured over, with where each
  // stands now: the level's own, or every country for the Daily Five
  function masterySnapshot() {
    const daily = state.gameMode === 'daily-five';
    const level = daily ? levelByKey('world') : levelForStartArg(state.startArg);
    const skill = roundSkill();
    if (!level || !skill) return null;
    const names = level.names();
    return {
      skill: skill,
      names: names,
      title: daily ? GAME_MODES['world-country'].label('World') : GAME_MODES[state.gameMode].label(state.currentContinent),
      levels: mastery.levels(skill, names)
    };
  }

  // How the level's mastery moved over the round, as the results screen
  // shows it: the count newly mastered when there is one, otherwise how
  // many names moved a step, over a bar of where every name stands now
  function renderGain() {
    const start = state.gainStart;
    if (!start || !start.names.length) return '';
    const now = mastery.levels(start.skill, start.names);
    const sum = mastery.summary(start.skill, start.names);
    const step = (levels, name) => Mastery.LEVELS.indexOf(levels[name]);
    const top = Mastery.LEVELS.length - 1;
    let up = 0, down = 0, fresh = 0;
    start.names.forEach(name => {
      const a = step(start.levels, name), b = step(now, name);
      if (b > a) up++;
      if (b < a) down++;
      if (b === top && a < top) fresh++;
    });

    let figure, text, flat = false;
    if (fresh > 0) {
      figure = '+' + fresh;
      text = 'mastered in ' + start.title;
    } else if (up > 0) {
      figure = '+' + up;
      text = 'moved up a step in ' + start.title;
    } else if (down > 0) {
      figure = '−' + down;
      text = 'slipped back a step in ' + start.title;
      flat = true;
    } else {
      figure = '+0';
      text = 'No change in ' + start.title;
      flat = true;
    }
    const tally = fresh > 0
      ? (sum.mastered - fresh) + ' → ' + sum.mastered + ' of ' + sum.total
      : sum.mastered + ' of ' + sum.total + ' mastered';
    const part = (n, cls) => n > 0 ? '<i class="' + cls + '" style="--n:' + n + '"></i>' : '';
    return '<div class="gain">' +
      '<span class="num gain-num' + (flat ? ' is-flat' : '') + '">' + figure + '</span>' +
      '<div class="gain-text"><strong>' + escapeHtml(text) + '</strong><span>' + tally + '</span></div>' +
      '<div class="mbar" role="img" aria-label="' + sum.mastered + ' mastered, ' + sum.familiar + ' familiar, ' +
        sum.learning + ' learning, ' + sum.new + ' new">' +
        part(sum.mastered - fresh, 'm3') + part(fresh, 'm3 is-new') + part(sum.familiar, 'm2') +
        part(sum.learning, 'm1') + part(sum.new, '') +
      '</div>' +
    '</div>';
  }

  // The score ring's arcs: one per outcome that happened, in order, with a
  // sliver of track between them
  function scoreRingArcs(ring) {
    const parts = [['sr-good', ring.first], ['sr-second', ring.second], ['sr-bad', ring.missed]].filter(p => p[1] > 0);
    const total = parts.reduce((sum, p) => sum + p[1], 0);
    const gap = parts.length > 1 ? 6 : 0;
    const room = 540 - gap * parts.length;
    let at = gap / 2;
    return parts.map(p => {
      const length = room * p[1] / total;
      const arc = '<circle class="' + p[0] + '" cx="60" cy="60" r="54" pathLength="540" stroke-dasharray="' +
        length.toFixed(1) + ' 540" stroke-dashoffset="' + (-at).toFixed(1) + '"/>';
      at += length + gap;
      return arc;
    }).join('');
  }

  // The Daily Five's answers as five marks, in the order they were asked
  function dailyMarks(sequence) {
    const said = { 2: 'first try', 1: 'second try', 0: 'missed' };
    return '<ol class="marks" aria-label="Your five answers">' + (sequence || []).map(points =>
      '<li class="mark mark--' + (points === 2 ? 'first' : points === 1 ? 'second' : 'missed') + '" aria-label="' + said[points] + '">' +
        (points === 2 ? icon('check') : points === 1 ? '2' : icon('close')) + '</li>').join('') + '</ol>';
  }

  // One row of the revisit list: its mark, the name, what happened, and
  // where the name now stands in the mastery store
  function revisitRow(row, skill) {
    const item = skill ? mastery.get(skill, row.name) : null;
    const level = item ? item.level : Mastery.LEVELS[0];
    const swatch = { new: '', learning: ' m1', familiar: ' m2', mastered: ' m3' }[level];
    return '<li>' +
      '<span class="revisit-mark' + (row.second ? ' is-second' : '') + '" aria-hidden="true">' + (row.second ? '2' : icon('close')) + '</span>' +
      '<div><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(row.story) + '</small></div>' +
      '<span class="revisit-tally">' + (item && item.seen ? 'first try ' + item.first + ' of ' + item.seen : '') + '</span>' +
      '<span class="level-pill"><i class="swatch' + swatch + '"></i>' + level.charAt(0).toUpperCase() + level.slice(1) + '</span>' +
    '</li>';
  }

  // Draws the results screen from one description of the round:
  //   label    level, kind of round and difficulty, for the bar
  //   badge    a line about a record broken, or null
  //   ring     { first, second, missed, big, unit }: the arcs, and what the middle says
  //   title, line   the headline and the sentence under it
  //   cells    [{ value, sub, label, dot | icon, note }]: the row of figures
  //   gain     true to show what the round did to the level's mastery
  //   daily    { sequence, share }: the Daily Five's answers, or null
  //   bests    { heading, items: [{ label, value, sub, record }] }, or null
  //   revisit  { heading, rows: [{ second, name, story }], note }, or null
  //   actions  { practice, replay, dailyReplay, viewMap, share }
  function renderResults(r) {
    document.getElementById('results-region').textContent = r.label;
    document.getElementById('results-date').textContent = ' · ' +
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    const ringSaid = r.ring.big + ' ' + r.ring.unit + ': ' + r.ring.first + ', ' + r.ring.second + ' and ' +
      r.ring.missed + ' in the three bands';
    document.getElementById('results-summary').innerHTML =
      (r.badge ? '<span class="badge-record">' + icon('star') + escapeHtml(r.badge) + '</span>' : '') +
      '<div class="score-ring" role="img" aria-label="' + escapeHtml(ringSaid) + '">' +
        '<svg viewBox="0 0 120 120"><circle class="sr-track" cx="60" cy="60" r="54"/>' + scoreRingArcs(r.ring) + '</svg>' +
        '<div class="score-ring-label"><span class="num' + (r.ring.big.length > 3 ? ' is-long' : '') + '">' + r.ring.big + '</span>' +
          '<span>' + escapeHtml(r.ring.unit) + '</span></div>' +
      '</div>' +
      '<h1 class="display-l results-title">' + escapeHtml(r.title) + '</h1>' +
      '<p class="results-line">' + escapeHtml(r.line) + '</p>';

    const skill = roundSkill();
    const cells = r.cells.map(c =>
      '<div><dd class="num">' + c.value + (c.sub ? '<small>' + c.sub + '</small>' : '') + '</dd>' +
        '<dt>' + (c.dot ? '<i class="odot' + (c.dot === 'good' ? '' : ' odot--' + c.dot) + '"></i>' : icon(c.icon, 'icon--sm')) + c.label + '</dt>' +
        '<small>' + (c.note || '') + '</small></div>').join('');
    let detail = '<dl class="outcomes" style="--cols:' + r.cells.length + '">' + cells + '</dl>';
    if (r.gain) detail += renderGain();
    if (r.daily) {
      detail += '<div class="daily-recap">' + dailyMarks(r.daily.sequence) +
        '<span class="daily-recap-next">' + icon('clock', 'icon--sm') + 'Next puzzle in <b data-countdown="clock"></b></span>' +
        (r.daily.share
          ? '<button type="button" class="btn btn--primary" data-action="share-results">' + icon('share') + '<span>Share result</span></button>'
          : '') +
      '</div>';
    }
    if (r.bests) {
      detail += '<section class="results-bests"><h2 class="eyebrow">' + r.bests.heading + '</h2><dl class="figs">' +
        r.bests.items.map(it =>
          '<div><dt class="eyebrow">' + it.label + '</dt>' +
          '<dd class="num' + (it.record ? ' is-record' : '') + '">' + it.value + (it.sub ? '<small>' + it.sub + '</small>' : '') +
            (it.record ? icon('star') + '<span class="sr-only"> new record</span>' : '') + '</dd></div>').join('') +
        '</dl></section>';
    }
    if (r.revisit) {
      detail += '<section>' +
        '<div class="revisit-head"><h2>' + escapeHtml(r.revisit.heading) + '</h2>' +
          (r.actions.viewMap
            ? '<button type="button" class="link" data-action="view-map">View on the map' + icon('chevron') + '</button>'
            : '') +
        '</div>' +
        '<ul class="revisit">' + r.revisit.rows.map(row => revisitRow(row, skill)).join('') + '</ul>' +
        (r.revisit.note ? '<p class="revisit-note">' + escapeHtml(r.revisit.note) + '</p>' : '') +
      '</section>';
    }
    document.getElementById('results-detail').innerHTML = detail;
    if (r.daily) startDailyCountdown();

    // The buttons: the first one showing is the suggested next step
    const a = r.actions;
    const step = state.review && state.review.queue[0];
    const labels = {
      'review-next-btn': step ? 'Next: ' + countNoun(step.names.length, step.level.noun) : null,
      'practice-btn': a.practice
        ? (a.practice === 1 ? 'Practice this one' : 'Practice these <span class="btn-count">' + a.practice + '</span>')
        : null,
      'replay-btn': a.replay ? icon('replay') + a.replay : null,
      'daily-practice-btn': a.dailyReplay ? 'Practice replay' : null
    };
    let lead = true;
    Object.keys(labels).forEach(id => {
      const btn = document.getElementById(id);
      btn.hidden = !labels[id];
      if (!labels[id]) return;
      btn.innerHTML = labels[id];
      btn.classList.toggle('btn--primary', lead);
      btn.classList.toggle('btn--secondary', !lead);
      lead = false;
    });
    document.getElementById('view-map-btn').hidden = !a.viewMap;
    document.getElementById('share-btn').hidden = !a.share;
    document.getElementById('results-screen').scrollTop = 0;
  }

