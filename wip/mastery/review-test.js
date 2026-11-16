'use strict';

// Reviewer's attack on mastery.js. Run: node review-test.js
// Shares nothing with test-mastery.js: its own reference model of SPEC.md,
// its own calendar, storage and clock. It runs itself once per time zone in a
// child process, so TZ is in process.env before mastery.js is loaded.

const path = require('path');

const ZONES = ['America/Chicago', 'Pacific/Auckland', 'UTC', 'Asia/Kathmandu', 'America/Santiago'];

if (process.argv[2] !== '--zone') {
  const { spawnSync } = require('child_process');
  let bad = 0, passed = 0, failed = 0;
  ZONES.forEach(tz => {
    const r = spawnSync(process.execPath, [__filename, '--zone', tz], {
      env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024
    });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
    if (m) { passed += Number(m[1]); failed += Number(m[2]); }
    if (r.status !== 0 || !m) bad++;
  });
  console.log('\nALL ZONES: ' + passed + ' passed, ' + failed + ' failed' + (bad ? '  (' + bad + ' zone run(s) not clean)' : ''));
  process.exit(bad ? 1 : 0);
}

const ZONE = process.argv[3];
process.env.TZ = ZONE;

const assert = require('assert');
const Mastery = require(path.join(__dirname, 'mastery.js'));

const KEY = 'atlas-mastery';
const DAY = 86400000;
const HOUR = 3600000;

/* ===== Harness ===== */

const tally = { passed: 0, failed: 0 };

function check(name, fn) {
  try {
    fn();
    tally.passed++;
    console.log('PASS  [' + ZONE + '] ' + name);
  } catch (e) {
    tally.failed++;
    console.log('FAIL  [' + ZONE + '] ' + name + '\n      ' + String((e && e.stack) || e).split('\n').slice(0, 16).join('\n      '));
  }
}

function rngOf(seed) {
  let s = (seed >>> 0) || 0x9E3779B9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const plain = v => JSON.parse(JSON.stringify(v));

function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// JSON with object keys sorted, so two stores compare whatever order they were built in
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

// Fails with the first place two JSON values differ
function sameJson(a, b, msg, at) {
  const where = at || '';
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
    keys.forEach(k => {
      if (!hasOwn(a, k) || !hasOwn(b, k)) assert.fail(msg + ': ' + where + '/' + k + ' is ' + (hasOwn(a, k) ? JSON.stringify(a[k]) : 'missing') + ' vs ' + (hasOwn(b, k) ? JSON.stringify(b[k]) : 'missing'));
      sameJson(a[k], b[k], msg, where + '/' + k);
    });
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) assert.fail(msg + ': ' + where + ' is ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
}

function memStorage(seed) {
  const map = new Map();
  if (seed !== undefined) map.set(KEY, typeof seed === 'string' ? seed : JSON.stringify(seed));
  const s = {
    map: map, failGet: false, failSet: false, failRemove: false, sets: 0, refused: 0,
    getItem(k) {
      if (s.failGet) throw new Error('SecurityError: getItem');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (typeof s.failSet === 'function' ? s.failSet() : s.failSet) {
        s.refused++;
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      s.sets++;
      map.set(k, String(v));
    },
    removeItem(k) {
      if (s.failRemove) throw new Error('SecurityError: removeItem');
      map.delete(k);
    },
    raw() { return map.has(KEY) ? map.get(KEY) : null; }
  };
  return s;
}

/* ===== An independent calendar: walk the local dates one at a time ===== */

const pad = n => (n < 10 ? '0' : '') + n;
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const CAL_FROM = -1500, CAL_TO = 9000;
const calIndex = new Map();
const calDate = [];
for (let i = CAL_FROM; i <= CAL_TO; i++) {
  const d = new Date(2026, 0, 1 + i, 12);      // noon always exists
  calIndex.set(ymd(d), i);
  calDate.push(ymd(d));
}

function refDay(ms) {
  const i = calIndex.get(ymd(new Date(ms)));
  if (i === undefined) throw new Error('clock left the test calendar: ' + new Date(ms));
  return i;
}

const refDate = day => calDate[day - CAL_FROM];

// The first instant of local calendar day `day` (found by bisection, so it
// is right on days whose midnight doesn't exist)
function dayStart(day) {
  let lo = new Date(2026, 0, day, 12).getTime();          // noon the day before
  let hi = new Date(2026, 0, 1 + day, 12).getTime();      // noon that day
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (refDay(mid) >= day) hi = mid;
    else lo = mid;
  }
  return hi;
}

const at = (y, mo, d, h, mi, s, ms) => new Date(y, mo - 1, d, h || 0, mi || 0, s || 0, ms || 0).getTime();

function clockAt(ms) {
  const c = { ms: ms, now: () => c.ms };
  return c;
}

/* ===== Reference model, written from SPEC.md ===== */

const I = [0, 1, 3, 7, 16, 35];
const W = [0, 0.2, 0.45, 0.7, 0.9, 1];

function refLevel(seen, box) {
  if (!seen) return 'new';
  if (box <= 1) return 'learning';
  if (box <= 3) return 'familiar';
  return 'mastered';
}

const uniqStrings = list => Array.from(new Set(list.filter(n => typeof n === 'string')));

// mode 'always' is the scheduling table exactly as SPEC.md has it. mode
// 'daily' is mastery.js's documented default: a first-try answer on a day the
// item was already answered earns no further box, only "not due before tomorrow".
class Ref {
  constructor(mode) {
    this.mode = mode || 'daily';
    this.items = new Map();
    this.rows = new Map();       // day -> [games, questions, firstTry, seconds]; never pruned
  }

  static key(skill, name) { return skill + '\u0001' + name; }

  it(skill, name) { return this.items.get(Ref.key(skill, name)) || null; }

  record(skill, name, outcome, today) {
    const k = Ref.key(skill, name);
    let it = this.items.get(k);
    if (!it) {
      it = { skill: skill, name: name, seen: 0, first: 0, second: 0, missed: 0, streak: 0, box: 0, due: null, last: null };
      this.items.set(k, it);
    }
    if (outcome === 'first') {
      if (this.mode !== 'always' && it.seen > 0 && it.last === today) {
        it.due = Math.max(it.due, today + 1);
      } else {
        it.box = Math.min(5, it.box + 1);
        it.due = today + I[it.box];
      }
      it.first++;
      it.streak++;
    } else if (outcome === 'second') {
      it.box = Math.max(1, Math.min(it.box, 2));
      it.streak = 0;
      it.due = today + 1;
      it.second++;
    } else if (outcome === 'miss') {
      it.box = 1;
      it.streak = 0;
      it.due = today;
      it.missed++;
    } else {
      throw new Error('test bug: outcome ' + outcome);
    }
    it.seen++;
    it.last = today;
  }

  session(s, today) {
    const row = this.rows.get(today) || [0, 0, 0, 0];
    row[0] += 1; row[1] += s.questions; row[2] += s.firstTry; row[3] += s.seconds;
    this.rows.set(today, row);
  }

  view(skill, name, today) {
    const it = this.it(skill, name);
    if (!it) {
      return { seen: 0, first: 0, second: 0, missed: 0, streak: 0, box: 0, due: null, last: null, accuracy: null, level: 'new', isDue: false };
    }
    return {
      seen: it.seen, first: it.first, second: it.second, missed: it.missed, streak: it.streak, box: it.box,
      due: it.due, last: it.last, accuracy: it.first / it.seen, level: refLevel(it.seen, it.box), isDue: it.due <= today
    };
  }

  summary(skill, names, today) {
    const list = uniqStrings(names);
    const out = { total: list.length, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0, accuracy: null, pct: 0 };
    let first = 0, answers = 0, weight = 0;
    list.forEach(n => {
      const it = this.it(skill, n);
      if (!it) { out.new++; return; }
      out.seen++;
      out[refLevel(it.seen, it.box)]++;
      if (it.due <= today) out.due++;
      first += it.first;
      answers += it.seen;
      weight += W[it.box];
    });
    if (answers) out.accuracy = first / answers;
    out.pct = list.length ? 100 * weight / list.length : 0;
    return out;
  }

  // [name, due, box, missed] of every due name, in SPEC order as far as SPEC fixes it
  dueRows(skill, names, today) {
    return uniqStrings(names).map(n => this.it(skill, n)).filter(it => it && it.due <= today)
      .map(it => [it.name, it.due, it.box, it.missed])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2] || b[3] - a[3]);
  }

  // [name, accuracy, missed, last]
  weakRows(skill, names, minSeen, includePerfect) {
    return uniqStrings(names).map(n => this.it(skill, n))
      .filter(it => it && it.seen >= minSeen && (includePerfect || it.first < it.seen))
      .map(it => [it.name, it.first / it.seen, it.missed, it.last])
      .sort((a, b) => a[1] - b[1] || b[2] - a[2] || b[3] - a[3]);
  }

  levels(skill, names) {
    const out = new Map();
    uniqStrings(names).forEach(n => {
      const it = this.it(skill, n);
      out.set(n, it ? refLevel(it.seen, it.box) : 'new');
    });
    return out;
  }

  activity(n, today) {
    const out = [];
    for (let d = today - n + 1; d <= today; d++) {
      const r = this.rows.get(d) || [0, 0, 0, 0];
      out.push({ day: d, date: refDate(d), games: r[0], questions: r[1], firstTry: r[2], seconds: r[3] });
    }
    return out;
  }

  activeDays() {
    return Array.from(this.rows.keys()).filter(d => this.rows.get(d)[0] > 0).sort((a, b) => a - b);
  }

  // Assumes no active day after `today` (every test clock here runs forward)
  streak(today) {
    let longest = 0, run = 0, prev = null;
    this.activeDays().forEach(d => {
      run = prev !== null && d === prev + 1 ? run + 1 : 1;
      prev = d;
      if (run > longest) longest = run;
    });
    return { current: prev !== null && prev >= today - 1 ? run : 0, longest: longest };
  }

  totals() {
    const t = { games: 0, questions: 0, firstTry: 0, seconds: 0, daysActive: 0, itemsSeen: 0, itemsMastered: 0 };
    this.rows.forEach(r => {
      t.games += r[0]; t.questions += r[1]; t.firstTry += r[2]; t.seconds += r[3];
      if (r[0] > 0) t.daysActive++;
    });
    this.items.forEach(it => {
      t.itemsSeen++;
      if (it.box >= 4) t.itemsMastered++;
    });
    return t;
  }

  skills() {
    return Array.from(new Set(Array.from(this.items.values()).map(it => it.skill))).sort();
  }

  // SPEC merge: per item the larger seen, tie -> later lastDay, tie -> higher
  // box; days element-wise max. Where SPEC leaves a tie open, `settle(mine,
  // theirs)` says which of the two the implementation kept.
  merge(other, settle) {
    other.items.forEach((theirs, k) => {
      const mine = this.items.get(k);
      if (!mine) {
        this.items.set(k, Object.assign({}, theirs));
        return;
      }
      const cmp = (theirs.seen - mine.seen) || (theirs.last - mine.last) || (theirs.box - mine.box);
      if (cmp > 0) this.items.set(k, Object.assign({}, theirs));
      else if (cmp === 0 && canon(mine) !== canon(theirs) && settle(mine, theirs) === theirs) this.items.set(k, Object.assign({}, theirs));
    });
    other.rows.forEach((theirs, d) => {
      const mine = this.rows.get(d);
      this.rows.set(d, mine ? mine.map((v, i) => Math.max(v, theirs[i])) : theirs.slice());
    });
  }

  snapshot() {
    return canon({ items: Array.from(this.items.entries()).sort(), rows: Array.from(this.rows.entries()).sort((a, b) => a[0] - b[0]) });
  }

  // This state written in SPEC.md's own storage layout
  specBlob() {
    const blob = { v: 1, items: {}, days: {} };
    this.items.forEach(it => {
      if (!Object.prototype.hasOwnProperty.call(blob.items, it.skill)) {
        Object.defineProperty(blob.items, it.skill, { value: {}, enumerable: true, writable: true, configurable: true });
      }
      Object.defineProperty(blob.items[it.skill], it.name, {
        value: [it.seen, it.first, it.second, it.missed, it.streak, it.box, it.due, it.last], enumerable: true, writable: true, configurable: true
      });
    });
    this.rows.forEach((r, d) => { blob.days[d] = r.slice(); });
    return blob;
  }
}

/* ===== Comparing an instance with the model ===== */

function compareViews(m, ref, today, rng, skills, names, tag, opts) {
  const o = opts || {};
  skills.forEach(skill => {
    names.forEach(name => {
      assert.deepStrictEqual(m.get(skill, name), ref.view(skill, name, today), tag + ' get(' + skill + ', ' + name + ')');
    });

    let list = shuffle(rng, names.filter(() => rng() < 0.85)).concat(['Never Asked']);
    if (rng() < 0.5) list = list.concat(list.slice(0, 2));     // repeats must not count twice

    const got = m.summary(skill, list), want = ref.summary(skill, list, today);
    assert.ok(Math.abs(got.pct - want.pct) <= 0.0500001, tag + ' summary pct ' + got.pct + ' vs ' + want.pct);
    assert.ok(got.pct >= 0 && got.pct <= 100);
    assert.deepStrictEqual(Object.assign({}, got, { pct: 0 }), Object.assign({}, want, { pct: 0 }), tag + ' summary(' + skill + ')');

    const lv = m.levels(skill, list);
    const wantLv = ref.levels(skill, list);
    wantLv.forEach((level, name) => {
      assert.ok(hasOwn(lv, name), tag + ' levels() has no entry for ' + JSON.stringify(name));
      assert.strictEqual(lv[name], level, tag + ' levels ' + name);
    });
    assert.strictEqual(Object.keys(lv).length, wantLv.size, tag + ' levels size');

    // due: same names, in an order SPEC allows; limit = a prefix
    const dueWant = ref.dueRows(skill, list, today);
    const dueGot = m.due(skill, list);
    assert.deepStrictEqual(dueGot.slice().sort(), dueWant.map(r => r[0]).sort(), tag + ' due set');
    const dueKey = new Map(dueWant.map(r => [r[0], r]));
    for (let i = 1; i < dueGot.length; i++) {
      const a = dueKey.get(dueGot[i - 1]), b = dueKey.get(dueGot[i]);
      assert.ok((a[1] - b[1] || a[2] - b[2] || b[3] - a[3]) <= 0, tag + ' due order: ' + a + ' before ' + b);
    }
    const lim = int(rng, 0, 6);
    assert.deepStrictEqual(m.due(skill, list, { limit: lim }), dueGot.slice(0, lim), tag + ' due limit');

    // weakest: SPEC order; mastery.js leaves never-missed names out unless asked
    [false, true].forEach(perfect => {
      const minSeen = pick(rng, [undefined, 1, 2, 3, 5]);
      const q = {};
      if (minSeen !== undefined) q.minSeen = minSeen;
      if (perfect) q.includePerfect = true;
      const weakWant = ref.weakRows(skill, list, minSeen === undefined ? 2 : minSeen, perfect);
      const weakGot = m.weakest(skill, list, undefined, q);
      assert.deepStrictEqual(weakGot.slice().sort(), weakWant.map(r => r[0]).sort(), tag + ' weakest set (minSeen ' + minSeen + ', perfect ' + perfect + ')');
      const weakKey = new Map(weakWant.map(r => [r[0], r]));
      for (let i = 1; i < weakGot.length; i++) {
        const a = weakKey.get(weakGot[i - 1]), b = weakKey.get(weakGot[i]);
        assert.ok((a[1] - b[1] || b[2] - a[2] || b[3] - a[3]) <= 0, tag + ' weakest order');
      }
      const n = int(rng, 0, 5);
      assert.deepStrictEqual(m.weakest(skill, list, n, q), weakGot.slice(0, n), tag + ' weakest n');
    });
  });

  assert.deepStrictEqual(m.skills().slice().sort(), ref.skills(), tag + ' skills');
  assert.deepStrictEqual(m.streak(), ref.streak(today), tag + ' streak on day ' + today);
  const n = pick(rng, [0, 1, 2, 7, 30, 365, 400, 401]);
  assert.deepStrictEqual(m.activity(n), ref.activity(n, today), tag + ' activity(' + n + ')');
  if (!o.skipTotals) assert.deepStrictEqual(m.totals(), ref.totals(), tag + ' totals');
}

const NAMES = ['Chad', 'Mali', 'Peru', 'Laos', 'Fiji', 'Togo', 'Côte d\'Ivoire', 'São Tomé and Príncipe', 'Åland', 'Saint Vincent and the Grenadines'];
const HOSTILE = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'length', '0', ' ', 'a"b\\c', '🌍', '\ud800'];
const SKILLS = ['world-country', 'flag', 'province:china'];

// Moves a clock forward the ways a real one moves between answers
function advance(rng, clock) {
  const today = refDay(clock.ms);
  const r = rng();
  if (r < 0.30) clock.ms = Math.min(clock.ms + int(rng, 0, 3 * HOUR), dayStart(today + 2) - 1);
  else if (r < 0.42) clock.ms = dayStart(today + 1) - 1;                                   // the last millisecond of today
  else if (r < 0.54) clock.ms = dayStart(today + 1);                                       // the first of tomorrow
  else if (r < 0.86) clock.ms = dayStart(today + int(rng, 1, 3)) + int(rng, 0, 20 * HOUR);
  else if (r < 0.99) clock.ms = dayStart(today + int(rng, 4, 45)) + int(rng, 0, 20 * HOUR);
  else clock.ms = dayStart(today + int(rng, 150, 450)) + int(rng, 0, 20 * HOUR);
}

// One random life of a single device, checked against the model at every step
function lifeOfOneDevice(seed, mode, names, steps) {
  const rng = rngOf(seed);
  const clock = clockAt(dayStart(int(rng, -40, 420)) + int(rng, 0, 20 * HOUR));
  const storage = memStorage();
  const make = () => Mastery.create({ storage: storage, now: clock.now, promote: mode });
  let m = make();
  const ref = new Ref(mode);
  const tag = 'seed ' + seed + ' (' + mode + ')';
  for (let step = 0; step < steps; step++) {
    const today = refDay(clock.ms);
    assert.strictEqual(m.today(), today, tag + ' today()');
    const r = rng();
    if (r < 0.52) {
      const skill = pick(rng, SKILLS), name = pick(rng, names);
      const outcome = pick(rng, ['first', 'first', 'first', 'first', 'second', 'miss']);
      ref.record(skill, name, outcome, today);
      assert.deepStrictEqual(m.record(skill, name, outcome), ref.view(skill, name, today),
        tag + ' step ' + step + ': record(' + skill + ', ' + JSON.stringify(name) + ', ' + outcome + ') on day ' + today);
    } else if (r < 0.60) {
      const q = int(rng, 0, 200);
      const s = { questions: q, firstTry: int(rng, 0, q), seconds: int(rng, 0, 1500) };
      ref.session(s, today);
      assert.deepStrictEqual(m.recordSession(s), ref.activity(1, today)[0], tag + ' step ' + step + ': recordSession');
    } else if (r < 0.82) {
      if (today < 6000) advance(rng, clock);
    } else if (r < 0.87) {
      m = make();                         // the page is reloaded
    } else if (r < 0.92) {
      // Nonsense must change nothing
      const before = canon(m.exportBlob());
      m.record(pick(rng, SKILLS), pick(rng, names), pick(rng, ['FIRST', 'right', '', null, undefined, 2, {}]));
      assert.strictEqual(m.record('', pick(rng, names), 'first'), null);
      assert.strictEqual(m.record(pick(rng, SKILLS), '', 'first'), null);
      assert.strictEqual(m.record(null, 7, 'first'), null);
      assert.strictEqual(canon(m.exportBlob()), before, tag + ' nonsense changed the store');
    } else {
      compareViews(m, ref, today, rng, SKILLS, names, tag + ' step ' + step);
    }
  }
  compareViews(m, ref, refDay(clock.ms), rng, SKILLS, names, tag + ' end');
  // What reached storage is the whole story: a new page sees the same thing
  compareViews(make(), ref, refDay(clock.ms), rng, SKILLS, names, tag + ' reloaded');
  assert.strictEqual(m.byteSize(), storage.raw() === null ? JSON.stringify(m.exportBlob()).length : storage.raw().length, tag + ' byteSize');
  return { ref: ref, m: m, clock: clock, storage: storage };
}

/* ===== 1. Calendar days: local midnight, DST, year ends ===== */

check('the zone is really in force, and the test calendar is sound', () => {
  // ICU spells some zones by an older alias (Asia/Katmandu for Asia/Kathmandu), so compare
  // against the runtime's own canonical name for the zone that was asked for
  assert.strictEqual(Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Intl.DateTimeFormat('en', { timeZone: ZONE }).resolvedOptions().timeZone);
  assert.strictEqual(refDay(at(2026, 1, 1, 0, 0)), 0);
  assert.strictEqual(refDay(at(2026, 12, 31, 23, 59, 59, 999)), 364);
  assert.strictEqual(refDay(at(2027, 1, 1)), 365);
  assert.strictEqual(refDay(at(2028, 2, 29, 12)), 789);
  assert.strictEqual(refDay(at(2025, 12, 31, 23, 59, 59, 999)), -1);
  assert.strictEqual(refDate(0), '2026-01-01');
  const len = d => (dayStart(d + 1) - dayStart(d)) / HOUR;
  if (ZONE === 'America/Chicago') {
    assert.strictEqual(len(refDay(at(2026, 3, 8, 12))), 23);
    assert.strictEqual(len(refDay(at(2026, 11, 1, 12))), 25);
    assert.strictEqual(new Date(at(2026, 1, 15)).getTimezoneOffset(), 360);
  }
  if (ZONE === 'Pacific/Auckland') {
    assert.strictEqual(len(refDay(at(2026, 4, 5, 12))), 25);
    assert.strictEqual(len(refDay(at(2026, 9, 27, 12))), 23);
    assert.strictEqual(new Date(at(2026, 1, 15)).getTimezoneOffset(), -780);
  }
});

check('dayNumber / dayToDate agree with the walked calendar every 20 minutes, Dec 2025 - Jan 2029', () => {
  const from = at(2025, 12, 20), to = at(2029, 1, 10);
  let prev = null, samples = 0;
  for (let ms = from; ms <= to; ms += 20 * 60000) {
    const d = Mastery.dayNumber(ms);
    if (d !== refDay(ms)) assert.fail('dayNumber(' + new Date(ms) + ') = ' + d + ', calendar says ' + refDay(ms));
    if (prev !== null && d !== prev && d !== prev + 1) assert.fail('day went ' + prev + ' -> ' + d + ' at ' + new Date(ms));
    if (d !== prev && Mastery.dayToDate(d) !== ymd(new Date(ms))) assert.fail('dayToDate(' + d + ') = ' + Mastery.dayToDate(d) + ' at ' + new Date(ms));
    prev = d;
    samples++;
  }
  assert.ok(samples > 80000);
});

// Every day from 2025-12-25 to 2028-12-31 that isn't 24 hours long
const ODD_DAYS = [];
for (let d = -7; d <= 1095; d++) {
  if (dayStart(d + 1) - dayStart(d) !== DAY) ODD_DAYS.push(d);
}

check('the day changes at the first instant of every local day, and not one millisecond sooner (' + ODD_DAYS.length + ' DST days included)', () => {
  const days = new Set([-1, 0, 1, 58, 59, 364, 365, 366, 729, 730, 788, 789, 790, 1095, 1096]);
  ODD_DAYS.forEach(d => { days.add(d - 1); days.add(d); days.add(d + 1); });
  days.forEach(d => {
    const start = dayStart(d);
    assert.strictEqual(Mastery.dayNumber(start - 1), d - 1, 'last ms before day ' + d + ' (' + refDate(d) + ')');
    assert.strictEqual(Mastery.dayNumber(start), d, 'first ms of day ' + d + ' (' + refDate(d) + ')');
    assert.strictEqual(Mastery.dayNumber(dayStart(d + 1) - 1), d, 'last ms of day ' + d);
    assert.strictEqual(Mastery.dayToDate(d), refDate(d));
  });
  if (ZONE === 'America/Chicago' || ZONE === 'Pacific/Auckland') assert.ok(ODD_DAYS.length >= 6, 'expected two DST changes a year');
});

// Answers and games either side of the midnight that starts day D
function midnightStory(D) {
  const label = 'day ' + D + ' (' + refDate(D) + ')';
  const clock = clockAt(dayStart(D) - 1);
  const storage = memStorage();
  const m = Mastery.create({ storage: storage, now: clock.now });

  // 23:59:59.999 on D-1
  assert.strictEqual(m.today(), D - 1, label);
  assert.deepStrictEqual(plain(m.record('s', 'x', 'first')), plain({ seen: 1, first: 1, second: 0, missed: 0, streak: 1, box: 1, due: D, last: D - 1, accuracy: 1, level: 'learning', isDue: false }), label);
  assert.strictEqual(m.record('s', 'y', 'miss').due, D - 1, label);
  assert.strictEqual(m.record('s', 'z', 'second').due, D, label);
  assert.strictEqual(m.get('s', 'z').isDue, false, label);
  assert.strictEqual(m.recordSession({ questions: 3, firstTry: 1, seconds: 10 }).day, D - 1, label);
  assert.deepStrictEqual(m.streak(), { current: 1, longest: 1 }, label);
  assert.deepStrictEqual(m.due('s', ['x', 'y', 'z']), ['y'], label);

  // 00:00:00.000 on D: a millisecond later everything due "tomorrow" is due
  clock.ms = dayStart(D);
  assert.strictEqual(m.today(), D, label);
  assert.strictEqual(m.get('s', 'x').isDue, true, label);
  assert.strictEqual(m.get('s', 'z').isDue, true, label);
  assert.deepStrictEqual(m.due('s', ['x', 'y', 'z']), ['y', 'x', 'z'], label + ': most overdue first, then the caller\'s order');
  assert.deepStrictEqual(m.summary('s', ['x', 'y', 'z', 'w']), { total: 4, seen: 3, new: 1, learning: 3, familiar: 0, mastered: 0, due: 3, accuracy: 1 / 3, pct: 15 }, label);
  // ...and it is a new day for promotion and for the activity log
  const x = m.record('s', 'x', 'first');
  assert.deepStrictEqual([x.box, x.due, x.last, x.streak], [2, D + 3, D, 2], label);
  m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
  assert.deepStrictEqual(m.streak(), { current: 2, longest: 2 }, label);
  assert.deepStrictEqual(m.activity(3).map(r => [r.day, r.date, r.games]), [[D - 2, refDate(D - 2), 0], [D - 1, refDate(D - 1), 1], [D, refDate(D), 1]], label);

  // 23:59:59.999 on D: still D
  clock.ms = dayStart(D + 1) - 1;
  assert.strictEqual(m.today(), D, label);
  assert.strictEqual(m.record('s', 'x', 'first').box, 2, label + ': no second step on the same day');
  assert.strictEqual(m.activity(1)[0].games, 1, label);

  // The run holds through all of D+1 and ends with it
  clock.ms = dayStart(D + 1);
  assert.strictEqual(m.record('s', 'x', 'first').box, 3, label);
  assert.deepStrictEqual(m.streak(), { current: 2, longest: 2 }, label + ': start of the day after');
  clock.ms = dayStart(D + 2) - 1;
  assert.deepStrictEqual(m.streak(), { current: 2, longest: 2 }, label + ': last ms of the day after');
  clock.ms = dayStart(D + 2);
  assert.deepStrictEqual(m.streak(), { current: 0, longest: 2 }, label + ': first ms two days after');

  // A new page at that instant sees the same thing
  const again = Mastery.create({ storage: storage, now: clock.now });
  assert.deepStrictEqual(again.streak(), { current: 0, longest: 2 }, label);
  assert.deepStrictEqual(again.get('s', 'x'), m.get('s', 'x'), label);
  assert.deepStrictEqual(Object.keys(JSON.parse(storage.raw()).days).map(Number).sort((a, b) => a - b), [D - 1, D], label);
}

check('instance across midnight: due dates, promotion, rows and the streak turn over exactly at local midnight (DST days, year ends, leap day)', () => {
  const days = new Set([0, 1, 365, 366, 730, 789, 790, 200]);
  ODD_DAYS.forEach(d => { days.add(d - 1); days.add(d); days.add(d + 1); days.add(d + 2); });
  days.forEach(midnightStory);
});

check('year boundaries: a run through 31 Dec -> 1 Jan (2025/26, 2026/27, 2027/28), dates and due days', () => {
  [[-3, '2025-12-29'], [362, '2026-12-29'], [727, '2027-12-29']].forEach(pair => {
    const D = pair[0];
    assert.strictEqual(refDate(D), pair[1]);
    const clock = clockAt(dayStart(D) + 9 * HOUR);
    const storage = memStorage();
    let m = Mastery.create({ storage: storage, now: clock.now });
    for (let i = 0; i < 6; i++) {
      clock.ms = dayStart(D + i) + (i % 2 ? 0 : DAY - HOUR - 1);    // late one night, at midnight the next
      m.recordSession({ questions: 5, firstTry: 5, seconds: 30 });
      m.record('s', 'x', 'first');
      if (i === 2) m = Mastery.create({ storage: storage, now: clock.now });
    }
    assert.deepStrictEqual(m.streak(), { current: 6, longest: 6 });
    assert.deepStrictEqual(m.activity(6).map(r => r.date), [0, 1, 2, 3, 4, 5].map(i => refDate(D + i)));
    assert.deepStrictEqual(m.activity(6).map(r => r.date.slice(5)), ['12-29', '12-30', '12-31', '01-01', '01-02', '01-03']);
    assert.deepStrictEqual(m.activity(6).map(r => r.games), [1, 1, 1, 1, 1, 1]);
    const x = m.get('s', 'x');
    assert.deepStrictEqual([x.box, x.last, x.due], [5, D + 5, D + 5 + 35]);
    assert.strictEqual(Mastery.dayToDate(x.due), refDate(D + 40));
    assert.strictEqual(m.totals().daysActive, 6);
    // Negative day numbers (a clock before 2026) are stored and read back like any other
    assert.deepStrictEqual(Mastery.create({ storage: storage, now: clock.now }).activity(6), m.activity(6));
  });
});

check('local, not UTC: an evening game and the next morning\'s are different days wherever UTC midnight falls', () => {
  // 15 June 2026, 20:00 local and 16 June, 07:00 local straddle UTC midnight in zones west of UTC,
  // and sit on one UTC date in zones well east of it
  const m = Mastery.create({ storage: null, now: () => at(2026, 6, 15, 20) });
  assert.strictEqual(m.today(), 165);
  assert.strictEqual(Mastery.dayToDate(m.today()), '2026-06-15');
  assert.strictEqual(Mastery.dayNumber(at(2026, 6, 16, 7)), 166);
  assert.strictEqual(Mastery.dayNumber(at(2026, 6, 15, 0, 0, 0, 0)), 165);
  assert.strictEqual(Mastery.dayNumber(at(2026, 6, 14, 23, 59, 59, 999)), 164);
});

/* ===== 2. Scheduling against the model ===== */

check('scheduling table, literal SPEC (promote "always"): every box x outcome, on the same day and on a later one', () => {
  for (let box = 0; box <= 5; box++) {
    ['first', 'second', 'miss'].forEach(outcome => {
      [0, 1, 9].forEach(gap => {
        const clock = clockAt(dayStart(300) + 5 * HOUR);
        const m = Mastery.create({ storage: memStorage(), now: clock.now, promote: 'always' });
        for (let i = 0; i < box; i++) m.record('s', 'x', 'first');       // SPEC: a box per first-try answer
        assert.strictEqual(m.get('s', 'x').box, box);
        clock.ms = dayStart(300 + gap) + 6 * HOUR;
        const today = 300 + gap;
        const it = m.record('s', 'x', outcome);
        const want = outcome === 'first' ? { box: Math.min(5, box + 1), streak: box + 1, due: today + I[Math.min(5, box + 1)] }
          : outcome === 'second' ? { box: Math.max(1, Math.min(box, 2)), streak: 0, due: today + 1 }
            : { box: 1, streak: 0, due: today };
        assert.deepStrictEqual({ box: it.box, streak: it.streak, due: it.due }, want, 'box ' + box + ' + ' + outcome + ' after ' + gap + ' days');
        assert.strictEqual(it.last, today);
        assert.strictEqual(it.isDue, outcome === 'miss');
        assert.strictEqual(it.level, it.box <= 1 ? 'learning' : it.box <= 3 ? 'familiar' : 'mastered');
      });
    });
  }
});

check('model, literal SPEC scheduling (promote "always"): 40 random lives x 500 steps, every API after every step', () => {
  for (let seed = 1; seed <= 40; seed++) lifeOfOneDevice(seed * 7919, 'always', NAMES, 500);
});

check('model, default scheduling (a box at most once a day): 40 random lives x 500 steps', () => {
  for (let seed = 1; seed <= 40; seed++) lifeOfOneDevice(seed * 104729, 'daily', NAMES, 500);
});

check('model with names like "__proto__", "constructor", "toString", a lone surrogate: same answers, in both modes', () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  for (let seed = 1; seed <= 12; seed++) lifeOfOneDevice(seed * 31337, seed % 2 ? 'daily' : 'always', HOSTILE.concat(['Chad']), 400);
  assert.strictEqual(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
  assert.strictEqual({}.seen, undefined);
});

check('"__proto__" and "constructor" as skill and as item name behave like any other key, through every API and a reload', () => {
  const storage = memStorage();
  const clock = clockAt(dayStart(319) + HOUR);
  const m = Mastery.create({ storage: storage, now: clock.now });
  ['__proto__', 'constructor', 'toString'].forEach(skill => {
    ['__proto__', 'constructor', 'hasOwnProperty'].forEach(name => {
      assert.strictEqual(m.get(skill, name).seen, 0, skill + '/' + name);
      assert.strictEqual(m.get(skill, name).level, 'new');
      m.record(skill, name, 'miss');
      assert.strictEqual(m.record(skill, name, 'first').seen, 2);
    });
    const names = ['__proto__', 'constructor', 'hasOwnProperty', 'valueOf'];
    assert.deepStrictEqual(m.summary(skill, names), { total: 4, seen: 3, new: 1, learning: 3, familiar: 0, mastered: 0, due: 0, accuracy: 0.5, pct: 15 });
    assert.deepStrictEqual(m.summary(skill).total, 3);
    const lv = m.levels(skill, names);
    assert.deepStrictEqual(Object.keys(lv).sort(), names.slice().sort(), 'levels() keys for skill ' + skill);
    names.forEach(n => assert.strictEqual(lv[n], n === 'valueOf' ? 'new' : 'learning'));
    assert.deepStrictEqual(Object.keys(m.levels(skill)).sort(), ['__proto__', 'constructor', 'hasOwnProperty']);
    assert.deepStrictEqual(m.weakest(skill, names).slice().sort(), ['__proto__', 'constructor', 'hasOwnProperty']);
    clock.ms += DAY;
    assert.deepStrictEqual(m.due(skill, names).slice().sort(), ['__proto__', 'constructor', 'hasOwnProperty']);
    assert.deepStrictEqual(m.due(skill).slice().sort(), ['__proto__', 'constructor', 'hasOwnProperty']);
    clock.ms -= DAY;
  });
  assert.deepStrictEqual(m.skills().sort(), ['__proto__', 'constructor', 'toString']);
  assert.strictEqual(m.totals().itemsSeen, 9);
  const again = Mastery.create({ storage: storage, now: clock.now });
  assert.strictEqual(canon(again.exportBlob()), canon(m.exportBlob()));
  assert.strictEqual(again.get('__proto__', '__proto__').seen, 2);
  const other = Mastery.create({ storage: memStorage(), now: clock.now });
  assert.strictEqual(other.mergeBlob(plain(m.exportBlob())), true);
  assert.strictEqual(canon(other.exportBlob()), canon(m.exportBlob()));
  assert.strictEqual(other.get('constructor', '__proto__').first, 1);
  assert.strictEqual({}.seen, undefined);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, 'missed'), false);
  assert.strictEqual(typeof {}.constructor, 'function');
});

check('a store written in SPEC.md\'s own layout (v: 1, eight fields) reads back as the model that wrote it, from storage and through mergeBlob', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const life = lifeOfOneDevice(seed * 271, 'always', NAMES.concat(['__proto__']), 250);
    const blob = life.ref.specBlob();
    const today = refDay(life.clock.ms);
    const rng = rngOf(seed);
    // (rows older than 400 days are pruned once read, but stay in the lifetime totals and the longest run)
    const names = NAMES.concat(['__proto__']);
    const fromStorage = Mastery.create({ storage: memStorage(JSON.stringify(blob)), now: life.clock.now, promote: 'always' });
    compareViews(fromStorage, life.ref, today, rng, SKILLS, names, 'spec blob from storage, seed ' + seed);
    fromStorage.record('flag', 'Chad', 'first');                            // the first save rewrites it
    const merged = Mastery.create({ storage: memStorage(), now: life.clock.now, promote: 'always' });
    merged.mergeBlob(plain(blob));
    compareViews(merged, life.ref, today, rng, SKILLS, names, 'spec blob merged, seed ' + seed);
    assert.ok(Object.keys(merged.exportBlob().days).every(d => Number(d) >= today - 400));
    assert.strictEqual(merged.mergeBlob(plain(blob)), false, 'merging it again changes nothing');
    assert.strictEqual(merged.mergeBlob(life.m.exportBlob()), false, 'nor does the same history in the compact layout');
  }
});

// Daily play in runs of random length with gaps between, the page reloaded now and then
check('streaks against the model over years: runs of 1-700 days, gaps, reloads; rows pruned at 400 days', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const rng = rngOf(seed * 97);
    const clock = clockAt(dayStart(int(rng, -30, 300)) + 8 * HOUR);
    const storage = memStorage();
    let m = Mastery.create({ storage: storage, now: clock.now });
    const ref = new Ref();
    let today = refDay(clock.ms);
    const runs = [int(rng, 1, 30), int(rng, 420, 700), int(rng, 1, 5), int(rng, 395, 405), int(rng, 30, 200), int(rng, 401, 460)];
    runs.forEach(len => {
      for (let i = 0; i < len; i++) {
        const games = rng() < 0.2 ? 2 : 1;
        for (let g = 0; g < games; g++) {
          const s = { questions: int(rng, 1, 50), firstTry: 1, seconds: int(rng, 5, 600) };
          ref.session(s, today);
          m.recordSession(s);
        }
        if (rng() < 0.03) m = Mastery.create({ storage: storage, now: clock.now });
        assert.deepStrictEqual(m.streak(), ref.streak(today), 'seed ' + seed + ' day ' + today);
        today++;
        clock.ms = dayStart(today) + int(rng, 0, 20 * HOUR);
      }
      // The day after the last game the run still stands; then a gap
      assert.deepStrictEqual(m.streak(), ref.streak(today), 'seed ' + seed + ' day after, ' + today);
      const gap = int(rng, 1, 12);
      today += gap;
      clock.ms = dayStart(today) + int(rng, 0, 20 * HOUR);
      assert.deepStrictEqual(m.streak(), ref.streak(today), 'seed ' + seed + ' after a gap, day ' + today);
      assert.strictEqual(m.streak().current, 0);
    });
    const t = m.totals(), want = ref.totals();
    assert.deepStrictEqual(t, want, 'lifetime totals outlive the pruned rows');
    assert.deepStrictEqual(m.activity(400), ref.activity(400, today));
    assert.ok(Object.keys(JSON.parse(storage.raw()).days).length <= 401);
    const again = Mastery.create({ storage: storage, now: clock.now });
    assert.deepStrictEqual(again.streak(), ref.streak(today));
    assert.deepStrictEqual(again.totals(), want);
  }
});

/* ===== 3. Merging ===== */

// Several devices on one clock, syncing pairwise at random, each shadowed by a model
function devicesStory(seed, o) {
  const rng = rngOf(seed);
  const clock = clockAt(dayStart(int(rng, 0, 500)) + 8 * HOUR);
  const startDay = refDay(clock.ms);
  const devs = [];
  for (let i = 0; i < o.devices; i++) {
    const storage = memStorage();
    devs.push({ id: i, storage: storage, m: Mastery.create({ storage: storage, now: clock.now }), ref: new Ref() });
  }
  const names = NAMES.slice(0, 5).concat(['__proto__']);
  const tag = 'devices seed ' + seed;

  function sync(from, to) {
    const blob = JSON.parse(JSON.stringify(from.m.exportBlob()));       // over the wire
    const sent = canon(blob);
    const before = to.ref.snapshot();
    const seenBefore = new Map(Array.from(to.ref.items.entries()).map(e => [e[0], e[1].seen]));
    const changed = to.m.mergeBlob(blob);
    assert.strictEqual(canon(blob), sent, tag + ': mergeBlob modified its argument');
    const today = refDay(clock.ms);
    to.ref.merge(from.ref, (mine, theirs) => {
      const got = canon(to.m.get(mine.skill, mine.name));
      const a = canon(to.ref.view(mine.skill, mine.name, today));
      const b = canon(Object.assign(new Ref(), { items: new Map([[Ref.key(theirs.skill, theirs.name), theirs]]) }).view(theirs.skill, theirs.name, today));
      assert.ok(got === a || got === b, tag + ': a tied item came out as neither side');
      return got === a ? mine : theirs;
    });
    assert.strictEqual(changed, to.ref.snapshot() !== before, tag + ': mergeBlob return value');
    seenBefore.forEach((seen, k) => assert.ok(to.ref.items.get(k).seen >= seen, tag + ': an item lost answers'));
    compareViews(to.m, to.ref, today, rng, SKILLS, names, tag + ' after sync ' + from.id + '->' + to.id);
    assert.strictEqual(to.m.mergeBlob(JSON.parse(sent)), false, tag + ': merging the same blob again');
  }

  for (let step = 0; step < o.steps; step++) {
    const today = refDay(clock.ms);
    const d = pick(rng, devs);
    const r = rng();
    if (r < 0.45) {
      const skill = pick(rng, SKILLS), name = pick(rng, names), outcome = pick(rng, ['first', 'first', 'first', 'second', 'miss']);
      d.ref.record(skill, name, outcome, today);
      assert.deepStrictEqual(d.m.record(skill, name, outcome), d.ref.view(skill, name, today), tag + ' step ' + step);
    } else if (r < 0.60) {
      const q = int(rng, 1, 40);
      const s = { questions: q, firstTry: int(rng, 0, q), seconds: int(rng, 1, 900) };
      d.ref.session(s, today);
      d.m.recordSession(s);
    } else if (r < 0.75) {
      let other = pick(rng, devs);
      if (other === d) other = devs[(d.id + 1) % devs.length];
      sync(d, other);
      if (rng() < 0.5) sync(other, d);
    } else if (r < 0.80) {
      d.m = Mastery.create({ storage: d.storage, now: clock.now });
    } else if (today - startDay < o.maxDays) {
      const rr = rng();
      if (rr < 0.4) clock.ms = Math.min(clock.ms + int(rng, 0, 4 * HOUR), dayStart(today + 1) - 1);
      else if (rr < 0.9) clock.ms = dayStart(today + 1) + int(rng, 0, 20 * HOUR);
      else clock.ms = dayStart(today + int(rng, 2, 9)) + int(rng, 0, 20 * HOUR);
    }
  }

  // Everyone syncs with everyone, twice: all devices end up identical
  for (let round = 0; round < 2; round++) {
    devs.forEach(a => devs.forEach(b => { if (a !== b) sync(a, b); }));
  }
  const today = refDay(clock.ms);
  const first = canon(devs[0].m.exportBlob());
  devs.forEach(d => {
    assert.strictEqual(canon(d.m.exportBlob()), first, tag + ': devices differ after a full sync');
    assert.strictEqual(d.ref.snapshot(), devs[0].ref.snapshot());
    compareViews(d.m, d.ref, today, rng, SKILLS, names, tag + ' final');
    compareViews(Mastery.create({ storage: d.storage, now: clock.now }), d.ref, today, rng, SKILLS, names, tag + ' final, reloaded');
  });
}

check('three devices syncing at random (30 stories): every merge matches SPEC\'s rule, returns "changed" truthfully, and all devices converge', () => {
  for (let seed = 1; seed <= 30; seed++) devicesStory(seed * 6151, { devices: 3, steps: 260, maxDays: 330 });
});

// A store with a plausible random history, as its export
function randomBlob(rng, clock, days) {
  const m = Mastery.create({ storage: null, now: clock.now });
  const end = clock.ms;
  const last = refDay(end);
  for (let d = last - days; d <= last; d++) {
    if (rng() < 0.5) continue;
    clock.ms = dayStart(d) + int(rng, 0, 20 * HOUR);
    const n = int(rng, 1, 6);
    for (let i = 0; i < n; i++) m.record(pick(rng, SKILLS), pick(rng, NAMES.concat(HOSTILE.slice(0, 3))), pick(rng, ['first', 'first', 'second', 'miss']));
    if (rng() < 0.7) m.recordSession({ questions: n, firstTry: int(rng, 0, n), seconds: int(rng, 1, 400) });
  }
  clock.ms = end;
  return m.exportBlob();
}

const HOSTILE_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'length', '0', '-1', '1e3', ' 12', '007', '-0', '+5', '0x10', '', 'null', 'NaN', '319', '320', '-400', '999999', '1000000'];

function setOwn(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  return o;
}

function junk(rng, depth) {
  switch (int(rng, 0, 23)) {
    case 0: return null;
    case 1: return true;
    case 2: return false;
    case 3: return 'text';
    case 4: return '12';
    case 5: return -1;
    case 6: return -7.5;
    case 7: return 1.5;
    case 8: return 1e308;
    case 9: return -1e308;
    case 10: return 1e21;
    case 11: return 0;
    case 12: return [];
    case 13: return {};
    case 14: return [[]];
    case 15: return [null, null, null];
    case 16: return '__proto__';
    case 17: return 4294967296;
    case 18: return 9007199254740992;
    case 19: return depth > 2 ? 1 : [junk(rng, depth + 1), junk(rng, depth + 1), junk(rng, depth + 1)];
    case 20: return depth > 2 ? {} : setOwn({}, pick(rng, HOSTILE_KEYS), junk(rng, depth + 1));
    case 21: return [int(rng, -500, 1500), int(rng, -3, 9), int(rng, -3, 40), int(rng, -3, 40), int(rng, -3, 9), int(rng, -3, 9), int(rng, -3, 60)];
    case 22: return [int(rng, 0, 40), int(rng, 0, 40), int(rng, 0, 9), int(rng, 0, 9), int(rng, 0, 9), int(rng, 0, 7), int(rng, -500, 1500), int(rng, -500, 1500)];
    default: return int(rng, -400, 1600);
  }
}

// A damaged copy of a JSON value: wrong types, truncated and overlong arrays,
// negative and fractional numbers, renamed, dropped and planted keys
function mutate(v, rng, rate, depth) {
  const dep = depth || 0;
  if (rng() < rate) return junk(rng, dep);
  if (Array.isArray(v)) {
    let a = v.map(x => mutate(x, rng, rate, dep + 1));
    const r = rng();
    if (r < rate) a = a.slice(0, int(rng, 0, a.length));
    else if (r < 2 * rate) a.push(junk(rng, 3));
    else if (r < 3 * rate && a.length) a[int(rng, 0, a.length - 1)] = -Math.abs(Number(a[0])) || -3;
    return a;
  }
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach(k => {
      if (rng() < rate / 2) return;
      setOwn(o, rng() < rate / 2 ? pick(rng, HOSTILE_KEYS) : k, mutate(v[k], rng, rate, dep + 1));
    });
    if (rng() < rate * 2) setOwn(o, pick(rng, HOSTILE_KEYS), junk(rng, dep + 1));
    return o;
  }
  if (typeof v === 'number') {
    const r = rng();
    if (r < rate) return -v;
    if (r < 2 * rate) return v + 0.5;
    if (r < 3 * rate) return String(v);
    if (r < 4 * rate) return v * 1e9;
  }
  return v;
}

const isCount = n => Number.isInteger(n) && n >= 0;

// A store as it reads back from storage. For anything a game could have
// written this is the store itself; numbers past the billion ceiling (only
// damage puts them there) come back at the ceiling.
function reread(m, clock) {
  return Mastery.create({ storage: memStorage(JSON.stringify(m.exportBlob())), now: clock.now }).exportBlob();
}

// Whatever was loaded or merged, everything the API hands back is well-formed
function assertSane(m, today, tag) {
  const blob = m.exportBlob();
  assert.strictEqual(canon(JSON.parse(JSON.stringify(blob))), canon(blob), tag + ': export is not JSON-safe');
  const numbers = v => (v && typeof v === 'object' ? Object.keys(v).every(k => numbers(v[k])) : Number.isInteger(v));
  assert.ok(numbers(blob.items) && numbers(blob.days) && numbers(blob.life || []), tag + ': something that is not a whole number got into the store');
  const skills = m.skills();
  assert.deepStrictEqual(skills.slice().sort(), Object.keys(blob.items).sort(), tag + ' skills');
  let seenItems = 0;
  skills.forEach(skill => {
    const names = Object.keys(blob.items[skill]);
    assert.ok(names.length > 0, tag + ': an empty skill is listed');
    const tallies = { learning: 0, familiar: 0, mastered: 0 };
    let dueCount = 0;
    names.forEach(name => {
      const v = m.get(skill, name);
      const where = tag + ' ' + JSON.stringify(skill) + '/' + JSON.stringify(name) + ' ' + JSON.stringify(v);
      assert.ok(isCount(v.seen) && v.seen >= 1, where);
      assert.ok(isCount(v.first) && isCount(v.second) && isCount(v.missed) && isCount(v.streak), where);
      assert.strictEqual(v.first + v.second + v.missed, v.seen, where);
      assert.ok(Number.isInteger(v.box) && v.box >= 1 && v.box <= 5, where);
      assert.ok(Number.isInteger(v.due) && Number.isInteger(v.last) && v.due >= v.last, where);
      assert.strictEqual(v.accuracy, v.first / v.seen, where);
      assert.strictEqual(v.level, v.box <= 1 ? 'learning' : v.box <= 3 ? 'familiar' : 'mastered', where);
      assert.strictEqual(v.isDue, v.due <= today, where);
      tallies[v.level]++;
      if (v.isDue) dueCount++;
      seenItems++;
    });
    const s = m.summary(skill);
    assert.deepStrictEqual([s.total, s.seen, s.new, s.learning, s.familiar, s.mastered, s.due],
      [names.length, names.length, 0, tallies.learning, tallies.familiar, tallies.mastered, dueCount], tag + ' summary');
    assert.ok(s.accuracy >= 0 && s.accuracy <= 1 && s.pct >= 0 && s.pct <= 100, tag + ' summary numbers');
    assert.strictEqual(m.due(skill).length, dueCount, tag);
    assert.deepStrictEqual(Object.keys(m.levels(skill)).sort(), names.slice().sort(), tag + ' levels');
    assert.ok(m.weakest(skill, undefined, 5).length <= 5);
  });
  const t = m.totals();
  Object.keys(t).forEach(k => assert.ok(isCount(t[k]), tag + ' totals.' + k + ' = ' + t[k]));
  assert.strictEqual(t.itemsSeen, seenItems, tag);
  const st = m.streak();
  assert.ok(isCount(st.current) && isCount(st.longest) && st.current <= st.longest, tag + ' streak ' + JSON.stringify(st));
  const act = m.activity(30);
  assert.strictEqual(act.length, 30);
  act.forEach((r, i) => {
    assert.strictEqual(r.day, today - 29 + i);
    assert.ok(isCount(r.games) && isCount(r.questions) && isCount(r.firstTry) && isCount(r.seconds), tag + ' activity row');
    assert.ok(/^\d{4}-\d\d-\d\d$/.test(r.date), tag + ' activity date ' + r.date);
  });
  assert.ok(isCount(m.byteSize()));
}

function protoSnapshot() {
  return [Object.prototype, Array.prototype, Function.prototype, String.prototype, Number.prototype]
    .map(p => Object.getOwnPropertyNames(p).sort().join()).join('|') + '|' + Object.keys({}).length + String({}.polluted);
}

check('merge laws on 150 random pairs, plain and damaged: commutative, idempotent, never loses an answer, a day\'s numbers or a tally', () => {
  const proto = protoSnapshot();
  const rng = rngOf(424242);
  for (let trial = 0; trial < 150; trial++) {
    const clock = clockAt(dayStart(int(rng, 100, 900)) + 10 * HOUR);
    const today = refDay(clock.ms);
    let a = randomBlob(rng, clock, pick(rng, [5, 40, 380, 520]));
    let b = randomBlob(rng, clock, pick(rng, [5, 40, 380, 520]));
    if (trial % 3 === 1) b = mutate(b, rng, 0.04);
    if (trial % 3 === 2) { a = mutate(a, rng, 0.08); b = mutate(b, rng, 0.08); }
    const tag = 'trial ' + trial;
    const open = blob => Mastery.create({ storage: memStorage(JSON.stringify(blob)), now: clock.now });

    const A = open(a), B = open(b);
    const aView = A.exportBlob(), bView = B.exportBlob();     // what each side really holds, once cleaned
    const ab = open(a); ab.mergeBlob(plain(b));
    const ba = open(b); ba.mergeBlob(plain(a));
    sameJson(ab.exportBlob(), ba.exportBlob(), tag + ': A+B differs from B+A');
    assert.deepStrictEqual(ab.streak(), ba.streak(), tag);
    assert.deepStrictEqual(ab.totals(), ba.totals(), tag);
    assertSane(ab, today, tag);

    const once = canon(ab.exportBlob());
    assert.strictEqual(ab.mergeBlob(plain(b)), false, tag + ': second merge of B reported a change');
    assert.strictEqual(ab.mergeBlob(plain(a)), false, tag);
    assert.strictEqual(ab.mergeBlob(ab.exportBlob()), false, tag);
    assert.strictEqual(canon(ab.exportBlob()), once, tag);
    assert.strictEqual(A.mergeBlob(plain(aView)), false, tag + ': a store merged with its own export changed');

    // Nothing either side had is smaller afterwards
    [[A, aView], [B, bView]].forEach(side => {
      const m = side[0], blob = side[1];
      Object.keys(blob.items).forEach(skill => Object.keys(blob.items[skill]).forEach(name => {
        const was = m.get(skill, name), now = ab.get(skill, name);
        assert.ok(now.seen >= was.seen, tag + ': ' + skill + '/' + name + ' lost answers');
        const other = (m === A ? B : A).get(skill, name);
        assert.ok(canon(now) === canon(was) || canon(now) === canon(other), tag + ': merged item is neither side\'s');
      }));
      const was = m.activity(401), now = ab.activity(401);
      was.forEach((r, i) => ['games', 'questions', 'firstTry', 'seconds'].forEach(k => assert.ok(now[i][k] >= r[k], tag + ': day ' + r.day + ' ' + k + ' shrank')));
      const tw = m.totals(), tn = ab.totals();
      ['games', 'questions', 'firstTry', 'seconds', 'daysActive', 'itemsSeen'].forEach(k => assert.ok(tn[k] >= tw[k], tag + ': totals.' + k + ' shrank'));
      assert.ok(ab.streak().longest >= m.streak().longest, tag + ': longest streak shrank');
      assert.ok(ab.streak().current >= m.streak().current, tag + ': current streak shrank from ' + m.streak().current + ' to ' + ab.streak().current);
    });
    // Days are the element-wise max exactly
    const ra = A.activity(401), rb = B.activity(401), rm = ab.activity(401);
    rm.forEach((r, i) => ['games', 'questions', 'firstTry', 'seconds'].forEach(k => assert.strictEqual(r[k], Math.max(ra[i][k], rb[i][k]), tag + ' day max')));
  }
  assert.strictEqual(protoSnapshot(), proto);
});

function playDaily(m, clock, fromDay, toDay) {
  for (let d = fromDay; d <= toDay; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    m.recordSession({ questions: 10, firstTry: 9, seconds: 60 });
  }
}

check('a run longer than the 400-day row window survives when its last day was played on a device that had not synced yet', () => {
  const clock = clockAt(dayStart(1));
  const A = Mastery.create({ storage: memStorage(), now: clock.now });
  playDaily(A, clock, 1, 500);
  assert.deepStrictEqual(A.streak(), { current: 500, longest: 500 });
  const B = Mastery.create({ storage: memStorage(), now: clock.now });
  clock.ms = dayStart(501) + 7 * HOUR;
  B.recordSession({ questions: 5, firstTry: 5, seconds: 20 });            // offline, on the phone
  assert.deepStrictEqual(B.streak(), { current: 1, longest: 1 });
  B.mergeBlob(plain(A.exportBlob()));
  assert.deepStrictEqual(B.streak(), { current: 501, longest: 501 }, 'phone after pulling');
  A.mergeBlob(plain(B.exportBlob()));
  assert.deepStrictEqual(A.streak(), { current: 501, longest: 501 }, 'laptop after pulling');
  assert.strictEqual(canon(A.exportBlob()), canon(B.exportBlob()));
  // ...and the run carries on from either device
  playDaily(A, clock, 502, 503);
  assert.deepStrictEqual(A.streak(), { current: 503, longest: 503 });
  const reloaded = Mastery.create({ storage: memStorage(JSON.stringify(A.exportBlob())), now: clock.now });
  assert.deepStrictEqual(reloaded.streak(), { current: 503, longest: 503 });
});

check('long runs: a week played offline on a second device, overlapping the first device\'s run, merges to one run either way round', () => {
  const clock = clockAt(dayStart(1));
  const A = Mastery.create({ storage: memStorage(), now: clock.now });
  const B = Mastery.create({ storage: memStorage(), now: clock.now });
  playDaily(A, clock, 1, 500);
  playDaily(B, clock, 495, 507);
  const a = plain(A.exportBlob()), b = plain(B.exportBlob());
  const AB = Mastery.create({ storage: memStorage(JSON.stringify(a)), now: clock.now }); AB.mergeBlob(b);
  const BA = Mastery.create({ storage: memStorage(JSON.stringify(b)), now: clock.now }); BA.mergeBlob(a);
  assert.deepStrictEqual(AB.streak(), { current: 507, longest: 507 });
  assert.deepStrictEqual(BA.streak(), { current: 507, longest: 507 });
  assert.strictEqual(canon(AB.exportBlob()), canon(BA.exportBlob()));
  assert.strictEqual(AB.mergeBlob(a), false);
  assert.strictEqual(AB.mergeBlob(b), false);
  // A gap between the two runs keeps them apart
  const C = Mastery.create({ storage: memStorage(), now: clock.now });
  playDaily(C, clock, 509, 510);
  C.mergeBlob(a);
  assert.deepStrictEqual(C.streak(), { current: 2, longest: 500 });
});

check('long runs: a day row dated tomorrow (a device one time zone ahead) does not cut a 450-day run short', () => {
  const clock = clockAt(dayStart(1));
  const A = Mastery.create({ storage: memStorage(), now: clock.now });
  playDaily(A, clock, 1, 450);
  // The traveller lands where it is still day 449 and plays again
  clock.ms = dayStart(449) + 20 * HOUR;
  assert.strictEqual(A.streak().current, 450);
  A.recordSession({ questions: 5, firstTry: 5, seconds: 20 });
  assert.strictEqual(A.streak().current, 450, 'after a game on the earlier calendar day');
  playDaily(A, clock, 450, 452);
  assert.deepStrictEqual(A.streak(), { current: 452, longest: 452 });
});

check('two and three devices over three years: the streak never exceeds the truth, never drops in a merge, and is exact whenever the run fits the row window', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const rng = rngOf(seed * 733);
    const clock = clockAt(dayStart(int(rng, 0, 60)) + 9 * HOUR);
    const n = seed % 2 ? 2 : 3;
    const devs = [];
    for (let i = 0; i < n; i++) devs.push({ m: Mastery.create({ storage: memStorage(), now: clock.now }), active: new Set(), mood: 0.9 });
    const truthOf = (set, today) => {
      const days = Array.from(set).sort((a, b) => a - b);
      let longest = 0, run = 0, prev = null;
      days.forEach(d => { run = prev !== null && d === prev + 1 ? run + 1 : 1; prev = d; if (run > longest) longest = run; });
      return { current: prev !== null && prev >= today - 1 ? run : 0, longest: longest };
    };
    for (let day = refDay(clock.ms), end = day + 1100; day < end; day++) {
      clock.ms = dayStart(day) + int(rng, 0, 20 * HOUR);
      devs.forEach(d => {
        if (rng() < 0.01) d.mood = pick(rng, [0, 0.5, 0.98, 1]);     // a device falls out of use, or into daily use
        if (rng() < d.mood) {
          d.m.recordSession({ questions: 3, firstTry: 2, seconds: 30 });
          d.active.add(day);
        }
      });
      if (rng() < 0.08) {
        const a = pick(rng, devs), b = pick(rng, devs);
        if (a !== b) {
          const before = [a.m.streak(), b.m.streak()];
          a.m.mergeBlob(plain(b.m.exportBlob()));
          b.m.mergeBlob(plain(a.m.exportBlob()));
          b.active.forEach(x => a.active.add(x));
          a.active.forEach(x => b.active.add(x));
          const truth = truthOf(a.active, day);
          [a, b].forEach(d => {
            const got = d.m.streak();
            const tag = 'seed ' + seed + ' day ' + day + ': streak ' + JSON.stringify(got) + ', truth ' + JSON.stringify(truth) + ', before ' + JSON.stringify(before);
            assert.ok(got.current <= truth.current && got.longest <= truth.longest, tag);
            assert.ok(got.current >= Math.max(before[0].current, before[1].current), tag);
            assert.ok(got.longest >= Math.max(before[0].longest, before[1].longest), tag);
            if (truth.current <= 400) assert.strictEqual(got.current, truth.current, tag);
            else assert.ok(got.current >= 400, tag);
          });
          assert.deepStrictEqual(a.m.streak(), b.m.streak());
        }
      }
      devs.forEach(d => {
        const got = d.m.streak(), truth = truthOf(d.active, day);
        assert.ok(got.current <= truth.current && got.longest <= truth.longest, 'seed ' + seed + ' day ' + day + ' unsynced: ' + JSON.stringify(got) + ' vs ' + JSON.stringify(truth));
      });
    }
  }
});

check('lifetime totals: games played on a second device before it first syncs are added to a history older than the row window, not swallowed by it', () => {
  const clock = clockAt(dayStart(1));
  const phone = Mastery.create({ storage: memStorage(), now: clock.now });
  for (let d = 1; d <= 450; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    phone.recordSession({ questions: 10, firstTry: 9, seconds: 60 });
  }
  assert.deepStrictEqual(phone.totals(), { games: 450, questions: 4500, firstTry: 4050, seconds: 27000, daysActive: 450, itemsSeen: 0, itemsMastered: 0 });
  const laptop = Mastery.create({ storage: memStorage(), now: clock.now });
  clock.ms = dayStart(451) + 9 * HOUR;
  for (let g = 0; g < 5; g++) laptop.recordSession({ questions: 20, firstTry: 10, seconds: 100 });    // offline
  const want = { games: 455, questions: 4600, firstTry: 4100, seconds: 27500, daysActive: 451, itemsSeen: 0, itemsMastered: 0 };
  const phoneBlob = plain(phone.exportBlob()), laptopBlob = plain(laptop.exportBlob());
  laptop.mergeBlob(phoneBlob);
  assert.deepStrictEqual(laptop.totals(), want, 'laptop after pulling');
  phone.mergeBlob(laptopBlob);
  assert.deepStrictEqual(phone.totals(), want, 'phone after pulling');
  sameJson(phone.exportBlob(), laptop.exportBlob(), 'the two devices after syncing both ways');
  assert.strictEqual(phone.mergeBlob(plain(laptop.exportBlob())), false);
  // The same two devices alternating, a pull only now and then
  for (let d = 452; d <= 470; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    (d % 2 ? phone : laptop).recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    if (d % 5 === 0) { phone.mergeBlob(plain(laptop.exportBlob())); laptop.mergeBlob(plain(phone.exportBlob())); }
  }
  assert.strictEqual(phone.totals().games, 455 + 19);
  assert.strictEqual(phone.totals().daysActive, 470);
  assert.deepStrictEqual(laptop.totals(), phone.totals());
  assert.deepStrictEqual(phone.streak(), { current: 470, longest: 470 });
});

check('lifetime totals: a blob that has sat on the server for 200 days merges the same from either end, and a blob from a device a day ahead adds nothing', () => {
  const clock = clockAt(dayStart(1));
  const a = Mastery.create({ storage: memStorage(), now: clock.now });
  const b = Mastery.create({ storage: memStorage(), now: clock.now });
  for (let d = 1; d <= 300; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    if (d % 3) b.recordSession({ questions: 7, firstTry: 3, seconds: 50 });
  }
  const stale = plain(b.exportBlob());                                  // B is never opened again
  for (let d = 280; d <= 500; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    a.recordSession({ questions: 4, firstTry: 4, seconds: 20 });
    if (d % 2) a.recordSession({ questions: 4, firstTry: 4, seconds: 20 });
  }
  const aBlob = plain(a.exportBlob());
  const viaA = Mastery.create({ storage: memStorage(JSON.stringify(aBlob)), now: clock.now }); viaA.mergeBlob(plain(stale));
  const viaB = Mastery.create({ storage: memStorage(JSON.stringify(stale)), now: clock.now }); viaB.mergeBlob(plain(aBlob));
  sameJson(viaA.exportBlob(), viaB.exportBlob(), 'A + stale B vs stale B + A');
  // Day by day, the larger of what each device logged: B one game on days 1-300 not divisible by 3, A one or two on 280-500
  let games = 0, daysActive = 0;
  for (let d = 1; d <= 500; d++) {
    const day = Math.max(d <= 300 && d % 3 ? 1 : 0, d >= 280 ? (d % 2 ? 2 : 1) : 0);
    games += day;
    if (day) daysActive++;
  }
  assert.strictEqual(viaA.totals().games, games);
  assert.strictEqual(viaA.totals().daysActive, daysActive);
  assert.strictEqual(viaA.totals().questions, games === 0 ? 0 : viaB.totals().questions);

  // A device whose calendar is already on tomorrow has pruned one more day row than we have
  const long = Mastery.create({ storage: memStorage(), now: clock.now });
  for (let d = 1; d <= 900; d++) {
    clock.ms = dayStart(d) + 9 * HOUR;
    long.recordSession({ questions: 3, firstTry: 2, seconds: 30 });
  }
  const today = plain(long.exportBlob());
  [1, 2].forEach(ahead => {
    clock.ms = dayStart(900 + ahead) + HOUR;
    const fromAhead = plain(Mastery.create({ storage: memStorage(JSON.stringify(today)), now: clock.now }).exportBlob());
    assert.strictEqual(Object.keys(fromAhead.days).length, 401 - ahead);
    clock.ms = dayStart(900) + 20 * HOUR;
    const here = Mastery.create({ storage: memStorage(JSON.stringify(today)), now: clock.now });
    const before = here.totals();
    here.mergeBlob(fromAhead);
    assert.deepStrictEqual(here.totals(), before, 'a blob pruned ' + ahead + ' day(s) ahead of us changed the totals');
    assert.deepStrictEqual(here.streak(), { current: 900, longest: 900 });
  });
});

check('lifetime totals across two devices over three years equal everything ever played (SPEC\'s day-by-day merge of the whole history), syncing at least every 300 days', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const rng = rngOf(seed * 977);
    const clock = clockAt(dayStart(int(rng, 0, 60)) + 9 * HOUR);
    const devs = [0, 1].map(i => ({ id: i, m: Mastery.create({ storage: memStorage(), now: clock.now }), ref: new Ref(), pulled: refDay(clock.ms), mood: 0.8 }));
    const pull = (to, from) => {
      to.m.mergeBlob(plain(from.m.exportBlob()));
      to.ref.merge(from.ref, mine => mine);
      to.pulled = refDay(clock.ms);
    };
    for (let day = refDay(clock.ms), end = day + 1100; day < end; day++) {
      clock.ms = dayStart(day) + int(rng, 0, 20 * HOUR);
      devs.forEach(d => {
        if (rng() < 0.01) d.mood = pick(rng, [0, 0.3, 0.9, 1]);
        const games = rng() < d.mood ? int(rng, 1, 3) : 0;
        for (let g = 0; g < games; g++) {
          const q = int(rng, 1, 30);
          const s = { questions: q, firstTry: int(rng, 0, q), seconds: int(rng, 10, 600) };
          d.m.recordSession(s);
          d.ref.session(s, day);
        }
        const other = devs[1 - d.id];
        if (rng() < 0.03 || day - d.pulled >= 300) pull(d, other);
        const got = d.m.totals(), want = d.ref.totals();
        if (canon(got) !== canon(want)) assert.fail('seed ' + seed + ' day ' + day + ' device ' + d.id + ': totals ' + JSON.stringify(got) + ', everything ever played ' + JSON.stringify(want));
        assert.deepStrictEqual(d.m.streak(), d.ref.streak(day), 'seed ' + seed + ' day ' + day);
      });
    }
  }
});

/* ===== 4. Corrupt and partial stores ===== */

check('800 damaged stores loaded from storage: nothing throws, every value handed back is well-formed, and the cleaned store is stable', () => {
  const proto = protoSnapshot();
  const rng = rngOf(8675309);
  for (let trial = 0; trial < 800; trial++) {
    const clock = clockAt(dayStart(int(rng, 100, 900)) + 10 * HOUR);
    const today = refDay(clock.ms);
    const good = trial % 5 === 0 ? new Ref('always') : null;
    let blob;
    if (good) {
      // SPEC-layout stores get damaged too
      for (let i = 0; i < 30; i++) good.record(pick(rng, SKILLS), pick(rng, NAMES), pick(rng, ['first', 'second', 'miss']), today - int(rng, 0, 50));
      for (let i = 0; i < 10; i++) good.session({ questions: 5, firstTry: 3, seconds: 9 }, today - int(rng, 0, 50));
      blob = good.specBlob();
    } else {
      blob = randomBlob(rng, clock, pick(rng, [10, 60, 450]));
    }
    const damaged = mutate(blob, rng, pick(rng, [0.01, 0.05, 0.15, 0.4]));
    let text = JSON.stringify(damaged);
    const cut = trial % 11 === 0;
    if (cut) text = text.slice(0, int(rng, 0, text.length - 1));                   // a write cut short
    const tag = 'trial ' + trial;
    const storage = memStorage(text);
    let m;
    assert.doesNotThrow(() => { m = Mastery.create({ storage: storage, now: clock.now }); }, tag);
    assertSane(m, today, tag + ' (loaded)');

    // Cleaning is a fixed point: what it exports loads back as itself
    const cleaned = m.exportBlob();
    const again = Mastery.create({ storage: memStorage(JSON.stringify(cleaned)), now: clock.now });
    sameJson(again.exportBlob(), cleaned, tag + ': the cleaned store changed when loaded again');
    assert.strictEqual(m.mergeBlob(plain(cleaned)), false, tag + ': merging its own export changed it');
    if (cut) assert.strictEqual(canon(cleaned), '{"days":{},"items":{},"v":2}', tag + ': half a write loaded as something');
    else assert.strictEqual(m.mergeBlob(plain(damaged)), false, tag + ': merging the blob it was loaded from changed it');

    // Life goes on: writes work, and a reload agrees with memory
    const it = m.record('world-country', 'Chad', 'first');
    assert.ok(it.seen >= 1 && it.last === today, tag);
    m.recordSession({ questions: 2, firstTry: 1, seconds: 3 });
    assert.ok(m.activity(1)[0].games >= 1);
    assert.ok(m.streak().current >= 1, tag);
    assertSane(m, today, tag + ' (after writes)');
    const stored = Mastery.create({ storage: storage, now: clock.now });
    sameJson(stored.exportBlob(), reread(m, clock), tag + ': storage and memory disagree after a save');
  }
  assert.strictEqual(protoSnapshot(), proto, 'a prototype was modified');
});

check('mergeBlob fed 600 damaged blobs and things that are not JSON at all: never throws, never corrupts, argument untouched', () => {
  const proto = protoSnapshot();
  const rng = rngOf(1234567);
  const cyclic = { v: 2, items: {}, days: {} };
  cyclic.items.self = cyclic;
  const trap = { v: 2, days: {} };
  Object.defineProperty(trap, 'items', { enumerable: true, get() { throw new Error('getter trap'); } });
  const sparse = [];
  sparse[4000000000] = 1;
  const hasSparse = v => v === sparse || (!!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some(k => hasSparse(v[k])));
  const oddities = [undefined, null, 0, 1, NaN, Infinity, -0, '', 'null', '{"v":2}', true, [], [1, 2], () => 1, Symbol('x'), new Date(), new Map(), /x/,
    Object.create(null), cyclic, trap, { v: 2, items: sparse, days: sparse }, { v: 2, items: { s: { n: sparse } }, days: { 5: sparse } },
    { v: 2, items: { s: { n: [NaN, 1, 1] } } }, { v: 2, items: { s: { n: [5, Infinity, Infinity, Infinity, -Infinity, Infinity, Infinity] } } },
    { v: 2, items: { s: { n: [5, 1, typeof BigInt === 'function' ? BigInt(3) : 3] } } }, { v: 2, items: { s: { n: [5, 1, Symbol('n')] } } },
    { v: 2, items: { s: { n: [5, 1, { valueOf() { throw new Error('valueOf trap'); } }] } } },
    { v: 2, items: { s: { n: [-0, 1, 1] } }, days: { '-0': [1, 1, 1, 1] } },
    { v: 2, items: null, days: null, life: null }, { v: 2, items: [], days: [], life: {} }, { v: 2, life: [1, 2] }, { v: 2, life: ['a', {}, [], null, -5, 1e400, 'x', 'y'] },
    { v: '2', items: { s: { n: [5, 1, 1] } } }, { v: 3, items: { s: { n: [5, 1, 1] } } }, { v: null, items: { s: { n: [5, 1, 1] } } },
    { __proto__: { v: 2, items: { s: { inherited: [5, 1, 1] } } } },
    JSON.parse('{"v":2,"items":{"__proto__":{"__proto__":[5,1,1],"polluted":[5,1,1]},"constructor":{"prototype":[5,1,1]}},"days":{"__proto__":[1,1,1,1]},"__proto__":{"polluted":"yes"}}')];
  for (let trial = 0; trial < 600; trial++) {
    const clock = clockAt(dayStart(int(rng, 100, 900)) + 10 * HOUR);
    const today = refDay(clock.ms);
    const tag = 'trial ' + trial;
    const storage = memStorage();
    const m = Mastery.create({ storage: storage, now: clock.now });
    m.mergeBlob(randomBlob(rng, clock, 30));
    m.record('flag', 'Chad', 'first');
    const mine = m.get('flag', 'Chad');
    const remote = trial < oddities.length ? oddities[trial] : mutate(randomBlob(rng, clock, pick(rng, [10, 60, 450])), rng, pick(rng, [0.02, 0.1, 0.3, 0.6]));
    let sent = null;
    // (the huge sparse arrays are there to catch a loop over .length; writing them out would take minutes)
    try { if (!hasSparse(remote)) sent = canon(remote); } catch (e) { /* not JSON at all */ }
    let changed;
    assert.doesNotThrow(() => { changed = m.mergeBlob(remote); }, tag);
    assert.strictEqual(typeof changed, 'boolean', tag);
    if (sent !== null) assert.strictEqual(canon(remote), sent, tag + ': the argument was modified');
    assert.ok(m.get('flag', 'Chad').seen >= mine.seen, tag);
    assertSane(m, today, tag);
    assert.doesNotThrow(() => { m.mergeBlob(remote); }, tag);
    assert.strictEqual(m.mergeBlob(remote), false, tag + ': the third merge of the same thing still reports a change');
    const stored = Mastery.create({ storage: storage, now: clock.now });
    sameJson(stored.exportBlob(), reread(m, clock), tag + ': storage and memory disagree');
  }
  assert.strictEqual(protoSnapshot(), proto, 'a prototype was modified');
  assert.strictEqual({}.polluted, undefined);
});

check('targeted damage: each kind of bad entry is dropped or cleaned, and its good neighbours are kept', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const text = JSON.stringify({
    v: 2,
    items: {
      ok: { good: [318, 2, 3, 1, 1], alsoGood: [300, 5, 9, 9] },
      bad: {
        notArray: { 0: 318, 1: 2, 2: 3 }, string: '318,2,3', empty: [], onlyDay: [318], noAnswers: [318, 3, 0, 0, 0, 0],
        nullDay: [null, 2, 3], stringDay: ['318', 2, 3], negativeCounts: [318, 2, -3, -1, -2, -9], nested: [[318], [2], [3]]
      },
      fixed: {
        boxTooHigh: [318, 99, 2], boxZero: [318, 0, 2], boxNegative: [318, -4, 2], fractions: [318.9, 2.7, 3.2, 1.9], negativeDay: [-40, 1, 1],
        farFuture: [5e7, 1, 1], stringCounts: [318, '2', '3'], truncatedWide: [4, 3, 1, 0, 0, 2, 320], overlong: [318, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0]
      },
      notAMap: [1, 2, 3], alsoNot: 'x', empty: {}
    },
    days: { 318: [1, 10, 8, 60], 317: [0, 0, 0, 0], 316: 'x', 315: [1], 314: [-1, -1, -1, -1], '007': [9, 9, 9, 9], '-0': [9, 9, 9, 9], '1e2': [9, 9, 9, 9], ' 5': [9, 9, 9, 9], abc: [9, 9, 9, 9], 313.5: [9, 9, 9, 9], 12345678: [9, 9, 9, 9], 312: [2.9, '4', null, {}] },
    life: 'nonsense'
  });
  const m = Mastery.create({ storage: memStorage(text), now: clock.now });
  assert.deepStrictEqual(m.skills().sort(), ['fixed', 'ok']);
  assert.deepStrictEqual(Object.keys(m.levels('bad')), []);
  const g = m.get('ok', 'good');
  assert.deepStrictEqual([g.seen, g.first, g.second, g.missed, g.streak, g.box, g.last, g.due], [4, 3, 1, 0, 1, 2, 318, 321]);
  assert.strictEqual(m.get('fixed', 'boxTooHigh').box, 5);
  assert.strictEqual(m.get('fixed', 'boxZero').box, 1);
  assert.strictEqual(m.get('fixed', 'boxNegative').box, 1);
  assert.deepStrictEqual([m.get('fixed', 'fractions').last, m.get('fixed', 'fractions').box, m.get('fixed', 'fractions').first], [318, 2, 3]);
  assert.strictEqual(m.get('fixed', 'negativeDay').last, -40);
  assert.strictEqual(m.get('fixed', 'negativeDay').isDue, true);
  assert.ok(m.get('fixed', 'farFuture').last <= 1e6);
  assert.strictEqual(m.get('fixed', 'overlong').seen, 3);
  // Day rows: only whole-number keys in plain decimal form are days
  const act = m.activity(8);
  assert.deepStrictEqual(act.map(r => r.games), [2, 0, 0, 1, 0, 0, 1, 0]);      // 312, 315, 318
  assert.deepStrictEqual([act[0].questions, act[0].firstTry, act[0].seconds], [4, 0, 0]);
  assert.deepStrictEqual(Object.keys(m.exportBlob().days).sort(), ['312', '315', '318']);
  assert.strictEqual(m.totals().games, 4);
  assertSane(m, 319, 'targeted');
});

check('a damaged blob is cleaned the same way every time it is read (absurd due days, both layouts)', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  [
    { v: 1, items: { s: { n: [3, 1, 1, 1, 0, 2, 1e6, -1e6] } } },
    { v: 1, items: { s: { n: [3, 1, 1, 1, 0, 2, 1e300, 5] } } },
    { v: 1, items: { s: { n: [3, 1, 1, 1, 0, 2, -50, 5] } } },
    { v: 2, items: { s: { n: [5, 2, 1, 0, 1, 1, 1e12] } } },
    { v: 2, items: { s: { n: [-1e6, 2, 1, 0, 1, 1, 2e6] } } },
    { v: 2, items: { s: { n: [1e6, 5, 1] } } }
  ].forEach((blob, i) => {
    const a = Mastery.create({ storage: memStorage(JSON.stringify(blob)), now: clock.now });
    const once = a.exportBlob();
    const b = Mastery.create({ storage: memStorage(JSON.stringify(once)), now: clock.now });
    assert.strictEqual(canon(b.exportBlob()), canon(once), 'case ' + i + ': ' + JSON.stringify(once) + ' reloads as ' + JSON.stringify(b.exportBlob()));
    assert.strictEqual(a.mergeBlob(plain(once)), false, 'case ' + i);
    const v = a.get('s', 'n');
    assert.ok(Number.isInteger(v.due) && v.due >= v.last && Math.abs(v.due) <= 2e6 + 1, 'case ' + i + ' due ' + v.due);
  });
});

check('storage text that is not a store at all loads empty and is replaced by the next save', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  ['', ' ', 'null', 'undefined', 'true', '0', '-1', '"text"', '[]', '[1,2,3]', '{', '{"v":2,"items":{"s":{"n":[318,1,1', '{"v":2,"items":', 'NaN', '{}', '{"v":2}',
    '{"v":99,"items":{"s":{"n":[318,1,1]}}}', '\u0000\u0001', '<html>', '{"items":"x","days":7}', '{"v":2,"items":{"s":{"n":[318,1,1]}}}trailing'].forEach(text => {
    const storage = memStorage(text);
    let m;
    assert.doesNotThrow(() => { m = Mastery.create({ storage: storage, now: clock.now }); }, text);
    assert.deepStrictEqual(m.skills(), [], text);
    assert.deepStrictEqual(m.totals(), { games: 0, questions: 0, firstTry: 0, seconds: 0, daysActive: 0, itemsSeen: 0, itemsMastered: 0 }, text);
    assert.deepStrictEqual(m.streak(), { current: 0, longest: 0 });
    assert.strictEqual(m.record('s', 'n', 'first').seen, 1, text);
    assert.deepStrictEqual(Object.keys(JSON.parse(storage.raw()).items.s), ['n'], text);
  });
});

/* ===== 5. Storage and clocks that misbehave ===== */

check('storage that throws on setItem, always: nothing throws, the whole session is kept in memory and matches the model', () => {
  const rng = rngOf(99);
  const storage = memStorage();
  storage.failSet = true;
  const clock = clockAt(dayStart(400) + HOUR);
  const m = Mastery.create({ storage: storage, now: clock.now });
  const ref = new Ref();
  for (let step = 0; step < 400; step++) {
    const today = refDay(clock.ms);
    const r = rng();
    if (r < 0.6) {
      const skill = pick(rng, SKILLS), name = pick(rng, NAMES), outcome = pick(rng, ['first', 'first', 'second', 'miss']);
      ref.record(skill, name, outcome, today);
      assert.deepStrictEqual(m.record(skill, name, outcome), ref.view(skill, name, today));
    } else if (r < 0.75) {
      const s = { questions: 4, firstTry: 2, seconds: 20 };
      ref.session(s, today);
      m.recordSession(s);
    } else if (r < 0.8) {
      assert.doesNotThrow(() => { m.flush(); m.prune(); m.exportBlob(); m.reload(); });
    } else {
      advance(rng, clock);
    }
  }
  compareViews(m, ref, refDay(clock.ms), rng, SKILLS, NAMES, 'no setItem');
  assert.strictEqual(storage.raw(), null);
  assert.ok(storage.refused > 200);
  // The moment storage takes writes again, flush() lands everything
  storage.failSet = false;
  m.flush();
  compareViews(Mastery.create({ storage: storage, now: clock.now }), ref, refDay(clock.ms), rng, SKILLS, NAMES, 'after storage recovers');
});

check('storage that refuses writes at random (40% of them), with reloads in between: memory never loses an answer; storage catches up on the next good write', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const rng = rngOf(seed * 3571);
    const storage = memStorage();
    const flaky = rngOf(seed);
    storage.failSet = () => flaky() < 0.4;
    const clock = clockAt(dayStart(350) + HOUR);
    const m = Mastery.create({ storage: storage, now: clock.now });
    const ref = new Ref();
    for (let step = 0; step < 300; step++) {
      const today = refDay(clock.ms);
      const r = rng();
      if (r < 0.6) {
        const skill = pick(rng, SKILLS), name = pick(rng, NAMES), outcome = pick(rng, ['first', 'first', 'second', 'miss']);
        ref.record(skill, name, outcome, today);
        assert.deepStrictEqual(m.record(skill, name, outcome), ref.view(skill, name, today), 'seed ' + seed + ' step ' + step);
      } else if (r < 0.75) {
        const s = { questions: 4, firstTry: 2, seconds: 20 };
        ref.session(s, today);
        m.recordSession(s);
      } else if (r < 0.85) {
        m.flush();
      } else {
        advance(rng, clock);
      }
      // Whatever is in storage is always a whole, loadable store, never ahead of memory
      if (storage.raw() !== null) {
        const onDisk = Mastery.create({ storage: memStorage(storage.raw()), now: clock.now });
        assert.ok(onDisk.totals().games <= m.totals().games && onDisk.totals().itemsSeen <= m.totals().itemsSeen);
      }
    }
    compareViews(m, ref, refDay(clock.ms), rng, SKILLS, NAMES, 'flaky seed ' + seed);
    storage.failSet = false;
    m.flush();
    m.record('flag', 'Chad', 'first');
    ref.record('flag', 'Chad', 'first', refDay(clock.ms));
    compareViews(Mastery.create({ storage: storage, now: clock.now }), ref, refDay(clock.ms), rng, SKILLS, NAMES, 'flaky seed ' + seed + ' reloaded');
  }
});

check('storage that throws on getItem, on everything, has no methods, or hands back non-strings: the instance works in memory', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const getThrows = memStorage({ v: 2, items: { s: { old: [300, 2, 2, 2] } }, days: {} });
  getThrows.failGet = true;
  const allThrow = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const lazyThrow = { get getItem() { throw new Error('no'); }, get setItem() { throw new Error('no'); }, get removeItem() { throw new Error('no'); } };
  const odd = v => ({ getItem() { return v; }, setItem() {}, removeItem() {} });
  [getThrows, allThrow, lazyThrow, {}, { getItem: 5, setItem: 'x' }, odd(undefined), odd(42), odd({}), odd([1]), odd(true), 0, '', false].forEach((storage, i) => {
    let m;
    assert.doesNotThrow(() => { m = Mastery.create({ storage: storage, now: clock.now }); }, 'case ' + i);
    assert.doesNotThrow(() => {
      m.record('s', 'n', 'first');
      m.record('s', 'n', 'miss');
      m.recordSession({ questions: 2, firstTry: 1, seconds: 5 });
      m.flush(); m.prune(); m.reload(); m.mergeBlob({ v: 2, items: { s: { other: [318, 1, 1] } } }); m.exportBlob(); m.byteSize();
    }, 'case ' + i);
    assert.strictEqual(m.get('s', 'n').seen, 2, 'case ' + i);
    assert.strictEqual(m.get('s', 'other').seen, 1, 'case ' + i);
    assert.deepStrictEqual(m.streak(), { current: 1, longest: 1 }, 'case ' + i);
    assert.doesNotThrow(() => m.reset(), 'case ' + i);
    assert.strictEqual(m.get('s', 'n').seen, 0, 'case ' + i);
    assert.strictEqual(m.totals().games, 0, 'case ' + i);
    assert.strictEqual(m.record('s', 'n', 'first').seen, 1, 'case ' + i + ': usable after reset');
  });
});

check('reset() when storage will not let the key go: memory stays cleared, the old data does not creep back in', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const storage = memStorage();
  const m = Mastery.create({ storage: storage, now: clock.now });
  m.record('s', 'old', 'first');
  m.recordSession({ questions: 2, firstTry: 1, seconds: 5 });
  storage.failRemove = true;
  storage.failSet = true;
  assert.doesNotThrow(() => m.reset());
  assert.strictEqual(m.get('s', 'old').seen, 0);
  assert.strictEqual(m.record('s', 'new', 'first').seen, 1);
  assert.strictEqual(m.get('s', 'old').seen, 0, 'the wiped item came back on the next write');
  assert.strictEqual(m.totals().games, 0, 'the wiped games came back on the next write');
  assert.deepStrictEqual(m.skills(), ['s']);
  assert.strictEqual(m.summary('s').total, 1);
  // Once storage works again the cleared store (plus what came after) is what gets saved
  storage.failRemove = false;
  storage.failSet = false;
  m.flush();
  const again = Mastery.create({ storage: storage, now: clock.now });
  assert.strictEqual(again.get('s', 'old').seen, 0);
  assert.strictEqual(again.get('s', 'new').seen, 1);
  assert.strictEqual(again.totals().games, 0);
});

check('reset(): a healthy storage is emptied, a second page sees it, and the instance starts over cleanly', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const storage = memStorage();
  const m = Mastery.create({ storage: storage, now: clock.now });
  const other = Mastery.create({ storage: storage, now: clock.now });
  m.record('s', 'n', 'first');
  m.recordSession({ questions: 2, firstTry: 1, seconds: 5 });
  other.reload();
  assert.strictEqual(other.get('s', 'n').seen, 1);
  m.reset();
  assert.strictEqual(storage.raw(), null);
  assert.deepStrictEqual([m.skills(), m.totals().games, m.streak(), m.activity(1)[0].games], [[], 0, { current: 0, longest: 0 }, 0]);
  other.reload();
  assert.strictEqual(other.get('s', 'n').seen, 0);
  assert.deepStrictEqual(other.streak(), { current: 0, longest: 0 });
  m.record('s', 'n', 'miss');
  assert.deepStrictEqual(plain(JSON.parse(storage.raw()).items), { s: { n: [319, 1, 0, 0, 0, 1, 1] } });
});

check('clocks that misbehave: NaN, Infinity, out of Date\'s range, a string, a Date, throwing; and one that runs backwards', () => {
  const real = Mastery.dayNumber(Date.now());
  [() => NaN, () => Infinity, () => -Infinity, () => 1e20, () => -1e20, () => 8.64e15 + 1, () => 'soon', () => undefined, () => null, () => ({}), () => { throw new Error('no clock'); }].forEach((now, i) => {
    const storage = memStorage();
    const m = Mastery.create({ storage: storage, now: now });
    const day = m.today();
    assert.ok(Number.isInteger(day), 'case ' + i + ': today() = ' + day);
    if (i !== 8) assert.ok(Math.abs(day - real) <= 1, 'case ' + i + ': today() = ' + day);
    const it = m.record('s', 'n', 'first');
    assert.ok(Number.isInteger(it.last) && Number.isInteger(it.due), 'case ' + i + ': ' + JSON.stringify(it));
    m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.strictEqual(m.streak().current, 1, 'case ' + i);
    const again = Mastery.create({ storage: storage, now: now });
    assert.strictEqual(again.get('s', 'n').seen, 1, 'case ' + i + ': the answer did not survive a reload');
    assert.strictEqual(again.totals().games, 1, 'case ' + i);
  });
  assert.strictEqual(Mastery.create({ storage: null, now: () => new Date(at(2026, 11, 16, 12)) }).today(), 319);
  assert.strictEqual(Mastery.create({ storage: null, now: () => String(at(2026, 11, 16, 12)) }).today(), 319);

  // Backwards: nothing throws, nothing is lost, and the views stay well-formed
  const rng = rngOf(5);
  const clock = clockAt(dayStart(500));
  const storage = memStorage();
  const m = Mastery.create({ storage: storage, now: clock.now });
  let answers = 0, games = 0;
  for (let step = 0; step < 500; step++) {
    clock.ms = dayStart(int(rng, 80, 920)) + int(rng, 0, 20 * HOUR);
    if (rng() < 0.7) { m.record(pick(rng, SKILLS), pick(rng, NAMES), pick(rng, ['first', 'second', 'miss'])); answers++; }
    else { m.recordSession({ questions: 1, firstTry: 1, seconds: 1 }); games++; }
    if (step % 50 === 0) assertSane(m, refDay(clock.ms), 'backwards step ' + step);
  }
  let seen = 0;
  SKILLS.forEach(s => NAMES.forEach(n => { seen += m.get(s, n).seen; }));
  assert.strictEqual(seen, answers);
  assert.strictEqual(m.totals().games, games);
});

check('arguments that make no sense never throw and never change the store', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const m = Mastery.create({ storage: memStorage(), now: clock.now });
  m.record('s', 'a', 'miss');
  m.record('s', 'b', 'first');
  m.recordSession({ questions: 2, firstTry: 1, seconds: 5 });
  const before = canon(m.exportBlob());
  const odd = [undefined, null, NaN, Infinity, -Infinity, -1, 0, 1.5, 2.5, '3', 'x', true, {}, [], [1], () => 1, 1e400];
  odd.forEach(x => {
    assert.doesNotThrow(() => {
      m.get(x, x); m.get('s', x); m.summary(x, x); m.summary('s', x); m.summary('s', [x, 'a', x]); m.levels(x, x); m.levels('s', [x]);
      m.due(x, x, x); m.due('s', ['a', 'b'], { limit: x }); m.due('s', x, { limit: x }); m.due('s', ['a'], x);
      m.weakest(x, x, x, x); m.weakest('s', ['a', 'b'], x, { minSeen: x, includePerfect: x }); m.weakest('s', ['a'], 1, x);
      m.activity(x); m.record(x, x, x); m.record('s', 'a', x);
      if (typeof x !== 'string') { m.record(x, 'a', 'first'); m.record('s', x, 'first'); }
    }, String(x));
    assert.ok(Array.isArray(m.due('s', ['a', 'b'], { limit: x })), 'due limit ' + String(x));
    assert.ok(Array.isArray(m.weakest('s', ['a', 'b'], x)), 'weakest n ' + String(x));
    assert.ok(Array.isArray(m.activity(x)) && m.activity(x).length <= 4000, 'activity ' + String(x));
  });
  assert.strictEqual(canon(m.exportBlob()), before);
  assert.deepStrictEqual(m.due('s', ['a', 'b'], { limit: 0 }), []);
  assert.deepStrictEqual(m.due('s', ['a', 'b'], { limit: -3 }), []);
  assert.deepStrictEqual(m.due('s', ['a', 'b'], { limit: 1.9 }), ['a']);
  assert.deepStrictEqual(m.due('s', ['a', 'b'], {}), ['a']);
  assert.strictEqual(m.activity(0).length, 0);
  assert.strictEqual(m.activity(-5).length, 0);
  assert.strictEqual(m.activity(2.9).length, 2);
});

check('recordSession with garbage numbers: still one game, and no number is poisoned (totals only ever grow through merges)', () => {
  const clock = clockAt(dayStart(319) + HOUR);
  const m = Mastery.create({ storage: memStorage(), now: clock.now });
  [undefined, null, 5, 'x', [], {}, { questions: NaN, firstTry: NaN, seconds: NaN }, { questions: -5, firstTry: -5, seconds: -5 },
    { questions: 'abc', firstTry: {}, seconds: [] }, { questions: Infinity, firstTry: Infinity, seconds: Infinity },
    { questions: -Infinity, firstTry: 1e400, seconds: -1e400 }, { questions: null, firstTry: true, seconds: undefined }].forEach((s, i) => {
    let row;
    assert.doesNotThrow(() => { row = m.recordSession(s); }, 'case ' + i);
    assert.strictEqual(row.games, i + 1, 'case ' + i);
    assert.deepStrictEqual([row.questions, row.firstTry, row.seconds], [0, 0, 0], 'case ' + i + ' ' + JSON.stringify(row));
  });
  const row = m.recordSession({ questions: 10.7, firstTry: 99, seconds: 59.6 });
  assert.deepStrictEqual([row.questions, row.firstTry, row.seconds], [10, 10, 60]);
  assert.deepStrictEqual(m.totals(), { games: 13, questions: 10, firstTry: 10, seconds: 60, daysActive: 1, itemsSeen: 0, itemsMastered: 0 });
});

/* ===== 6. Size ===== */

// 1,100 made-up place names over twelve skills, about as long as real ones (a few with accents)
function placeNames(rng) {
  const sizes = { 'world-country': 197, flag: 197, capital: 197, name: 197, 'us-state': 50, 'us-capital': 50, 'us-city': 40, 'pin-city': 120, 'province:canada': 13, 'province:china': 33, 'province:india': 6 };
  const syll = ['ba', 'ka', 'ri', 'sto', 'nia', 'land', 'ia', 'mar', 'ton', 'ville', 'gu', 'ay', 'an', 'os', 'el', 'sa', 'ta', 'ne', 'go', 'li', 'ber', 'zam', 'ô', 'é', 'ã', 'u', 'qi', 'shan', 'pur', 'stan'];
  const sets = {};
  Object.keys(sizes).forEach(skill => {
    const had = new Set();
    while (had.size < sizes[skill]) {
      let n = '';
      const parts = int(rng, 2, 5);
      for (let i = 0; i < parts; i++) n += pick(rng, syll);
      if (rng() < 0.22) n += ' ' + pick(rng, syll) + pick(rng, syll) + pick(rng, syll);
      had.add(n[0].toUpperCase() + n.slice(1));
    }
    sets[skill] = Array.from(had);
  });
  return sets;
}

// A learner over `days` days: a few games most days, each a slice of one skill, getting better as boxes rise
function learner(sets, rng, days, playShare, gamesPerDay) {
  const clock = clockAt(dayStart(200));
  const m = Mastery.create({ storage: memStorage(), now: clock.now });
  const skills = Object.keys(sets);
  // Everything is met at least once, early on
  skills.forEach(skill => sets[skill].forEach(name => m.record(skill, name, rng() < 0.6 ? 'first' : rng() < 0.5 ? 'second' : 'miss')));
  for (let d = 1; d <= days; d++) {
    clock.ms = dayStart(200 + d) + int(rng, 0, 20 * HOUR);
    if (rng() > playShare) continue;
    const games = int(rng, 1, gamesPerDay);
    for (let g = 0; g < games; g++) {
      const skill = pick(rng, skills);
      const round = shuffle(rng, sets[skill]).slice(0, int(rng, 10, 50));
      let firstTry = 0;
      round.forEach(name => {
        const box = m.get(skill, name).box;
        const r = rng();
        const outcome = r < 0.55 + box * 0.08 ? 'first' : r < 0.85 + box * 0.02 ? 'second' : 'miss';
        if (outcome === 'first') firstTry++;
        m.record(skill, name, outcome);
      });
      m.recordSession({ questions: round.length, firstTry: firstTry, seconds: int(rng, 40, 1200) });
    }
  }
  return m;
}

check('size: a 1,100-item store (printed below), against SPEC\'s "well under 40 KB" and the 64 KB sync limit', () => {
  const sets = placeNames(rngOf(2026));
  let items = 0, chars = 0;
  Object.keys(sets).forEach(k => sets[k].forEach(n => { items++; chars += n.length; }));
  assert.strictEqual(items, 1100);
  const line = (label, m) => {
    const text = JSON.stringify(m.exportBlob());
    const blob = JSON.parse(text);
    const bytes = Buffer.byteLength(text, 'utf8');
    const itemChars = JSON.stringify(blob.items).length, dayChars = JSON.stringify(blob.days).length;
    const t = m.totals();
    console.log('      ' + label + ': ' + text.length + ' chars (' + (text.length / 1024).toFixed(1) + ' KB), ' + bytes + ' UTF-8 bytes; items ' + itemChars +
      ', ' + Object.keys(blob.days).length + ' day rows ' + dayChars + '; ' + t.itemsSeen + ' items, ' + t.questions + ' answers, ' + t.games + ' games');
    assert.strictEqual(m.byteSize(), text.length);
    assert.strictEqual(t.itemsSeen, 1100);
    return text.length;
  };
  console.log('      names average ' + (chars / items).toFixed(1) + ' characters');
  const fresh = line('every item answered once', learner(sets, rngOf(1), 0, 0, 1));
  const casual = line('a year, playing 1 day in 3', learner(sets, rngOf(2), 365, 0.33, 2));
  const keen = line('a year, playing 9 days in 10', learner(sets, rngOf(3), 365, 0.9, 4));
  const obsessive = line('500 days without a miss, up to 8 games a day', learner(sets, rngOf(4), 500, 1, 8));
  assert.ok(fresh < 30 * 1024, 'fresh ' + fresh);
  assert.ok(casual < 36 * 1024, 'casual ' + casual);
  assert.ok(keen < 40 * 1024, 'keen ' + keen);
  assert.ok(obsessive < 44 * 1024, 'obsessive ' + obsessive);

  // The ceiling: every field of every item at two or three digits, four-digit days (after September 2028), 401 full day rows
  const worst = { v: 2, items: {}, days: {}, life: [99999, 9999999, 9999999, 99999999, 9999, 9999, 1500, 9999] };
  Object.keys(sets).forEach(skill => {
    worst.items[skill] = {};
    sets[skill].forEach(name => { worst.items[skill][name] = [1499, 2, 120, 0, 45, 38, 2]; });
  });
  for (let d = 1100; d <= 1500; d++) worst.days[d] = [12, 1800, 1500, 14000];
  const clock = clockAt(dayStart(1500) + HOUR);
  const w = Mastery.create({ storage: memStorage(JSON.stringify(worst)), now: clock.now });
  assert.strictEqual(w.totals().itemsSeen, 1100);
  const ceiling = line('ceiling (no trailing zeros to drop anywhere, 401 busy days)', w);
  assert.ok(ceiling < 64 * 1024 - 12 * 1024, 'the ceiling leaves less than 12 KB of the sync payload for everything else: ' + ceiling);
});

console.log('\n[' + ZONE + '] ' + tally.passed + ' passed, ' + tally.failed + ' failed');
process.exitCode = tally.failed ? 1 : 0;
