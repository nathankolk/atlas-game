// Builds a realistic several-week history for the app's progress stores, for screenshots and checks.
//
//   const { makeSeed } = require('$S/harness/seed-rich.js');
//   const seed = await makeSeed({ weeks: 10 });            // { 'atlas-mastery': '…', 'atlas-records': '…', … }
//   const h = await launch({ seedStorage: seed });
//
//   CLI:  NODE_PATH=/opt/node-tools/node_modules node seed-rich.js [--out=file.json] [--weeks=10] [--seed=7]
//                                                                  [--unplayed] [--now=2026-11-16T15:00:00Z]
//         writes the seed as JSON (default $S/harness/scratch/seed-rich.json) and prints what it holds.
//
// How it works: the level names are read from the running app (window.__atlas.LEVELS), so they always
// match what the game queues. A simulated player then plays day by day: every answer goes through the real
// mastery module ($S/work/mastery/mastery.js) under a fake clock, and the other stores (atlas-records,
// atlas-focus, atlas-daily-attempts, atlas-pin, atlas-learn) are written in the shapes the game writes.
// The player starts shaky and improves with each exposure; a handful of items per skill stay stubborn, so
// there are weak items, due items and a spread over all four mastery levels at the end. In the last
// days of the run the player also reviews what is due, as Smart Review would have them do.
//
// Options: weeks (10), seed (7, the PRNG seed), now (ms or ISO; default Date.now()), playedToday (true),
//          streakDays (12: the run of active days ending today), earlierRun (17: the longer run before
//          it), catalog (reuse a level catalog),
//          quiz (false): the player has also taken up Capitals, Flags and Name It in the last weeks
//          (CLI --quiz, default file seed-quiz.json). Off by default so the standard seed keeps its history.
//          heavy (false): a player who has played EVERY level in the catalog, every day for 57 weeks,
//          several rounds a day: every skill filled, every store near its largest (CLI --heavy,
//          default file seed-heavy.json).
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '..');
const Mastery = require(path.join(S, 'work/mastery/mastery.js'));

const DAY = 86400000;

const QUIZ_MODES = ['capital-pick', 'capital-find', 'flag', 'name-it'];

// What a level's records and focus list are keyed by (resolveGameTarget(arg).region in the app)
const US_REGIONS = {
  'us-state': 'The United States',
  'us-capital-to-state': 'US Capitals → States',
  'us-state-to-capital': 'US States → Capitals'
};
function regionOf(level) {
  if (level.mode === 'world-country') return level.arg;
  if (US_REGIONS[level.mode]) return US_REGIONS[level.mode];
  if (level.mode === 'us-city') return level.title.replace(/^Cities: /, '');
  if (level.mode === 'city-pin') return level.title;
  // Capitals, Flags, Name It: the continent, or 'World'
  if (QUIZ_MODES.indexOf(level.mode) !== -1) return level.title === 'The World' ? 'World' : level.title;
  return level.key;   // province rounds
}

// Every playable level with its names, read from the app itself
async function levelCatalog() {
  const { launch } = require('./atlas-harness.js');
  const h = await launch({ width: 1280, height: 800 });
  try {
    await h.page.goto(h.url);
    await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 30000 });
    return await h.page.evaluate(async () => {
      const A = window.__atlas;
      const levels = A.LEVELS.filter(l => l.available);
      await Promise.all(levels.map(l => l.load()));
      return levels.map(l => ({ key: l.key, mode: l.mode, arg: l.arg, title: l.title, skill: l.skill, names: l.names() }));
    });
  } finally {
    await h.close();
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: k => { data.delete(k); }
  };
}

// The game's Pin the City scoring: 100 within 25 km, then 100·e^(−(km−25)/400)
function pinPoints(km) {
  if (km == null) return 0;
  if (km <= 25) return 100;
  return Math.round(100 * Math.exp(-(km - 25) / 400));
}

// Which levels the player picks from, how often, and from how many weeks back.
// Pin the City South America and Oceania are never played (they stay "not played yet").
const PLAN = [
  ['africa', 3, 99], ['asia', 2.6, 99], ['europe', 3, 99], ['north-america', 2, 99], ['south-america', 2, 99],
  ['oceania', 1.6, 99], ['world', 0.7, 6],
  ['us-state', 3, 99], ['us-state-to-capital', 1.8, 7], ['us-capital-to-state', 1.4, 5], ['northeast-cities', 1.4, 4],
  ['canada-provinces', 1.6, 8], ['china-provinces', 1.5, 5], ['india-states', 1.2, 4], ['russia-west', 0.9, 2],
  ['pin-europe', 2.4, 7], ['pin-world', 2.2, 6], ['pin-north-america', 1.6, 5], ['pin-asia', 1.4, 4], ['pin-africa', 1.2, 3]
];
// With options.quiz: the country quizzes, taken up in the last few weeks
const QUIZ_PLAN = [
  ['capitals-europe', 2.4, 4], ['capitals-find-europe', 1.6, 3], ['capitals-south-america', 1.4, 3], ['capitals-africa', 1.2, 2],
  ['capitals-world', 0.6, 2], ['capitals-find-asia', 1, 2],
  ['flags-europe', 2.2, 4], ['flags-south-america', 1.4, 3], ['flags-asia', 1.2, 2], ['flags-world', 0.6, 2],
  ['name-europe', 2, 3], ['name-south-america', 1.4, 3], ['name-africa', 1, 2], ['name-oceania', 1, 2]
];
// Levels sometimes played above Normal
const HARD = { 'africa': 0.2, 'europe': 0.25, 'us-state': 0.15, 'canada-provinces': 0.2, 'pin-europe': 0.2 };
const UNCHARTED = { 'europe': 0.1 };
// Where a skill's first-try rate starts for this player
const BASE = { 'country': 0.4, 'us-state': 0.62, 'us-capital': 0.4, 'us-city': 0.35, 'capital': 0.38, 'flag': 0.42, 'country-name': 0.55 };

function buildSeed(catalog, options) {
  const o = Object.assign({ seed: 7, playedToday: true, streakDays: 12, earlierRun: 17 }, options || {});
  if (o.weeks == null) o.weeks = o.heavy ? 57 : 10;
  // The levels this player picks from
  let plan = PLAN.concat(o.quiz ? QUIZ_PLAN : []);
  if (o.heavy) plan = catalog.map(l => [l.key, 1, 999]);
  const now = o.now == null ? Date.now() : (typeof o.now === 'number' ? o.now : Date.parse(o.now));
  const rnd = mulberry32(o.seed);
  const byKey = {};
  catalog.forEach(l => { byKey[l.key] = l; });

  let clock = now;
  const storage = memoryStorage();
  const mastery = Mastery.create({ storage: storage, now: () => clock });

  // The local day that lies `back` days before today, at a given hour (never later than now)
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const at = (back, hour) => Math.min(now - 60000, startOfToday.getTime() - back * DAY + hour * 3600000);
  const utcKey = ms => new Date(ms).toISOString().slice(0, 10);

  // ---- The simulated player's memory ----
  const know = new Map();
  const stubborn = new Set();
  function chance(skill, name) {
    const id = skill + '|' + name;
    if (!know.has(id)) {
      const base = BASE[skill] != null ? BASE[skill] : 0.35;
      if (rnd() < 0.09) stubborn.add(id);
      know.set(id, stubborn.has(id) ? 0.12 : Math.max(0.1, Math.min(0.92, base + (rnd() - 0.5) * 0.6)));
    }
    return know.get(id);
  }
  // One answer: 'first' | 'second' | 'miss'; seeing an item makes the next try likelier to land
  function answer(skill, name) {
    const p = chance(skill, name);
    const r = rnd();
    const outcome = r < p ? 'first' : r < p + (1 - p) * 0.6 ? 'second' : 'miss';
    const id = skill + '|' + name;
    know.set(id, Math.min(0.96, p + (1 - p) * (stubborn.has(id) ? 0.04 : 0.2)));
    return outcome;
  }

  const records = {};
  const focus = {};
  const pin = { games: [], cities: {} };
  const pinSpread = new Map();   // city -> typical miss in km, shrinking with practice

  function commitRecord(level, difficulty, r, when) {
    const key = level.mode + '|' + regionOf(level) + '|' + difficulty;
    const rec = records[key] || { gamesPlayed: 0 };
    const date = utcKey(when);
    const pct = Math.round(r.correct / r.total * 100);
    if (!rec.bestScore || r.score > rec.bestScore.value) rec.bestScore = { value: r.score, max: r.total * 2, date: date };
    if (r.correct === r.total && (!rec.bestTime || r.seconds < rec.bestTime.value)) {
      rec.bestTime = { value: r.seconds, total: r.total, date: date };
    }
    if (!rec.bestAccuracy || pct > rec.bestAccuracy.pct || (pct === rec.bestAccuracy.pct && r.correct > rec.bestAccuracy.correct)) {
      rec.bestAccuracy = { correct: r.correct, total: r.total, pct: pct, date: date };
    }
    rec.gamesPlayed++;
    rec.lastPlayed = date;
    records[key] = rec;
  }

  // A full found/missed round of a level
  function playLevel(level, difficulty, when) {
    clock = when;
    const harder = difficulty === 'normal' ? 0 : difficulty === 'hard' ? 0.08 : 0.2;
    let first = 0, second = 0;
    const revisit = [];
    level.names.forEach(name => {
      let outcome = answer(level.skill, name);
      if (outcome === 'first' && rnd() < harder) outcome = 'second';
      mastery.record(level.skill, name, outcome);
      if (outcome === 'first') first++;
      else {
        if (outcome === 'second') second++;
        revisit.push(name);
      }
    });
    const total = level.names.length;
    const seconds = Math.round(total * (4.5 + rnd() * 4));
    mastery.recordSession({ questions: total, firstTry: first, seconds: seconds });
    commitRecord(level, difficulty, { score: first * 2 + second, correct: first + second, total: total, seconds: seconds }, when);
    focus[level.mode + '|' + regionOf(level)] = { names: revisit, total: total, savedAt: when };
  }

  // A Pin the City round: 20 cities, a distance each
  function playPin(level, difficulty, when) {
    clock = when;
    let cities = level.names.slice();
    if (cities.length > 20) {
      for (let i = cities.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = cities[i]; cities[i] = cities[j]; cities[j] = t;
      }
      cities = cities.slice(0, 20);
    }
    const blind = difficulty === 'normal' ? 1 : 1.5;
    let score = 0, kmSum = 0, kmCount = 0, first = 0;
    cities.forEach(name => {
      if (!pinSpread.has(name)) pinSpread.set(name, 60 + rnd() * rnd() * 900);
      const spread = pinSpread.get(name);
      const skipped = rnd() < 0.03;
      const km = skipped ? null : Math.round(spread * blind * Math.exp((rnd() + rnd() + rnd() - 1.5) * 0.9));
      pinSpread.set(name, Math.max(30, spread * 0.72));
      const points = pinPoints(km);
      score += points;
      if (km != null) { kmSum += km; kmCount++; }
      const outcome = points >= 80 ? 'first' : points >= 40 ? 'second' : 'miss';
      if (outcome === 'first') first++;
      mastery.record('city-pin', name, outcome);
      pin.cities[name] = (pin.cities[name] || []).concat([[when, km]]).slice(-5);
    });
    mastery.recordSession({ questions: cities.length, firstTry: first, seconds: Math.round(cities.length * (7 + rnd() * 5)) });
    pin.games.push({ at: when, region: regionOf(level), diff: difficulty, score: score, max: cities.length * 100,
      avgKm: kmCount ? Math.round(kmSum / kmCount) : null });
  }

  // A Smart Review sitting: the most overdue places across the skills a review can host, as practice
  // (mastery and activity only; no records, no focus list)
  function playReview(when, limit) {
    clock = when;
    let asked = 0, first = 0;
    const piles = mastery.skills().filter(skill => skill !== 'city-pin')
      .map(skill => ({ skill: skill, names: mastery.due(skill, undefined, { limit: limit }) }));
    // One from each skill in turn, so a big pile doesn't crowd the small ones out
    while (asked < limit && piles.some(pile => pile.names.length)) {
      piles.forEach(pile => {
        const name = pile.names.shift();
        if (name === undefined || asked >= limit) return;
        const outcome = answer(pile.skill, name);
        mastery.record(pile.skill, name, outcome);
        asked++;
        if (outcome === 'first') first++;
      });
    }
    if (asked) mastery.recordSession({ questions: asked, firstTry: first, seconds: Math.round(asked * (4 + rnd() * 3)) });
  }

  // ---- Play the weeks, oldest day first ----
  const totalDays = o.weeks * 7;
  const worldNames = byKey.world ? byKey.world.names : [];
  const daily = {};
  let puzzleNo = 205;   // only the spacing between days matters for a seed
  const started = new Set();
  for (let back = totalDays - 1; back >= 0; back--) {
    const weeksBack = back / 7;
    // The current run, a day off before it, a longer run before that, and patchier play further back
    const dayOff = back === o.streakDays || back === o.streakDays + o.earlierRun + 1;
    const active = o.heavy ? true
      : back < o.streakDays ? (back > 0 || o.playedToday)
      : dayOff ? false
      : back <= o.streakDays + o.earlierRun ? true
      : rnd() < 0.55;
    if (active) {
      const pool = plan.filter(p => byKey[p[0]] && weeksBack <= p[2]);
      const weight = pool.reduce((sum, p) => sum + p[1], 0);
      const rounds = o.heavy ? 4 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 3);
      // A level that has come into reach and not been tried yet is played first, so every level
      // in the plan has a history whatever the dice say
      const untried = pool.filter(p => !started.has(p[0]));
      for (let i = 0; i < rounds; i++) {
        let pick = rnd() * weight, chosen = pool[0];
        for (const p of pool) { pick -= p[1]; if (pick <= 0) { chosen = p; break; } }
        if (untried.length && weeksBack < o.weeks - 1) chosen = untried.shift();
        started.add(chosen[0]);
        const level = byKey[chosen[0]];
        const r = rnd();
        // The heavy player plays everything at every difficulty
        const difficulty = o.heavy ? (r < 0.25 ? 'uncharted' : r < 0.55 ? 'hard' : 'normal')
          : r < (UNCHARTED[level.key] || 0) ? 'uncharted'
          : r < (UNCHARTED[level.key] || 0) + (HARD[level.key] || 0) ? 'hard' : 'normal';
        const when = at(back, 18 + i * 0.4);
        if (level.mode === 'city-pin') playPin(level, difficulty, when);
        else playLevel(level, difficulty, when);
      }
      // Lately the player has taken up Smart Review, which keeps the pile of due places small
      if (back < o.streakDays && back > 0) playReview(at(back, 21), 50);
    }
    // The Daily Five keeps the last 30 days; most days are played
    if (back < 30 && !dayOff && worldNames.length >= 5 && (back === 0 ? o.playedToday : (back < 7 || rnd() < 0.75))) {
      const when = at(back, 8.5);
      clock = when;
      const countries = [];
      while (countries.length < 5) {
        const name = worldNames[Math.floor(rnd() * worldNames.length)];
        if (countries.indexOf(name) === -1) countries.push(name);
      }
      const sequence = countries.map(name => {
        const outcome = answer('country', name);
        mastery.record('country', name, outcome);
        return outcome === 'first' ? 2 : outcome === 'second' ? 1 : 0;
      });
      const correct = sequence.filter(p => p > 0).length;
      const score = sequence.reduce((a, b) => a + b, 0);
      const seconds = 25 + Math.floor(rnd() * 50);
      mastery.recordSession({ questions: 5, firstTry: sequence.filter(p => p === 2).length, seconds: seconds });
      // The game keys the day by UTC date
      const dateKey = utcKey(when);
      daily[dateKey] = { dateKey: dateKey, puzzleNumber: puzzleNo - back, countries: countries, sequence: sequence, score: score,
        correct: correct, wrong: 5 - correct, total: 5, timeSeconds: seconds, hardMode: false, difficulty: 'normal', completedAt: when };
      commitRecord({ mode: 'daily-five', arg: 'daily-five', title: 'Daily', key: 'daily' }, 'normal',
        { score: score, correct: correct, total: 5, seconds: seconds }, when);
    }
  }
  // commitRecord keys the daily entry by regionOf(), which is the key for unknown modes: use the game's
  if (records['daily-five|daily|normal']) {
    records['daily-five|Daily|normal'] = records['daily-five|daily|normal'];
    delete records['daily-five|daily|normal'];
  }

  // A Learn ladder under way and one finished
  const learn = {};
  if (byKey['russia-south']) {
    learn['russia-south'] = { order: byKey['russia-south'].names.slice(), level: 9, savedAt: at(1, 20) };
  }
  if (byKey['canada-provinces']) learn['canada-provinces'] = { done: true, savedAt: at(20, 20) };

  clock = now;
  // The game keeps the last 200 Pin the City rounds
  pin.games = pin.games.slice(-200);
  const str = v => JSON.stringify(v);
  const seed = {
    'atlas-mastery': storage.getItem(Mastery.KEY),
    'atlas-records': str(records),
    'atlas-focus': str(focus),
    'atlas-daily-attempts': str(daily),
    'atlas-pin': str(pin),
    'atlas-learn': str(learn)
  };
  // Not part of the seed (JSON.stringify skips it): what the history adds up to, for a check to compare against
  Object.defineProperty(seed, 'summary', { enumerable: false, value: {
    now: now, totals: mastery.totals(), streak: mastery.streak(), skills: mastery.skills(),
    records: Object.keys(records).length, dailies: Object.keys(daily).length, pinGames: pin.games.length,
    due: mastery.skills().reduce((n, skill) => n + mastery.due(skill).length, 0)
  } });
  return seed;
}

// The catalog from the running app, then the history
async function makeSeed(options) {
  const o = options || {};
  return buildSeed(o.catalog || await levelCatalog(), o);
}

module.exports = { makeSeed, buildSeed, levelCatalog, regionOf };

if (require.main === module) {
  const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
  (async () => {
    const quiz = process.argv.includes('--quiz'), heavy = process.argv.includes('--heavy');
    const seed = await makeSeed({
      weeks: opt('weeks') ? Number(opt('weeks')) : undefined, seed: Number(opt('seed') || 7),
      playedToday: !process.argv.includes('--unplayed'), now: opt('now') || undefined, quiz: quiz, heavy: heavy
    });
    const out = opt('out') || path.join(__dirname, 'scratch', heavy ? 'seed-heavy.json' : quiz ? 'seed-quiz.json' : 'seed-rich.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(seed));
    console.log('wrote', out);
    console.log(JSON.stringify(seed.summary));
    Object.keys(seed).forEach(k => console.log('  ' + k + ': ' + seed[k].length + ' chars'));
  })().catch(e => { console.error(e); process.exit(1); });
}
