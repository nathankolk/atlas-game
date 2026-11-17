'use strict';

// Tests for the mastery module (the MASTERY section of public/index.html).
// Run: node tools/tests/mastery.test.js
// No framework: assert, a fake storage and a fake clock. Prints PASS/FAIL per
// check and exits non-zero if any check fails.
//
// The main suite runs in America/New_York and prints every check, then runs
// again in seven other time zones with one line each. Day-boundary and DST
// checks pick their own zones; size checks print the byte counts they measure.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The module as the page has it, in a file of its own
const SOURCE = require('./extract.js').file('mastery');
const Mastery = require(SOURCE);
const KEY = 'atlas-mastery';

/* ===== Harness ===== */

const tally = { passed: 0, failed: 0 };
let quiet = false;     // true while re-running the suite in other time zones
let zoneFailures = [];

function check(name, fn) {
  const began = Date.now();
  try {
    fn();
    tally.passed++;
    const took = Date.now() - began;
    if (!quiet) console.log('PASS  ' + name + (took >= 500 ? '  (' + took + ' ms)' : ''));
  } catch (e) {
    tally.failed++;
    const msg = String((e && e.stack) || e).split('\n').slice(0, 12).join('\n      ');
    if (quiet) zoneFailures.push(name + '\n      ' + msg);
    else console.log('FAIL  ' + name + '\n      ' + msg);
  }
}

function setZone(tz) {
  process.env.TZ = tz;
}

// In-memory stand-in for localStorage that counts its calls
function fakeStorage(seed) {
  const data = new Map();
  if (seed != null) data.set(KEY, typeof seed === 'string' ? seed : JSON.stringify(seed));
  return {
    data: data, gets: 0, sets: 0, removes: 0,
    getItem(k) { this.gets++; return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { this.sets++; data.set(k, String(v)); },
    removeItem(k) { this.removes++; data.delete(k); },
    raw() { return data.has(KEY) ? data.get(KEY) : null; },
    json() { return JSON.parse(this.raw()); }
  };
}

// A clock parked at a local wall-clock time; moves by whole local days or by ms
function fakeClock(y, mo, d, h, mi) {
  let date = new Date(y, mo - 1, d, h == null ? 12 : h, mi || 0);
  const now = () => date.getTime();
  now.set = (y2, mo2, d2, h2, mi2) => { date = new Date(y2, mo2 - 1, d2, h2 == null ? 12 : h2, mi2 || 0); };
  now.days = n => { date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, date.getHours(), date.getMinutes()); };
  now.ms = n => { date = new Date(date.getTime() + n); };
  now.setMs = ms => { date = new Date(ms); };
  return now;
}

// A fresh instance on its own storage; the clock starts at noon, 16 Nov 2026 (day 319)
function fresh(opts) {
  const o = opts || {};
  const storage = o.storage === undefined ? fakeStorage(o.seed) : o.storage;
  const clock = o.clock || fakeClock(2026, 11, 16);
  const m = Mastery.create({ storage: storage, now: clock, promote: o.promote });
  return { m: m, storage: storage, clock: clock };
}

// Answers `name` right first try on `box` consecutive days, leaving it in that
// box with the clock on the following day
function climb(t, skill, name, box) {
  for (let i = 0; i < box; i++) {
    t.m.record(skill, name, 'first');
    t.clock.days(1);
  }
}

// Plays one game on each of `n` consecutive days, ending on the clock's last day
function playDays(t, n) {
  for (let i = 0; i < n; i++) {
    if (i) t.clock.days(1);
    t.m.recordSession({ questions: 10, firstTry: 8, seconds: 60 });
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const plain = v => JSON.parse(JSON.stringify(v));

/* ===== The suite (runs in several time zones) ===== */

function suite() {
  const I = Mastery.INTERVALS;

  /* ----- Module shape ----- */

  check('constants: INTERVALS, LEVELS, WEIGHTS, OUTCOMES, KEY', () => {
    assert.deepStrictEqual(Mastery.INTERVALS, [0, 1, 3, 7, 16, 35]);
    assert.deepStrictEqual(Mastery.LEVELS, ['new', 'learning', 'familiar', 'mastered']);
    assert.deepStrictEqual(Mastery.WEIGHTS, [0, 0.2, 0.45, 0.7, 0.9, 1]);
    assert.deepStrictEqual(Mastery.OUTCOMES, ['miss', 'second', 'first']);
    assert.strictEqual(Mastery.KEY, 'atlas-mastery');
    assert.strictEqual(typeof Mastery.create, 'function');
  });

  check('instance exposes every API in the spec', () => {
    const { m } = fresh();
    ['record', 'recordSession', 'get', 'summary', 'due', 'weakest', 'levels', 'activity', 'streak',
      'totals', 'skills', 'exportBlob', 'mergeBlob', 'prune', 'byteSize', 'reset', 'flush']
      .forEach(fn => assert.strictEqual(typeof m[fn], 'function', fn));
  });

  check('loads as a plain script: defines a global Mastery, needs no module system or DOM', () => {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), ctx);
    assert.strictEqual(vm.runInContext('typeof Mastery.create', ctx), 'function');
    // No storage and no localStorage: works in memory
    assert.strictEqual(vm.runInContext(
      'var m = Mastery.create(); m.record("s", "n", "first"); m.recordSession({ questions: 1, firstTry: 1, seconds: 5 }); m.get("s", "n").seen + m.totals().games', ctx), 2);
  });

  check('can be pasted inside the game\'s strict-mode IIFE', () => {
    const ctx = vm.createContext({});
    const wrapped = '(function () {\n\'use strict\';\n' + fs.readFileSync(SOURCE, 'utf8') + '\nreturn typeof Mastery.create;\n})()';
    assert.strictEqual(vm.runInContext(wrapped, ctx), 'function');
  });

  check('create() with no options uses the global localStorage when there is one', () => {
    const storage = fakeStorage();
    const ctx = vm.createContext({ localStorage: storage });
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), ctx);
    vm.runInContext('Mastery.create().record("s", "n", "first")', ctx);
    assert.strictEqual(storage.json().items.s.n[2], 1);
  });

  check('create() survives a localStorage that throws on access (blocked cookies)', () => {
    const ctx = vm.createContext({});
    vm.runInContext('Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("SecurityError"); } })', ctx);
    assert.throws(() => vm.runInContext('localStorage', ctx), /SecurityError/);
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), ctx);
    assert.strictEqual(vm.runInContext('var m = Mastery.create(); m.record("s", "n", "miss").missed', ctx), 1);
  });

  /* ----- Day numbers ----- */

  check('dayNumber: 2026-01-01 is day 0; known dates; leap year', () => {
    const day = (y, mo, d, h, mi) => Mastery.dayNumber(new Date(y, mo - 1, d, h || 0, mi || 0).getTime());
    assert.strictEqual(day(2026, 1, 1), 0);
    assert.strictEqual(day(2026, 1, 1, 23, 59), 0);
    assert.strictEqual(day(2026, 1, 2), 1);
    assert.strictEqual(day(2025, 12, 31, 23, 59), -1);
    assert.strictEqual(day(2026, 11, 16, 12), 319);
    assert.strictEqual(day(2026, 12, 31), 364);
    assert.strictEqual(day(2027, 1, 1), 365);
    assert.strictEqual(day(2028, 2, 29), 789);
    assert.strictEqual(day(2028, 3, 1), 790);
    assert.strictEqual(day(2029, 1, 1), 1096);
  });

  check('dayNumber: changes exactly at local midnight', () => {
    const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
    assert.strictEqual(Mastery.dayNumber(midnight), 165);
    assert.strictEqual(Mastery.dayNumber(midnight - 1), 164);
    assert.strictEqual(Mastery.dayNumber(midnight + 86399999), 165);
  });

  check('dayToDate: local calendar date, round trip, negative days', () => {
    assert.strictEqual(Mastery.dayToDate(0), '2026-01-01');
    assert.strictEqual(Mastery.dayToDate(319), '2026-11-16');
    assert.strictEqual(Mastery.dayToDate(-1), '2025-12-31');
    assert.strictEqual(Mastery.dayToDate(789), '2028-02-29');
    assert.strictEqual(Mastery.dayToDate(NaN), '');
    for (let d = -400; d <= 1500; d += 37) {
      const [y, mo, dd] = Mastery.dayToDate(d).split('-').map(Number);
      assert.strictEqual(Mastery.dayNumber(new Date(y, mo - 1, dd, 12).getTime()), d);
    }
  });

  check('today() follows the injected clock; a broken clock falls back to the real one', () => {
    const t = fresh();
    assert.strictEqual(t.m.today(), 319);
    t.clock.days(1);
    assert.strictEqual(t.m.today(), 320);
    const real = Mastery.dayNumber(Date.now());
    const nan = Mastery.create({ storage: null, now: () => NaN });
    assert.ok(Math.abs(nan.today() - real) <= 1);
    const thrower = Mastery.create({ storage: null, now: () => { throw new Error('no clock'); } });
    assert.ok(Math.abs(thrower.today() - real) <= 1);
  });

  /* ----- Scheduling ----- */

  check('scheduling table: every box x outcome, answered on a new day', () => {
    for (let box = 0; box <= 5; box++) {
      ['first', 'second', 'miss'].forEach(outcome => {
        const t = fresh();
        climb(t, 's', 'x', box);
        const day = t.m.today();
        const before = t.m.get('s', 'x');
        assert.strictEqual(before.box, box, 'setup box ' + box);
        assert.strictEqual(before.streak, box);
        const it = t.m.record('s', 'x', outcome);
        const label = 'box ' + box + ' + ' + outcome;
        if (outcome === 'first') {
          const next = Math.min(5, box + 1);
          assert.strictEqual(it.box, next, label);
          assert.strictEqual(it.streak, box + 1, label);
          assert.strictEqual(it.due, day + I[next], label);
          assert.strictEqual(it.isDue, false, label);
        } else if (outcome === 'second') {
          assert.strictEqual(it.box, Math.max(1, Math.min(box, 2)), label);
          assert.strictEqual(it.streak, 0, label);
          assert.strictEqual(it.due, day + 1, label);
          assert.strictEqual(it.isDue, false, label);
        } else {
          assert.strictEqual(it.box, 1, label);
          assert.strictEqual(it.streak, 0, label);
          assert.strictEqual(it.due, day, label);
          assert.strictEqual(it.isDue, true, label);
        }
        assert.strictEqual(it.last, day, label);
        assert.strictEqual(it.seen, box + 1, label);
        assert.deepStrictEqual(t.m.get('s', 'x'), it, label + ': record() returns what get() returns');
      });
    }
  });

  check('scheduling: a daily first-try climbs 1,2,3,4,5 with dues +1,+3,+7,+16,+35, then stays in box 5', () => {
    const t = fresh();
    for (let i = 1; i <= 7; i++) {
      const day = t.m.today();
      const it = t.m.record('s', 'x', 'first');
      const box = Math.min(5, i);
      assert.strictEqual(it.box, box);
      assert.strictEqual(it.due - day, I[box]);
      assert.strictEqual(it.streak, i);
      t.clock.days(1);
    }
  });

  check('scheduling: repeating a first-try answer the same day earns one step, not several', () => {
    const t = fresh();
    const day = t.m.today();
    let it;
    for (let i = 0; i < 6; i++) it = t.m.record('s', 'x', 'first');
    assert.strictEqual(it.box, 1);
    assert.strictEqual(it.level, 'learning');
    assert.strictEqual(it.due, day + 1);
    assert.strictEqual(it.seen, 6);
    assert.strictEqual(it.first, 6);
    assert.strictEqual(it.streak, 6);
    // The next day it moves up again
    t.clock.days(1);
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
    assert.strictEqual(t.m.get('s', 'x').due, day + 1 + I[2]);
  });

  check('scheduling: a miss, then right the same day: stays in box 1 but is no longer due', () => {
    const t = fresh();
    climb(t, 's', 'x', 3);
    const day = t.m.today();
    assert.strictEqual(t.m.record('s', 'x', 'miss').isDue, true);
    const it = t.m.record('s', 'x', 'first');
    assert.strictEqual(it.box, 1);
    assert.strictEqual(it.due, day + 1);
    assert.strictEqual(it.isDue, false);
    assert.strictEqual(it.streak, 1);
    t.clock.days(1);
    assert.strictEqual(t.m.get('s', 'x').isDue, true);
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
  });

  check('scheduling: a second-try, then right the same day: still due tomorrow, box unchanged', () => {
    const t = fresh();
    climb(t, 's', 'x', 4);
    const day = t.m.today();
    assert.strictEqual(t.m.record('s', 'x', 'second').box, 2);
    const it = t.m.record('s', 'x', 'first');
    assert.strictEqual(it.box, 2);
    assert.strictEqual(it.due, day + 1);
  });

  check('scheduling: promote "always" follows the literal table (a step per first-try, same day or not)', () => {
    const t = fresh({ promote: 'always' });
    const day = t.m.today();
    for (let i = 1; i <= 7; i++) {
      const it = t.m.record('s', 'x', 'first');
      const box = Math.min(5, i);
      assert.strictEqual(it.box, box);
      assert.strictEqual(it.due, day + I[box]);
      assert.strictEqual(it.streak, i);
    }
    assert.strictEqual(t.m.record('s', 'x', 'second').box, 2);
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 3);
    assert.strictEqual(t.m.record('s', 'x', 'miss').box, 1);
    assert.strictEqual(t.m.get('s', 'x').due, day);
  });

  check('levels by box: learning 1, familiar 2-3, mastered 4-5; never seen is new', () => {
    const want = [null, 'learning', 'familiar', 'familiar', 'mastered', 'mastered'];
    for (let box = 1; box <= 5; box++) {
      const t = fresh();
      climb(t, 's', 'x', box);
      assert.strictEqual(t.m.get('s', 'x').level, want[box]);
      assert.strictEqual(t.m.summary('s', ['x']).pct, Mastery.WEIGHTS[box] * 100);
    }
    assert.strictEqual(fresh().m.get('s', 'x').level, 'new');
  });

  check('record: tallies, accuracy and streak', () => {
    const t = fresh();
    ['first', 'first', 'second', 'miss', 'first'].forEach(o => t.m.record('s', 'x', o));
    const it = t.m.get('s', 'x');
    assert.strictEqual(it.seen, 5);
    assert.strictEqual(it.first, 3);
    assert.strictEqual(it.second, 1);
    assert.strictEqual(it.missed, 1);
    assert.strictEqual(it.streak, 1);
    assert.strictEqual(it.accuracy, 3 / 5);
    assert.strictEqual(it.seen, it.first + it.second + it.missed);
  });

  check('record: OUTCOMES maps the game\'s points (2, 1, 0) to outcomes', () => {
    const t = fresh();
    t.m.record('s', 'a', Mastery.OUTCOMES[2]);
    t.m.record('s', 'b', Mastery.OUTCOMES[1]);
    t.m.record('s', 'c', Mastery.OUTCOMES[0]);
    assert.strictEqual(t.m.get('s', 'a').first, 1);
    assert.strictEqual(t.m.get('s', 'b').second, 1);
    assert.strictEqual(t.m.get('s', 'c').missed, 1);
  });

  check('record: an unknown outcome or a bad skill/name changes nothing and does not throw', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    const before = t.storage.raw();
    const sets = t.storage.sets;
    assert.deepStrictEqual(t.m.record('s', 'x', 'FIRST'), t.m.get('s', 'x'));
    assert.strictEqual(t.m.record('s', 'y', undefined).seen, 0);
    assert.strictEqual(t.m.record('', 'x', 'first'), null);
    assert.strictEqual(t.m.record('s', '', 'first'), null);
    assert.strictEqual(t.m.record(null, 'x', 'first'), null);
    assert.strictEqual(t.m.record('s', 42, 'first'), null);
    assert.strictEqual(t.m.record(), null);
    assert.strictEqual(t.storage.raw(), before);
    assert.strictEqual(t.storage.sets, sets);
  });

  /* ----- get / summary / due / weakest / levels ----- */

  check('get: a never-seen item', () => {
    assert.deepStrictEqual(fresh().m.get('world-country', 'France'), {
      seen: 0, first: 0, second: 0, missed: 0, streak: 0, box: 0,
      due: null, last: null, accuracy: null, level: 'new', isDue: false
    });
  });

  check('get: isDue turns true on the due day, not before', () => {
    const t = fresh();
    climb(t, 's', 'x', 2);            // box 2 on day 320, due day 323; clock now day 321
    assert.strictEqual(t.m.get('s', 'x').due, 323);
    assert.strictEqual(t.m.get('s', 'x').isDue, false);
    t.clock.days(1);
    assert.strictEqual(t.m.get('s', 'x').isDue, false);
    t.clock.days(1);
    assert.strictEqual(t.m.get('s', 'x').isDue, true);
    t.clock.days(30);
    assert.strictEqual(t.m.get('s', 'x').isDue, true);
  });

  check('skills are separate: the same name under two skills has two histories', () => {
    const t = fresh();
    t.m.record('world-country', 'France', 'first');
    t.m.record('flag', 'France', 'miss');
    assert.strictEqual(t.m.get('world-country', 'France').first, 1);
    assert.strictEqual(t.m.get('world-country', 'France').missed, 0);
    assert.strictEqual(t.m.get('flag', 'France').missed, 1);
    assert.strictEqual(t.m.get('capital', 'France').seen, 0);
    assert.deepStrictEqual(t.m.skills().sort(), ['flag', 'world-country']);
  });

  check('names that collide with Object.prototype, and non-ASCII names, are ordinary items', () => {
    const t = fresh();
    const odd = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'Côte d\'Ivoire', 'São Tomé and Príncipe', 'Åland', '東京'];
    odd.forEach(n => assert.strictEqual(t.m.get('s', n).level, 'new', n));
    odd.forEach(n => t.m.record('s', n, 'first'));
    odd.forEach(n => t.m.record('__proto__', n, 'miss'));
    odd.forEach(n => {
      assert.strictEqual(t.m.get('s', n).first, 1, n);
      assert.strictEqual(t.m.get('__proto__', n).missed, 1, n);
    });
    assert.strictEqual(t.m.summary('s', odd).seen, odd.length);
    assert.strictEqual(t.m.summary('constructor', odd).seen, 0);
    assert.strictEqual(t.m.summary('toString').total, 0);
    assert.deepStrictEqual(t.m.skills().sort(), ['__proto__', 's']);
    // Survives a reload from storage
    const again = Mastery.create({ storage: t.storage, now: t.clock });
    odd.forEach(n => assert.strictEqual(again.get('s', n).first, 1, n));
    assert.strictEqual(again.get('__proto__', '__proto__').missed, 1);
    assert.strictEqual({}.first, undefined);
  });

  check('summary: counts by level, due, pooled accuracy, pct = mean box weight', () => {
    const t = fresh();
    climb(t, 's', 'd', 4);                  // days 319-322: box 4 (mastered), due day 338
    t.m.record('s', 'c', 'first');          // day 323
    t.clock.days(1);
    t.m.record('s', 'c', 'first');          // day 324: box 2 (familiar), due 327
    t.m.record('s', 'a', 'first');          // box 1, due 325
    t.m.record('s', 'b', 'miss');           // box 1, due today
    t.m.record('s', 'b', 'miss');
    const s = t.m.summary('s', ['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(s, {
      total: 5, seen: 4, new: 1, learning: 2, familiar: 1, mastered: 1, due: 1,
      accuracy: 7 / 9, pct: 35
    });
    assert.strictEqual(s.new + s.learning + s.familiar + s.mastered, s.total);
  });

  check('summary: empty list, unknown skill, omitted names (= every stored name), repeated names', () => {
    const t = fresh();
    const empty = { total: 0, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0, accuracy: null, pct: 0 };
    assert.deepStrictEqual(t.m.summary('s', []), empty);
    assert.deepStrictEqual(t.m.summary('nope'), empty);
    assert.deepStrictEqual(t.m.summary('s', ['a', 'b']), Object.assign({}, empty, { total: 2, new: 2 }));
    t.m.record('s', 'a', 'first');
    t.m.record('s', 'b', 'second');
    assert.strictEqual(t.m.summary('s').total, 2);
    assert.strictEqual(t.m.summary('s').seen, 2);
    assert.strictEqual(t.m.summary('s').accuracy, 0.5);
    const dup = t.m.summary('s', ['a', 'a', 'b', 'a', 'z', null, 7]);
    assert.strictEqual(dup.total, 3);
    assert.strictEqual(dup.seen, 2);
    assert.strictEqual(dup.pct, 13.3);    // (0.2 + 0.2 + 0) / 3
  });

  check('due: most overdue first, then lowest box, then most missed; never-seen and not-yet-due left out', () => {
    const t = fresh({ clock: fakeClock(2026, 11, 1) });   // day 304
    t.m.record('s', 'A', 'miss');                         // due 304
    t.m.record('s', 'B', 'second');                       // box 1, due 305
    t.m.record('s', 'C', 'first');
    t.m.record('s', 'G', 'first');
    t.clock.days(1);                                      // day 305
    t.m.record('s', 'C', 'first');                        // box 2, due 308: not due on 307
    t.m.record('s', 'G', 'first');
    t.m.record('s', 'G', 'second');                       // box 2, due 306
    t.m.record('s', 'F', 'second');                       // box 1, due 306, never missed
    t.clock.days(1);                                      // day 306
    t.m.record('s', 'E', 'miss');                         // box 1, due 306, missed 1
    t.m.record('s', 'D', 'miss');
    t.m.record('s', 'D', 'miss');                         // box 1, due 306, missed 2
    t.clock.days(1);                                      // day 307
    t.m.record('s', 'H', 'first');                        // due 308
    const names = ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'never'];
    assert.deepStrictEqual(t.m.due('s', names), ['A', 'B', 'D', 'E', 'F', 'G']);
    assert.deepStrictEqual(t.m.due('s', names, { limit: 3 }), ['A', 'B', 'D']);
    assert.deepStrictEqual(t.m.due('s', names, { limit: 0 }), []);
    assert.deepStrictEqual(t.m.due('s', names, {}), ['A', 'B', 'D', 'E', 'F', 'G']);
    assert.deepStrictEqual(t.m.due('s', ['G', 'A']), ['A', 'G']);
    assert.deepStrictEqual(t.m.due('s').slice().sort(), ['A', 'B', 'D', 'E', 'F', 'G']);
    assert.deepStrictEqual(t.m.due('other', names), []);
    assert.strictEqual(t.m.summary('s', names).due, 6);
    t.clock.days(1);                                      // day 308: C and H come due
    assert.deepStrictEqual(t.m.due('s', names), ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'C']);
  });

  check('due: full ties keep the caller\'s order', () => {
    const t = fresh();
    ['q', 'p', 'r'].forEach(n => t.m.record('s', n, 'miss'));
    assert.deepStrictEqual(t.m.due('s', ['r', 'q', 'p']), ['r', 'q', 'p']);
    assert.deepStrictEqual(t.m.due('s', ['p', 'r', 'q']), ['p', 'r', 'q']);
  });

  check('weakest: lowest first-try accuracy; ties by more misses, then more recent; minSeen; n', () => {
    const t = fresh();
    t.m.record('s', 'Q', 'first');
    t.m.record('s', 'Q', 'miss');                                   // 1/2, missed 1, last day 319
    t.clock.days(1);
    ['first', 'miss', 'miss', 'miss'].forEach(o => t.m.record('s', 'P', o));   // 1/4
    t.m.record('s', 'R', 'first');
    t.m.record('s', 'R', 'second');                                 // 1/2, missed 0
    t.m.record('s', 'S', 'first');
    t.m.record('s', 'S', 'miss');                                   // 1/2, missed 1, last day 320
    ['first', 'first', 'first'].forEach(o => t.m.record('s', 'U', o));         // 3/3
    t.m.record('s', 'V', 'miss');                                   // seen once
    const names = ['U', 'V', 'R', 'Q', 'S', 'P', 'W'];
    assert.deepStrictEqual(t.m.weakest('s', names, 10), ['P', 'S', 'Q', 'R']);
    assert.deepStrictEqual(t.m.weakest('s', names, 2), ['P', 'S']);
    assert.deepStrictEqual(t.m.weakest('s', names, 0), []);
    assert.deepStrictEqual(t.m.weakest('s', names), ['P', 'S', 'Q', 'R']);
    assert.deepStrictEqual(t.m.weakest('s', names, 10, { minSeen: 1 }), ['V', 'P', 'S', 'Q', 'R']);
    assert.deepStrictEqual(t.m.weakest('s', names, 10, { minSeen: 4 }), ['P']);
    assert.deepStrictEqual(t.m.weakest('s', names, 10, { includePerfect: true }), ['P', 'S', 'Q', 'R', 'U']);
    assert.deepStrictEqual(t.m.weakest('s', ['U', 'W'], 5), []);
    assert.deepStrictEqual(t.m.weakest('other', names, 5), []);
  });

  check('levels: { name: level } over the list, new for unseen', () => {
    const t = fresh();
    climb(t, 's', 'm', 4);
    climb(t, 's', 'f', 2);
    t.m.record('s', 'l', 'miss');
    assert.deepStrictEqual(t.m.levels('s', ['m', 'f', 'l', 'n']), { m: 'mastered', f: 'familiar', l: 'learning', n: 'new' });
    assert.deepStrictEqual(t.m.levels('s', []), {});
    assert.deepStrictEqual(t.m.levels('s'), { m: 'mastered', f: 'familiar', l: 'learning' });
    assert.deepStrictEqual(t.m.levels('nope', ['a']), { a: 'new' });
  });

  /* ----- Sessions, activity, streak, totals ----- */

  check('recordSession: adds to today\'s row, games + 1, returns the row', () => {
    const t = fresh();
    assert.deepStrictEqual(t.m.recordSession({ questions: 20, firstTry: 15, seconds: 95 }),
      { day: 319, date: '2026-11-16', games: 1, questions: 20, firstTry: 15, seconds: 95 });
    assert.deepStrictEqual(t.m.recordSession({ questions: 5, firstTry: 5, seconds: 30.6 }),
      { day: 319, date: '2026-11-16', games: 2, questions: 25, firstTry: 20, seconds: 126 });
    assert.deepStrictEqual(t.storage.json().days, { 319: [2, 25, 20, 126] });
  });

  check('recordSession: garbage numbers count as 0; firstTry is capped at questions; still a game', () => {
    const t = fresh();
    t.m.recordSession();
    t.m.recordSession({ questions: -4, firstTry: 'x', seconds: NaN });
    t.m.recordSession({ questions: 3, firstTry: 9, seconds: '12' });
    assert.deepStrictEqual(t.m.activity(1)[0], { day: 319, date: '2026-11-16', games: 3, questions: 3, firstTry: 3, seconds: 12 });
  });

  check('activity: oldest to newest, ends today, quiet days included', () => {
    const t = fresh();
    t.clock.days(-2);
    t.m.recordSession({ questions: 10, firstTry: 7, seconds: 60 });
    t.clock.days(2);
    t.m.recordSession({ questions: 4, firstTry: 4, seconds: 20 });
    assert.deepStrictEqual(t.m.activity(4), [
      { day: 316, date: '2026-11-13', games: 0, questions: 0, firstTry: 0, seconds: 0 },
      { day: 317, date: '2026-11-14', games: 1, questions: 10, firstTry: 7, seconds: 60 },
      { day: 318, date: '2026-11-15', games: 0, questions: 0, firstTry: 0, seconds: 0 },
      { day: 319, date: '2026-11-16', games: 1, questions: 4, firstTry: 4, seconds: 20 }
    ]);
    assert.strictEqual(t.m.activity(1)[0].day, 319);
    assert.strictEqual(t.m.activity(365).length, 365);
    assert.strictEqual(t.m.activity(365)[0].date, '2025-11-17');
    assert.strictEqual(t.m.activity().length, 30);
    assert.deepStrictEqual(t.m.activity(0), []);
    assert.deepStrictEqual(t.m.activity(-3), []);
    assert.deepStrictEqual(t.m.activity('junk'), []);
  });

  check('streak: nothing played', () => {
    assert.deepStrictEqual(fresh().m.streak(), { current: 0, longest: 0 });
  });

  check('streak: answers without a finished game do not make a day active', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    assert.deepStrictEqual(t.m.streak(), { current: 0, longest: 0 });
    assert.strictEqual(t.m.totals().daysActive, 0);
  });

  check('streak: several games in a day count once', () => {
    const t = fresh();
    for (let i = 0; i < 5; i++) t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(t.m.streak(), { current: 1, longest: 1 });
  });

  check('streak: current survives the whole day after the last active day, then drops', () => {
    const t = fresh({ clock: fakeClock(2026, 11, 10, 9) });
    playDays(t, 3);                                    // 10, 11, 12 Nov
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    t.clock.set(2026, 11, 13, 0, 0);                   // first minute of the next day
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    t.clock.set(2026, 11, 13, 23, 59);                 // last minute of it
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    t.clock.set(2026, 11, 14, 0, 0);                   // a full day missed
    assert.deepStrictEqual(t.m.streak(), { current: 0, longest: 3 });
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(t.m.streak(), { current: 1, longest: 3 });
  });

  check('streak: computed from day rows alone when there is no lifetime row (a seeded or v1 store)', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { 312: [1, 1, 1, 1], 316: [1, 1, 1, 1], 317: [2, 1, 1, 1], 318: [1, 1, 1, 1] } } });
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });      // last played yesterday
    t.clock.days(1);
    assert.deepStrictEqual(t.m.streak(), { current: 0, longest: 3 });
    assert.deepStrictEqual(t.m.exportBlob().life, [5, 4, 4, 4, 4, 3, 318, 3]);
  });

  check('streak: playing late on the day after keeps the run going', () => {
    const t = fresh({ clock: fakeClock(2026, 11, 10, 0, 5) });
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    t.clock.set(2026, 11, 11, 23, 55);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 2 });
  });

  check('streak: a gap starts a new run; longest remembers the best', () => {
    const t = fresh({ clock: fakeClock(2026, 10, 1) });
    playDays(t, 5);
    t.clock.days(3);
    playDays(t, 2);
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 5 });
    t.clock.days(1);
    playDays(t, 6);
    assert.deepStrictEqual(t.m.streak(), { current: 8, longest: 8 });
  });

  check('streak: runs across month, year and leap-day boundaries', () => {
    const t = fresh({ clock: fakeClock(2027, 12, 28) });
    playDays(t, 8);                                    // 28 Dec 2027 - 4 Jan 2028
    assert.deepStrictEqual(t.m.streak(), { current: 8, longest: 8 });
    const leap = fresh({ clock: fakeClock(2028, 2, 27) });
    playDays(leap, 4);                                 // 27, 28, 29 Feb, 1 Mar
    assert.deepStrictEqual(leap.m.streak(), { current: 4, longest: 4 });
    assert.deepStrictEqual(leap.m.activity(4).map(a => a.date), ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });

  check('streak: a clock that jumps back does not break anything', () => {
    const t = fresh();
    playDays(t, 2);
    t.clock.days(-10);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(t.m.streak(), { current: 1, longest: 2 });
    t.m.record('s', 'x', 'first');
    assert.strictEqual(t.m.get('s', 'x').box, 1);
  });

  check('totals: games, questions, firstTry, seconds, daysActive, itemsSeen, itemsMastered', () => {
    const t = fresh();
    assert.deepStrictEqual(t.m.totals(), { games: 0, questions: 0, firstTry: 0, seconds: 0, daysActive: 0, itemsSeen: 0, itemsMastered: 0 });
    climb(t, 'a', 'x', 4);
    climb(t, 'b', 'x', 5);
    t.m.record('a', 'y', 'miss');
    t.m.recordSession({ questions: 10, firstTry: 9, seconds: 100 });
    t.m.recordSession({ questions: 10, firstTry: 5, seconds: 50 });
    t.clock.days(2);
    t.m.recordSession({ questions: 3, firstTry: 3, seconds: 7 });
    assert.deepStrictEqual(t.m.totals(), { games: 3, questions: 23, firstTry: 17, seconds: 157, daysActive: 2, itemsSeen: 3, itemsMastered: 2 });
  });

  /* ----- Persistence ----- */

  check('record() and recordSession() save immediately: one write each, and nothing is lost on reload', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    assert.strictEqual(t.storage.sets, 1);
    t.m.record('s', 'y', 'miss');
    assert.strictEqual(t.storage.sets, 2);
    t.m.recordSession({ questions: 2, firstTry: 1, seconds: 9 });
    assert.strictEqual(t.storage.sets, 3);
    const again = Mastery.create({ storage: t.storage, now: t.clock });
    assert.deepStrictEqual(again.get('s', 'x'), t.m.get('s', 'x'));
    assert.deepStrictEqual(again.get('s', 'y'), t.m.get('s', 'y'));
    assert.deepStrictEqual(again.totals(), t.m.totals());
    assert.deepStrictEqual(again.streak(), t.m.streak());
    assert.deepStrictEqual(again.exportBlob(), t.m.exportBlob());
  });

  check('reads never touch storage', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    const gets = t.storage.gets, sets = t.storage.sets;
    t.m.get('s', 'x'); t.m.summary('s', ['x']); t.m.due('s', ['x']); t.m.weakest('s', ['x'], 3);
    t.m.levels('s', ['x']); t.m.activity(30); t.m.streak(); t.m.totals(); t.m.skills(); t.m.byteSize();
    assert.strictEqual(t.storage.gets, gets);
    assert.strictEqual(t.storage.sets, sets);
  });

  check('stored shape: { v, items: { skill: { name: [...] } }, days: { day: [games, questions, firstTry, seconds] }, life }', () => {
    const t = fresh();
    t.m.record('world-country', 'France', 'first');
    t.m.record('world-country', 'Chad', 'miss');
    t.m.record('world-country', 'Peru', 'second');
    t.m.recordSession({ questions: 3, firstTry: 1, seconds: 31 });
    // items: [lastDay, box, first, streak, second, missed, dueFix], trailing zeros dropped
    assert.deepStrictEqual(t.storage.json(), {
      v: 2,
      items: { 'world-country': { France: [319, 1, 1, 1], Chad: [319, 1, 0, 0, 0, 1, 1], Peru: [319, 1, 0, 0, 1] } },
      days: { 319: [1, 3, 1, 31] },
      life: [1, 3, 1, 31, 1, 1, 319, 1]
    });
  });

  check('stored items round-trip: every reachable state reloads to the same get()', () => {
    const rng = mulberry32(99);
    const t = fresh();
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let step = 0; step < 400; step++) {
      if (rng() < 0.25) t.clock.days(1 + Math.floor(rng() * 9));
      const name = names[Math.floor(rng() * names.length)];
      const it = t.m.record('s', name, Mastery.OUTCOMES[Math.floor(rng() * 3)]);
      const again = Mastery.create({ storage: t.storage, now: t.clock });
      assert.deepStrictEqual(again.get('s', name), it);
      const stored = t.storage.json().items.s[name];
      assert.ok(stored.length >= 3 && stored.length <= 7 && stored[stored.length - 1] !== 0, JSON.stringify(stored));
    }
  });

  check('byteSize: the length of the serialized store', () => {
    const t = fresh();
    assert.strictEqual(t.m.byteSize(), JSON.stringify({ v: 2, items: {}, days: {} }).length);
    t.m.record('s', 'x', 'first');
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.strictEqual(t.m.byteSize(), t.storage.raw().length);
    assert.strictEqual(t.m.byteSize(), JSON.stringify(t.m.exportBlob()).length);
  });

  check('flush: a no-op when the last save reached storage', () => {
    const t = fresh();
    t.m.flush();
    assert.strictEqual(t.storage.sets, 0);
    t.m.record('s', 'x', 'first');
    const sets = t.storage.sets, gets = t.storage.gets;
    t.m.flush();
    t.m.flush();
    assert.strictEqual(t.storage.sets, sets);
    assert.strictEqual(t.storage.gets, gets);
  });

  check('reset: empties memory and storage', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    t.m.reset();
    assert.strictEqual(t.storage.raw(), null);
    assert.strictEqual(t.m.get('s', 'x').seen, 0);
    assert.deepStrictEqual(t.m.skills(), []);
    assert.deepStrictEqual(t.m.streak(), { current: 0, longest: 0 });
    assert.strictEqual(t.m.totals().games, 0);
    assert.deepStrictEqual(t.m.exportBlob(), { v: 2, items: {}, days: {} });
    assert.strictEqual(Mastery.create({ storage: t.storage, now: t.clock }).totals().itemsSeen, 0);
    t.m.record('s', 'y', 'first');
    assert.strictEqual(t.storage.json().items.s.y[2], 1);
    // A storage without removeItem is overwritten instead
    const bare = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
    const b = Mastery.create({ storage: bare, now: t.clock });
    b.record('s', 'x', 'first');
    b.reset();
    assert.deepStrictEqual(JSON.parse(bare.v), { v: 2, items: {}, days: {} });
  });

  check('corrupt or missing storage loads as an empty store, never throws, and is overwritten on the next save', () => {
    const bad = [
      null, '', 'not json', '{', 'null', 'undefined', '42', '"text"', '[]', '[1,2,3]', 'true',
      '{"v":2}', '{"v":2,"items":"x","days":7}', '{"v":2,"items":[],"days":[]}', '{"v":2,"items":null,"days":null}',
      '{"v":2,"items":{"s":"x","t":[1,2],"u":null,"w":{"n":"oops","o":{},"p":[],"q":[null],"r":["a","b"],"z":[5,1,0,0,0,0,3]}}}',
      '{"v":2,"items":{},"days":{"abc":[1,1,1,1],"5":"x","6":[],"7":[0,0,0,0],"1e3":[1,1,1,1],"12345678":[1,1,1,1]}}',
      '{"v":99,"items":{"s":{"x":[319,1,1,1]}},"days":{}}',
      '{"v":"2","items":{"s":{"x":[319,1,1,1]}}}',
      '{"v":2,"life":"x","items":{}}',
      '\u0000￿'
    ];
    bad.forEach(seed => {
      const storage = fakeStorage();
      if (seed !== null) storage.data.set(KEY, seed);
      const m = Mastery.create({ storage: storage, now: fakeClock(2026, 11, 16) });
      const label = JSON.stringify(seed);
      assert.deepStrictEqual(m.skills(), [], label);
      assert.deepStrictEqual(m.summary('s', ['x']), { total: 1, seen: 0, new: 1, learning: 0, familiar: 0, mastered: 0, due: 0, accuracy: null, pct: 0 }, label);
      assert.deepStrictEqual(m.totals(), { games: 0, questions: 0, firstTry: 0, seconds: 0, daysActive: 0, itemsSeen: 0, itemsMastered: 0 }, label);
      assert.deepStrictEqual(m.streak(), { current: 0, longest: 0 }, label);
      assert.strictEqual(m.activity(3).length, 3, label);
      m.record('s', 'x', 'first');
      assert.deepStrictEqual(storage.json(), { v: 2, items: { s: { x: [319, 1, 1, 1] } }, days: {} }, label);
    });
  });

  check('partly corrupt storage: the valid entries are kept, the rest dropped, numbers cleaned', () => {
    const t = fresh({ seed: {
      v: 2,
      items: {
        s: { good: [319, 2, 2, 2], junk: 'x', empty: [], unseen: [319, 1, 0, 0, 0, 0, 2], nolast: ['a', 1, 1, 1], odd: [318.9, 99, 2.7, '4', -3, null, 1] },
        t: 'nope'
      },
      days: { 319: [2, 20, 18, 90], x: [1, 1, 1, 1], 318: [1.9, -5, 'a', null], 317: 'zz' },
      life: [5, 'a', -1, 100.5, 2, 1, 'x', 1]
    } });
    assert.deepStrictEqual(t.m.skills(), ['s']);
    assert.deepStrictEqual(Object.keys(t.m.levels('s')).sort(), ['good', 'odd']);
    assert.strictEqual(t.m.get('s', 'good').seen, 2);
    assert.strictEqual(t.m.get('s', 'good').due, 322);
    assert.deepStrictEqual(t.m.get('s', 'odd'), {
      seen: 2, first: 2, second: 0, missed: 0, streak: 4, box: 5, due: 318, last: 318, accuracy: 1, level: 'mastered', isDue: true
    });
    assert.deepStrictEqual(t.m.activity(2).map(a => a.games), [1, 2]);
    assert.strictEqual(t.m.totals().games, 5);
    assert.strictEqual(t.m.totals().questions, 20);
    assert.strictEqual(t.m.totals().seconds, 100);
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 2 });
  });

  check('a v1 store in the spec layout [seen, first, second, missed, streak, box, dueDay, lastDay] is read and rewritten', () => {
    const t = fresh({ seed: {
      v: 1,
      items: { 'world-country': { France: [5, 4, 1, 0, 2, 3, 326, 319], Chad: [2, 0, 0, 2, 0, 1, 319, 319], Sloppy: [3, 0, 0, 0, 0, 1, 320, 319], Never: [0, 0, 0, 0, 0, 0, 0, 0] } },
      days: { 318: [1, 20, 15, 300], 319: [2, 40, 30, 500] }
    } });
    assert.deepStrictEqual(t.m.get('world-country', 'France'), {
      seen: 5, first: 4, second: 1, missed: 0, streak: 2, box: 3, due: 326, last: 319, accuracy: 0.8, level: 'familiar', isDue: false
    });
    assert.strictEqual(t.m.get('world-country', 'Chad').isDue, true);
    assert.strictEqual(t.m.get('world-country', 'Chad').missed, 2);
    assert.strictEqual(t.m.get('world-country', 'Sloppy').seen, 3);
    assert.strictEqual(t.m.get('world-country', 'Sloppy').accuracy, 0);
    assert.strictEqual(t.m.get('world-country', 'Never').level, 'new');
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 2 });
    assert.strictEqual(t.m.totals().games, 3);
    t.m.record('world-country', 'Chad', 'first');
    const saved = t.storage.json();
    assert.strictEqual(saved.v, 2);
    assert.deepStrictEqual(saved.items['world-country'].France, [319, 3, 4, 2, 1]);
    assert.deepStrictEqual(saved.items['world-country'].Chad, [319, 1, 1, 1, 0, 2]);
    assert.deepStrictEqual(saved.items['world-country'].Sloppy, [319, 1, 0, 0, 0, 3]);
    // The eight fields identify the layout even if the seed leaves out v
    const noVersion = fresh({ seed: { items: { s: { x: [5, 4, 1, 0, 2, 3, 326, 319] } }, days: {} } });
    assert.deepStrictEqual(noVersion.m.get('s', 'x'), t.m.get('world-country', 'France'));
    assert.deepStrictEqual(saved.days, { 318: [1, 20, 15, 300], 319: [2, 40, 30, 500] });
  });

  check('storage that throws on setItem: nothing throws, the session carries on in memory, flush retries', () => {
    let fail = true;
    const inner = fakeStorage();
    const storage = {
      attempts: 0,
      getItem: k => inner.getItem(k),
      setItem(k, v) { this.attempts++; if (fail) throw new Error('QuotaExceededError'); inner.setItem(k, v); },
      removeItem(k) { if (fail) throw new Error('blocked'); inner.removeItem(k); }
    };
    const clock = fakeClock(2026, 11, 16);
    const m = Mastery.create({ storage: storage, now: clock });
    assert.strictEqual(m.record('s', 'x', 'first').seen, 1);
    assert.strictEqual(m.record('s', 'x', 'first').seen, 2);
    assert.strictEqual(m.recordSession({ questions: 2, firstTry: 2, seconds: 10 }).games, 1);
    assert.strictEqual(m.mergeBlob({ v: 2, items: { s: { y: [319, 1, 0, 0, 0, 1, 1] } }, days: {} }), true);
    assert.strictEqual(m.prune(), false);
    assert.strictEqual(m.get('s', 'x').seen, 2);
    assert.strictEqual(m.get('s', 'y').missed, 1);
    assert.strictEqual(m.summary('s', ['x', 'y']).seen, 2);
    assert.deepStrictEqual(m.streak(), { current: 1, longest: 1 });
    assert.strictEqual(inner.raw(), null);
    const attempts = storage.attempts;
    m.flush();
    assert.strictEqual(storage.attempts, attempts + 1, 'flush retries the refused save');
    m.reset();                              // removeItem throws too
    assert.strictEqual(m.get('s', 'x').seen, 0);
    m.record('s', 'z', 'first');
    fail = false;                           // storage comes back
    m.flush();
    assert.deepStrictEqual(inner.json().items, { s: { z: [319, 1, 1, 1] } });
    const after = storage.attempts;
    m.flush();
    assert.strictEqual(storage.attempts, after, 'nothing left to flush');
  });

  check('storage that fills up mid-session: earlier data stays stored, later answers stay in memory', () => {
    let room = 3;
    const inner = fakeStorage();
    const storage = {
      getItem: k => inner.getItem(k),
      setItem(k, v) { if (room-- <= 0) throw new Error('QuotaExceededError'); inner.setItem(k, v); },
      removeItem: k => inner.removeItem(k)
    };
    const m = Mastery.create({ storage: storage, now: fakeClock(2026, 11, 16) });
    ['a', 'b', 'c', 'd', 'e'].forEach(n => m.record('s', n, 'first'));
    assert.deepStrictEqual(Object.keys(inner.json().items.s), ['a', 'b', 'c']);
    assert.strictEqual(m.summary('s', ['a', 'b', 'c', 'd', 'e']).seen, 5);
  });

  check('storage that throws on getItem, returns junk, or is null', () => {
    const clock = fakeClock(2026, 11, 16);
    const written = [];
    const noRead = { getItem() { throw new Error('SecurityError'); }, setItem(k, v) { written.push(v); }, removeItem() {} };
    const a = Mastery.create({ storage: noRead, now: clock });
    assert.strictEqual(a.record('s', 'x', 'first').seen, 1);
    assert.strictEqual(a.record('s', 'x', 'first').seen, 2);
    assert.strictEqual(a.reload(), false);
    assert.strictEqual(written.length, 2);
    // A stub that swallows writes and reads back nothing must not look like "another tab wiped the store"
    [undefined, null, 7, {}, []].forEach(junk => {
      const b = Mastery.create({ storage: { getItem: () => junk, setItem() {}, removeItem() {} }, now: clock });
      assert.strictEqual(b.record('s', 'x', 'first').seen, 1);
      assert.strictEqual(b.record('s', 'x', 'miss').seen, 2);
      assert.strictEqual(b.recordSession({ questions: 2, firstTry: 1, seconds: 5 }).games, 1);
      assert.strictEqual(b.recordSession({ questions: 2, firstTry: 1, seconds: 5 }).games, 2);
      assert.strictEqual(b.reload(), false);
      assert.strictEqual(b.get('s', 'x').seen, 2);
    });
    const c = Mastery.create({ storage: null, now: clock });
    assert.strictEqual(c.record('s', 'x', 'first').seen, 1);
    assert.strictEqual(c.recordSession({ questions: 1, firstTry: 1, seconds: 1 }).games, 1);
    assert.strictEqual(c.mergeBlob(a.exportBlob()), true);
    c.flush(); c.prune(); c.reset();
    assert.strictEqual(c.get('s', 'x').seen, 0);
  });

  check('two tabs on one storage: neither overwrites the other; reload() refreshes reads', () => {
    const storage = fakeStorage();
    const clock = fakeClock(2026, 11, 16);
    const a = Mastery.create({ storage: storage, now: clock });
    const b = Mastery.create({ storage: storage, now: clock });
    a.record('s', 'x', 'first');
    b.record('s', 'y', 'miss');
    assert.strictEqual(a.get('s', 'y').seen, 0, 'reads do not look at storage');
    assert.strictEqual(a.reload(), true);
    assert.strictEqual(a.reload(), false);
    assert.strictEqual(a.get('s', 'y').missed, 1);
    a.recordSession({ questions: 5, firstTry: 5, seconds: 20 });
    b.recordSession({ questions: 3, firstTry: 1, seconds: 10 });
    b.record('s', 'w', 'second');
    a.record('s', 'v', 'first');                 // a's write picks up b's without an explicit reload
    assert.strictEqual(a.get('s', 'w').second, 1);
    assert.strictEqual(a.totals().games, 2);
    clock.days(1);
    b.record('s', 'x', 'first');
    const c = Mastery.create({ storage: storage, now: clock });
    assert.strictEqual(c.get('s', 'x').seen, 2);
    assert.strictEqual(c.get('s', 'x').box, 2);
    assert.deepStrictEqual(Object.keys(c.levels('s')).sort(), ['v', 'w', 'x', 'y']);
    assert.deepStrictEqual(c.activity(2)[0], { day: 319, date: '2026-11-16', games: 2, questions: 8, firstTry: 6, seconds: 30 });
    assert.deepStrictEqual(c.totals(), { games: 2, questions: 8, firstTry: 6, seconds: 30, daysActive: 1, itemsSeen: 4, itemsMastered: 0 });
  });

  check('two tabs: exportBlob and mergeBlob start from what the other tab stored', () => {
    const storage = fakeStorage();
    const clock = fakeClock(2026, 11, 16);
    const a = Mastery.create({ storage: storage, now: clock });
    const b = Mastery.create({ storage: storage, now: clock });
    a.record('s', 'x', 'first');
    b.record('s', 'y', 'miss');
    assert.deepStrictEqual(Object.keys(a.exportBlob().items.s).sort(), ['x', 'y'], 'the sync payload includes the other tab\'s answers');
    b.record('s', 'w', 'second');
    assert.strictEqual(a.mergeBlob({ v: 2, items: { s: { z: [319, 1, 1, 1] } }, days: {} }), true);
    assert.deepStrictEqual(Object.keys(storage.json().items.s).sort(), ['w', 'x', 'y', 'z'], 'a sync pull in one tab keeps what the other just saved');
  });

  check('two tabs: answers a tab could not save are not lost when the other tab writes', () => {
    const inner = fakeStorage();
    let full = false;
    const flaky = { getItem: k => inner.getItem(k), setItem(k, v) { if (full) throw new Error('QuotaExceededError'); inner.setItem(k, v); }, removeItem: k => inner.removeItem(k) };
    const clock = fakeClock(2026, 11, 16);
    const a = Mastery.create({ storage: flaky, now: clock });
    const b = Mastery.create({ storage: inner, now: clock });
    a.record('s', 'saved', 'first');
    full = true;
    a.record('s', 'unsaved', 'miss');             // stays in a's memory only
    b.record('s', 'other', 'first');              // b writes; storage now differs from what a last saw
    full = false;
    a.record('s', 'later', 'first');
    assert.deepStrictEqual(Object.keys(inner.json().items.s).sort(), ['later', 'other', 'saved', 'unsaved']);
    assert.strictEqual(a.get('s', 'unsaved').missed, 1);
  });

  check('two tabs: a reset in one empties the other on its next write or reload', () => {
    const storage = fakeStorage();
    const clock = fakeClock(2026, 11, 16);
    const a = Mastery.create({ storage: storage, now: clock });
    const b = Mastery.create({ storage: storage, now: clock });
    a.record('s', 'x', 'first');
    b.record('s', 'y', 'first');
    a.reset();
    b.record('s', 'z', 'first');
    assert.deepStrictEqual(storage.json().items, { s: { z: [319, 1, 1, 1] } });
    assert.strictEqual(b.get('s', 'y').seen, 0);
    const d = Mastery.create({ storage: storage, now: clock });
    a.reset();
    assert.strictEqual(d.reload(), true);
    assert.deepStrictEqual(d.skills(), []);
  });

  /* ----- Pruning and lifetime tallies ----- */

  check('prune: drops day rows older than 400 days; a row exactly 400 days old stays', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { '-90': [1, 1, 1, 1], '-82': [1, 2, 2, 2], '-81': [1, 3, 3, 3], 0: [1, 4, 4, 4], 319: [1, 5, 5, 5] } } });
    // Day 319: the cutoff is day -81
    assert.strictEqual(t.m.prune(), true);
    assert.deepStrictEqual(t.storage.json().days, { '-81': [1, 3, 3, 3], 0: [1, 4, 4, 4], 319: [1, 5, 5, 5] });
    assert.strictEqual(t.m.prune(), false);
    assert.strictEqual(t.m.activity(401)[0].games, 1);
    assert.strictEqual(t.m.activity(402)[0].games, 0);
    t.clock.days(1);
    assert.strictEqual(t.m.prune(), true);
    assert.deepStrictEqual(Object.keys(t.storage.json().days).sort(), ['0', '319']);
  });

  check('prune runs on every save', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { '-200': [1, 1, 1, 1], 300: [1, 1, 1, 1] } } });
    t.m.record('s', 'x', 'first');
    assert.deepStrictEqual(Object.keys(t.storage.json().days), ['300']);
    const u = fresh({ seed: { v: 2, items: {}, days: { '-200': [1, 1, 1, 1], 300: [1, 1, 1, 1] } } });
    u.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(Object.keys(u.storage.json().days).sort(), ['300', '319']);
  });

  check('prune: a tab left open past midnight prunes on its next save', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { '-81': [1, 3, 3, 3], 300: [1, 1, 1, 1] } } });
    t.m.record('s', 'x', 'first');                       // day 319: day -81 is exactly 400 days old
    assert.deepStrictEqual(Object.keys(t.storage.json().days).sort(), ['-81', '300']);
    t.m.record('s', 'y', 'first');
    assert.deepStrictEqual(Object.keys(t.storage.json().days).sort(), ['-81', '300']);
    t.clock.set(2026, 11, 17, 0, 1);
    t.m.record('s', 'z', 'first');
    assert.deepStrictEqual(Object.keys(t.storage.json().days), ['300']);
    assert.strictEqual(t.m.totals().games, 2);
  });

  check('prune keeps lifetime totals: pruned rows still count in totals()', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { '-200': [2, 20, 10, 100], '-199': [1, 5, 5, 50], 300: [3, 30, 25, 200] } } });
    const want = { games: 6, questions: 55, firstTry: 40, seconds: 350, daysActive: 3, itemsSeen: 0, itemsMastered: 0 };
    assert.deepStrictEqual(t.m.totals(), want);
    assert.strictEqual(t.m.prune(), true);
    assert.deepStrictEqual(t.m.totals(), want);
    t.m.recordSession({ questions: 10, firstTry: 9, seconds: 60 });
    assert.deepStrictEqual(t.m.totals(), { games: 7, questions: 65, firstTry: 49, seconds: 410, daysActive: 4, itemsSeen: 0, itemsMastered: 0 });
    assert.deepStrictEqual(Mastery.create({ storage: t.storage, now: t.clock }).totals(), t.m.totals());
    assert.strictEqual(t.m.streak().longest, 2);
  });

  check('a 450-day daily streak: rows stop at 401, totals and streak keep counting', () => {
    const t = fresh({ clock: fakeClock(2026, 1, 1) });
    for (let i = 0; i < 450; i++) {
      if (i) t.clock.days(1);
      t.m.record('s', 'x', i % 9 === 0 ? 'miss' : 'first');
      t.m.recordSession({ questions: 10, firstTry: 8, seconds: 60 });
    }
    assert.strictEqual(t.m.today(), 449);
    assert.strictEqual(Object.keys(t.storage.json().days).length, 401);
    assert.deepStrictEqual(t.m.streak(), { current: 450, longest: 450 });
    assert.deepStrictEqual(t.m.totals(), { games: 450, questions: 4500, firstTry: 3600, seconds: 27000, daysActive: 450, itemsSeen: 1, itemsMastered: 1 });
    const act = t.m.activity(450);
    assert.strictEqual(act.filter(a => a.games === 0).length, 49);
    assert.strictEqual(act[48].games, 0);
    assert.strictEqual(act[49].games, 1);
    // Same answers after a reload, and the day after without playing
    const again = Mastery.create({ storage: t.storage, now: t.clock });
    assert.deepStrictEqual(again.streak(), { current: 450, longest: 450 });
    assert.deepStrictEqual(again.totals(), t.m.totals());
    t.clock.days(1);
    assert.deepStrictEqual(again.streak(), { current: 450, longest: 450 });
    t.clock.days(1);
    assert.deepStrictEqual(again.streak(), { current: 0, longest: 450 });
    again.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(again.streak(), { current: 1, longest: 450 });
    assert.strictEqual(again.totals().games, 451);
    assert.strictEqual(again.totals().daysActive, 451);
  });

  check('longest streak survives after its rows are pruned', () => {
    const t = fresh({ clock: fakeClock(2026, 1, 1) });
    playDays(t, 30);
    t.clock.days(500);
    assert.deepStrictEqual(t.m.streak(), { current: 0, longest: 30 });
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(Object.keys(t.storage.json().days).length, 1);
    assert.deepStrictEqual(t.m.streak(), { current: 1, longest: 30 });
    assert.strictEqual(t.m.totals().games, 31);
    assert.strictEqual(t.m.totals().daysActive, 31);
    assert.strictEqual(t.m.totals().questions, 301);
  });

  /* ----- Sync: exportBlob / mergeBlob ----- */

  check('exportBlob: a detached, JSON-safe copy; importing it elsewhere reproduces it', () => {
    const t = fresh();
    climb(t, 'world-country', 'France', 3);
    t.m.record('flag', 'Chad', 'miss');
    playDays(t, 2);
    const blob = t.m.exportBlob();
    assert.deepStrictEqual(Object.keys(blob).sort(), ['days', 'items', 'life', 'v']);
    assert.deepStrictEqual(plain(blob), blob);
    assert.deepStrictEqual(blob, t.storage.json());
    const snapshot = JSON.stringify(blob);
    blob.items['world-country'].France[1] = 5;
    blob.items.flag.Hacked = [1, 5, 35, 9, 9];
    blob.days[999] = [9, 9, 9, 9];
    blob.life[0] = 999;
    assert.strictEqual(JSON.stringify(t.m.exportBlob()), snapshot);
    const other = fresh({ clock: t.clock });
    assert.strictEqual(other.m.mergeBlob(JSON.parse(snapshot)), true);
    assert.deepStrictEqual(other.m.exportBlob(), JSON.parse(snapshot));
    assert.deepStrictEqual(other.m.get('world-country', 'France'), t.m.get('world-country', 'France'));
    assert.deepStrictEqual(other.m.streak(), t.m.streak());
    assert.deepStrictEqual(other.m.totals(), t.m.totals());
  });

  check('mergeBlob: missing or garbage input is ignored (returns false, changes nothing, never throws)', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    const before = t.storage.raw();
    const sets = t.storage.sets;
    const cyclic = {}; cyclic.items = cyclic; cyclic.days = cyclic;
    const hostile = { get items() { throw new Error('boom'); } };
    const garbage = [
      undefined, null, 0, 42, NaN, '', 'text', '{"v":2}', true, [], [1, 2], () => 1, new Date(), {},
      { v: 2 }, { items: 5 }, { v: 2, items: [], days: [] }, { v: 2, items: { s: 'x' }, days: 'y' },
      { v: 2, items: { s: { x: 'oops', y: [], z: [null], w: {} } } }, { v: 2, items: {}, days: { a: [1], 5: 7 } },
      { v: 99, items: { s: { q: [319, 5, 35, 9, 9] } } }, { v: 2, items: {}, days: {}, life: 'x' },
      cyclic, hostile
    ];
    garbage.forEach((g, i) => {
      assert.strictEqual(t.m.mergeBlob(g), false, 'case ' + i);
      assert.strictEqual(t.storage.raw(), before, 'case ' + i);
    });
    assert.strictEqual(t.m.mergeBlob(), false);
    assert.strictEqual(t.storage.sets, sets);
  });

  check('mergeBlob items: more answers wins; tie -> later last day; tie -> higher box', () => {
    const merged = (local, remote) => {
      const t = fresh({ seed: { v: 2, items: { s: { x: local } }, days: {} } });
      const changed = t.m.mergeBlob({ v: 2, items: { s: { x: remote } }, days: {} });
      return { item: t.m.exportBlob().items.s.x, changed: changed };
    };
    // [lastDay, box, first, streak, second, missed, dueFix]
    const twoToday = [319, 1, 2, 2], threeOlder = [310, 3, 3, 3];                 // 2 answers today vs 3 answers nine days ago
    assert.deepStrictEqual(merged(twoToday, threeOlder), { item: threeOlder, changed: true });
    assert.deepStrictEqual(merged(threeOlder, twoToday), { item: threeOlder, changed: false });
    const older = [300, 2, 2, 2], newer = [310, 1, 1, 0, 1];                      // 2 answers each
    assert.deepStrictEqual(merged(older, newer), { item: newer, changed: true });
    assert.deepStrictEqual(merged(newer, older), { item: newer, changed: false });
    const lowBox = [310, 1, 1, 0, 1], highBox = [310, 2, 2, 2];                   // 2 answers each, same day
    assert.deepStrictEqual(merged(lowBox, highBox), { item: highBox, changed: true });
    assert.deepStrictEqual(merged(highBox, lowBox), { item: highBox, changed: false });
    assert.deepStrictEqual(merged(highBox, highBox), { item: highBox, changed: false });
    // Beyond the three stated rules the choice is still the same from both sides
    const p = [310, 2, 1, 0, 1, 0, 2], q = [310, 2, 1, 1, 0, 1, 2];
    assert.deepStrictEqual(merged(p, q).item, merged(q, p).item);
  });

  check('mergeBlob items: new skills and names are added; histories are whole, never blended', () => {
    const t = fresh({ seed: { v: 2, items: { a: { x: [319, 1, 1, 0, 2, 3, 1] } }, days: {} } });
    assert.strictEqual(t.m.mergeBlob({ v: 2, items: { a: { x: [319, 5, 5, 5], y: [300, 2, 2, 2] }, b: { z: [10, 1, 0, 0, 0, 1, 1] } }, days: {} }), true);
    assert.deepStrictEqual(t.m.exportBlob().items, { a: { x: [319, 1, 1, 0, 2, 3, 1], y: [300, 2, 2, 2] }, b: { z: [10, 1, 0, 0, 0, 1, 1] } });
    assert.deepStrictEqual(t.m.skills().sort(), ['a', 'b']);
    assert.strictEqual(t.m.get('a', 'x').seen, 6);
  });

  check('mergeBlob days: element-wise max; new days added', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { 318: [1, 10, 10, 50], 319: [2, 10, 9, 100] } } });
    assert.strictEqual(t.m.mergeBlob({ v: 2, items: {}, days: { 319: [1, 30, 5, 400], 317: [1, 2, 3, 4] } }), true);
    assert.deepStrictEqual(t.m.exportBlob().days, { 317: [1, 2, 3, 4], 318: [1, 10, 10, 50], 319: [2, 30, 9, 400] });
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    assert.strictEqual(t.m.totals().games, 4);
    assert.strictEqual(t.m.totals().seconds, 454);
  });

  check('mergeBlob: returns true and saves only when something changed; merging twice is a no-op', () => {
    const a = fresh();
    a.m.record('s', 'x', 'first');
    a.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    const b = fresh();
    b.m.record('s', 'y', 'miss');
    const blob = b.m.exportBlob();
    const sets = a.storage.sets;
    assert.strictEqual(a.m.mergeBlob(blob), true);
    assert.strictEqual(a.storage.sets, sets + 1);
    assert.strictEqual(a.storage.json().items.s.y[5], 1);
    assert.strictEqual(a.m.mergeBlob(blob), false);
    assert.strictEqual(a.m.mergeBlob(a.m.exportBlob()), false);
    assert.strictEqual(a.m.mergeBlob({ v: 2, items: {}, days: {} }), false);
    assert.strictEqual(a.storage.sets, sets + 1);
    // A store loaded from a hand-made seed, never saved: an empty merge is still "no change"
    const seeded = fresh({ seed: { v: 2, items: { s: { x: [319, 1, 1, 1] } }, days: { 100: [1, 2, 2, 9], 319: [1, 1, 1, 1] } } });
    assert.strictEqual(seeded.m.mergeBlob({ v: 2, items: {}, days: {} }), false);
    assert.strictEqual(seeded.m.mergeBlob(seeded.m.exportBlob()), false);
    assert.deepStrictEqual(seeded.m.exportBlob().life, [2, 3, 3, 10, 2, 1, 319, 1]);
  });

  check('mergeBlob: keeps no reference to the remote object and does not modify it', () => {
    const t = fresh();
    const remote = { v: 2, items: { s: { x: [319, 2, 2, 2] } }, days: { 319: [1, 5, 4, 30] }, life: [1, 5, 4, 30, 1, 1, 319, 1] };
    const copy = plain(remote);
    t.m.mergeBlob(remote);
    assert.deepStrictEqual(remote, copy);
    remote.items.s.x[2] = 99;
    remote.days[319][0] = 99;
    remote.life[0] = 99;
    assert.strictEqual(t.m.get('s', 'x').first, 2);
    assert.strictEqual(t.m.totals().games, 1);
  });

  check('mergeBlob: accepts a blob in the v1 spec layout', () => {
    const t = fresh();
    t.m.record('s', 'x', 'first');
    assert.strictEqual(t.m.mergeBlob({ v: 1, items: { s: { x: [4, 3, 1, 0, 0, 2, 320, 319], y: [1, 1, 0, 0, 1, 1, 320, 319] } }, days: { 319: [1, 4, 3, 20] } }), true);
    assert.strictEqual(t.m.get('s', 'x').seen, 4);
    assert.strictEqual(t.m.get('s', 'x').box, 2);
    assert.strictEqual(t.m.get('s', 'y').due, 320);
    assert.deepStrictEqual(t.storage.json().items.s.x, [319, 2, 3, 0, 1, 0, 2]);
  });

  check('mergeBlob: a "__proto__" skill or name in the remote cannot pollute Object.prototype', () => {
    const t = fresh();
    const remote = JSON.parse('{"v":2,"items":{"__proto__":{"polluted":[319,1,1,1]},"s":{"__proto__":[319,1,1,1],"constructor":[319,1,0,0,0,1,1]}},"days":{"__proto__":[9,9,9,9]}}');
    assert.strictEqual(t.m.mergeBlob(remote), true);
    assert.strictEqual({}.polluted, undefined);
    assert.strictEqual(Object.prototype.polluted, undefined);
    assert.strictEqual(t.m.get('__proto__', 'polluted').first, 1);
    assert.strictEqual(t.m.get('s', '__proto__').first, 1);
    assert.strictEqual(t.m.get('s', 'constructor').missed, 1);
    assert.strictEqual(t.m.totals().games, 0);
    assert.strictEqual(Mastery.create({ storage: t.storage, now: t.clock }).get('__proto__', 'polluted').first, 1);
  });

  check('mergeBlob: lifetime tallies keep the larger of the two older histories and count the merged day rows on top', () => {
    const t = fresh({ seed: { v: 2, items: {}, days: { 319: [2, 20, 10, 100] }, life: [50, 500, 400, 9000, 30, 12, 319, 3] } });
    assert.strictEqual(t.m.mergeBlob({ v: 2, items: {}, days: { 318: [1, 5, 5, 20] }, life: [40, 900, 100, 100, 35, 5, 318, 9] }), true);
    // Before the rows: 48 games here, 39 there -> 48, plus the 3 games the merged rows show; likewise 895 + 25
    // questions, 390 + 15 first tries, 8900 + 120 seconds, 34 + 2 days. The runs overlap (317-319 here,
    // 310-318 there), so they are one run of ten days.
    assert.deepStrictEqual(t.m.exportBlob().life, [51, 920, 405, 9020, 36, 12, 319, 10]);
    assert.deepStrictEqual(t.m.totals(), { games: 51, questions: 920, firstTry: 405, seconds: 9020, daysActive: 36, itemsSeen: 0, itemsMastered: 0 });
    assert.deepStrictEqual(t.m.streak(), { current: 10, longest: 12 });
    // No lifetime row on either side: the day rows are the floor
    const u = fresh({ seed: { v: 2, items: {}, days: { 319: [2, 20, 10, 100] } } });
    u.m.mergeBlob({ v: 2, items: {}, days: { 318: [1, 5, 5, 20], 100: [4, 1, 1, 1] } });
    assert.deepStrictEqual(u.m.totals(), { games: 7, questions: 26, firstTry: 16, seconds: 121, daysActive: 3, itemsSeen: 0, itemsMastered: 0 });
    assert.deepStrictEqual(u.m.streak(), { current: 2, longest: 2 });
  });

  check('mergeBlob: rows older than 400 days arriving from another device are counted, then pruned', () => {
    const t = fresh();
    t.m.recordSession({ questions: 10, firstTry: 9, seconds: 60 });
    assert.strictEqual(t.m.mergeBlob({ v: 2, items: {}, days: { '-300': [3, 30, 20, 200], '-299': [1, 1, 1, 1], 310: [1, 5, 5, 5] } }), true);
    assert.deepStrictEqual(Object.keys(t.m.exportBlob().days).sort(), ['310', '319']);
    assert.deepStrictEqual(t.m.totals(), { games: 6, questions: 46, firstTry: 35, seconds: 266, daysActive: 4, itemsSeen: 0, itemsMastered: 0 });
    assert.strictEqual(t.m.streak().longest, 2);
    // Seeing the same old rows again adds nothing
    assert.strictEqual(t.m.mergeBlob({ v: 2, items: {}, days: { '-300': [3, 30, 20, 200], '-299': [1, 1, 1, 1] } }), false);
    assert.strictEqual(t.m.totals().games, 6);
  });

  check('streak across devices: alternating days through sync keeps one run', () => {
    let server = null;
    const clock = fakeClock(2026, 11, 1);
    const a = fresh({ clock: clock }), b = fresh({ clock: clock });
    const sync = t => { t.m.mergeBlob(server); server = plain(t.m.exportBlob()); };
    for (let i = 0; i < 6; i++) {
      const t = i % 2 ? b : a;
      if (i) clock.days(1);
      sync(t);                                   // pull on load
      t.m.recordSession({ questions: 5, firstTry: 5, seconds: 30 });
      sync(t);                                   // push after the game
    }
    sync(a);
    assert.deepStrictEqual(a.m.streak(), { current: 6, longest: 6 });
    assert.deepStrictEqual(b.m.streak(), { current: 6, longest: 6 });
    assert.strictEqual(a.m.totals().games, 6);
    assert.deepStrictEqual(a.m.exportBlob(), b.m.exportBlob());
  });

  check('streak across devices: days played offline on different devices join up when merged', () => {
    const clock = fakeClock(2026, 11, 10);
    const a = fresh({ clock: clock }), b = fresh({ clock: clock });
    a.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });       // Tue on A
    clock.days(1);
    a.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });       // Wed on A
    clock.days(1);
    b.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });       // Thu on B, which knows nothing of A
    assert.deepStrictEqual(b.m.streak(), { current: 1, longest: 1 });
    b.m.mergeBlob(a.m.exportBlob());
    a.m.mergeBlob(b.m.exportBlob());
    assert.deepStrictEqual(b.m.streak(), { current: 3, longest: 3 });
    assert.deepStrictEqual(a.m.streak(), { current: 3, longest: 3 });
    assert.strictEqual(b.m.totals().games, 3);
    assert.strictEqual(b.m.totals().daysActive, 3);
    clock.days(1);
    b.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.deepStrictEqual(b.m.streak(), { current: 4, longest: 4 });
  });

  check('streak: a row dated tomorrow (device one zone ahead) counts; one from a far-future clock does not hold it up', () => {
    const t = fresh();
    t.m.mergeBlob({ v: 2, items: {}, days: { 319: [1, 1, 1, 1], 320: [1, 1, 1, 1] } });
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 2 });
    const u = fresh();
    u.m.mergeBlob({ v: 2, items: {}, days: { 700: [1, 1, 1, 1] }, life: [1, 1, 1, 1, 1, 1, 700, 1] });
    assert.strictEqual(u.m.streak().current, 0);
    playDays(u, 2);
    assert.strictEqual(u.m.streak().current, 2);
    // A sane local run is not displaced by a remote one that ends in the future
    const w = fresh();
    playDays(w, 3);
    w.m.mergeBlob({ v: 2, items: {}, days: {}, life: [1, 1, 1, 1, 1, 1, 900, 40] });
    assert.deepStrictEqual(w.m.exportBlob().life.slice(6), [321, 3]);
    assert.strictEqual(w.m.streak().current, 3);
  });

  /* ----- Merge laws on random stores ----- */

  // A store with a random history of `span` days that ends where `endClock`
  // stands. Built in memory; cloneOf() puts it on a storage.
  function randomStore(rng, endClock, opts) {
    const span = opts.span;
    const clock = fakeClock(2026, 1, 1);
    clock.setMs(endClock());
    clock.days(-span);
    const t = fresh({ clock: clock, storage: null });
    const skills = ['world-country', 'flag', 'us-state'];
    const names = ['Chad', 'Mali', 'Peru', 'Laos', 'Fiji', 'Togo', 'Cuba', 'Oman'];
    for (let d = 0; d <= span; d++) {
      if (d) clock.days(1);
      if (rng() < opts.density) {
        const answers = 1 + Math.floor(rng() * 6);
        for (let i = 0; i < answers; i++) {
          t.m.record(skills[Math.floor(rng() * skills.length)], names[Math.floor(rng() * names.length)],
            Mastery.OUTCOMES[rng() < 0.6 ? 2 : rng() < 0.5 ? 1 : 0]);
        }
        if (rng() < 0.8) t.m.recordSession({ questions: answers, firstTry: Math.floor(rng() * (answers + 1)), seconds: Math.floor(rng() * 300) });
      }
    }
    clock.setMs(endClock());
    return t;
  }

  // A copy of a store on its own storage, as another device would hold it
  function cloneOf(t, clock) {
    return fresh({ seed: JSON.stringify(t.m.exportBlob()), clock: clock });
  }

  const laws = { commutes: 0, idempotent: 0, associates: 0, monotone: 0, trials: 0, firstError: null };
  (function runLaws() {
    const rng = mulberry32(20261116);
    const end = fakeClock(2027, 9, 1);
    const shapes = [{ span: 20, density: 0.7 }, { span: 120, density: 0.3 }, { span: 430, density: 0.9 }, { span: 520, density: 0.15 }, { span: 0, density: 0 }];
    for (let trial = 0; trial < 60; trial++) {
      laws.trials++;
      try {
        const pick = () => randomStore(rng, end, shapes[Math.floor(rng() * shapes.length)]);
        const A = pick(), B = pick(), C = pick();
        const a = A.m.exportBlob(), b = B.m.exportBlob(), c = C.m.exportBlob();

        const ab = cloneOf(A, end); ab.m.mergeBlob(b);
        const ba = cloneOf(B, end); ba.m.mergeBlob(a);
        assert.deepStrictEqual(ab.m.exportBlob(), ba.m.exportBlob());
        assert.deepStrictEqual(ab.m.streak(), ba.m.streak());
        assert.deepStrictEqual(ab.m.totals(), ba.m.totals());
        laws.commutes++;

        const once = ab.m.exportBlob();
        assert.strictEqual(ab.m.mergeBlob(b), false);
        assert.strictEqual(ab.m.mergeBlob(a), false);
        assert.strictEqual(ab.m.mergeBlob(once), false);
        assert.deepStrictEqual(ab.m.exportBlob(), once);
        const aa = cloneOf(A, end);
        assert.strictEqual(aa.m.mergeBlob(a), false);
        assert.deepStrictEqual(aa.m.exportBlob(), a);
        laws.idempotent++;

        const left = cloneOf(ab, end); left.m.mergeBlob(c);              // (A + B) + C
        const bc = cloneOf(B, end); bc.m.mergeBlob(c);
        const right = cloneOf(A, end); right.m.mergeBlob(bc.m.exportBlob());   // A + (B + C)
        assert.deepStrictEqual(left.m.exportBlob(), right.m.exportBlob());
        laws.associates++;

        // Merging never loses ground: every tally is at least what each side had
        const tm = left.m.totals();
        [A, B, C].forEach(x => {
          const tx = x.m.totals();
          Object.keys(tx).forEach(k => assert.ok(tm[k] >= tx[k] || k === 'itemsMastered', k));
          assert.ok(left.m.streak().longest >= x.m.streak().longest);
          x.m.skills().forEach(skill => Object.keys(x.m.levels(skill)).forEach(name => {
            assert.ok(left.m.get(skill, name).seen >= x.m.get(skill, name).seen);
          }));
        });
        laws.monotone++;
      } catch (e) {
        if (!laws.firstError) laws.firstError = e;
      }
    }
  })();

  check('merge is commutative: A+B equals B+A on ' + laws.trials + ' random pairs (pruned and unpruned)', () => {
    if (laws.firstError && laws.commutes < laws.trials) throw laws.firstError;
    assert.strictEqual(laws.commutes, laws.trials);
  });
  check('merge is idempotent: merging the same blob again, or a store with itself, changes nothing', () => {
    if (laws.firstError && laws.idempotent < laws.trials) throw laws.firstError;
    assert.strictEqual(laws.idempotent, laws.trials);
  });
  check('merge is associative: (A+B)+C equals A+(B+C)', () => {
    if (laws.firstError && laws.associates < laws.trials) throw laws.firstError;
    assert.strictEqual(laws.associates, laws.trials);
  });
  check('merge never loses ground: tallies, longest streak and per-item answers only grow', () => {
    if (laws.firstError) throw laws.firstError;
    assert.strictEqual(laws.monotone, laws.trials);
  });

  check('sync round trip the way the game does it: payload -> JSON -> mergeBlob on another device', () => {
    const a = fresh();
    climb(a, 'world-country', 'France', 2);
    a.m.recordSession({ questions: 10, firstTry: 7, seconds: 80 });
    const wire = JSON.stringify({ version: 1, mastery: a.m.exportBlob() });
    const b = fresh({ clock: a.clock });
    b.m.record('world-country', 'Chad', 'miss');
    assert.strictEqual(b.m.mergeBlob(JSON.parse(wire).mastery), true);
    assert.strictEqual(b.m.mergeBlob(JSON.parse('{}').mastery), false);       // older payloads have no mastery key
    assert.strictEqual(b.m.get('world-country', 'France').box, 2);
    assert.strictEqual(b.m.get('world-country', 'Chad').missed, 1);
    assert.strictEqual(b.m.totals().games, 1);
    a.m.mergeBlob(JSON.parse(JSON.stringify(b.m.exportBlob())));
    assert.deepStrictEqual(a.m.exportBlob(), b.m.exportBlob());
  });
}

/* ===== Day boundaries and DST (each check sets its own time zone) ===== */

function zoneChecks() {
  const zones = ['UTC', 'America/New_York', 'Europe/London', 'America/Santiago', 'Africa/Cairo', 'America/Havana',
    'Asia/Beirut', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kathmandu', 'Asia/Kolkata',
    'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/St_Johns'];

  check('time zone switching works in this node (the checks below depend on it)', () => {
    setZone('America/New_York');
    assert.strictEqual(new Date(2026, 0, 15).getTimezoneOffset(), 300);
    assert.strictEqual(new Date(2026, 6, 15).getTimezoneOffset(), 240);
    setZone('Pacific/Kiritimati');
    assert.strictEqual(new Date(2026, 0, 15).getTimezoneOffset(), -840);
    setZone('Asia/Kathmandu');
    assert.strictEqual(new Date(2026, 0, 15).getTimezoneOffset(), -345);
  });

  // Every 15 minutes for three years: the day number must step by exactly one,
  // exactly when the zone's own calendar date changes (per Intl, a separate
  // code path from the Date getters the module uses), and name that date.
  zones.forEach(tz => {
    check('local days in ' + tz + ': every 15 min of 2026-2028 lands on the right calendar date', () => {
      setZone(tz);
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      assert.match(fmt.format(0), /^19(69|70)-\d\d-\d\d$/);
      const start = Date.UTC(2025, 11, 31), end = Date.UTC(2029, 0, 2), step = 15 * 60000;
      let prevDay = null, changes = 0;
      for (let ms = start; ms <= end; ms += step) {
        const day = Mastery.dayNumber(ms);
        if (day !== prevDay) {
          const at = new Date(ms).toISOString();
          assert.strictEqual(Mastery.dayToDate(day), fmt.format(ms), 'date at ' + at);
          if (prevDay !== null) {
            assert.strictEqual(day, prevDay + 1, 'one step at ' + at);
            assert.strictEqual(Mastery.dayNumber(ms - 1), prevDay, 'the millisecond before ' + at);
            assert.strictEqual(fmt.format(ms - 1), Mastery.dayToDate(prevDay), 'the calendar agrees the millisecond before ' + at);
            changes++;
          }
          prevDay = day;
        } else if (ms % 21600000 === 0) {
          // No change of ours: four times a day, confirm the calendar hasn't moved either
          assert.strictEqual(Mastery.dayToDate(day), fmt.format(ms), 'date at ' + new Date(ms).toISOString());
        }
      }
      assert.ok(changes >= 1096 && changes <= 1098, 'saw ' + changes + ' midnights');
      assert.strictEqual(Mastery.dayNumber(new Date(2026, 0, 1, 12).getTime()), 0);
    });
  });

  check('New York spring forward (8 Mar 2026, 23 hours): one day, either side of the gap', () => {
    setZone('America/New_York');
    const d = (h, mi) => Mastery.dayNumber(new Date(2026, 2, 8, h, mi || 0).getTime());
    assert.strictEqual(Mastery.dayNumber(new Date(2026, 2, 7, 23, 59, 59, 999).getTime()), 65);
    assert.strictEqual(d(0), 66);
    assert.strictEqual(d(1, 59), 66);
    assert.strictEqual(d(3), 66);
    assert.strictEqual(d(23, 59), 66);
    assert.strictEqual(Mastery.dayNumber(new Date(2026, 2, 9, 0, 0).getTime()), 67);
    // The day is 23 hours long
    assert.strictEqual(new Date(2026, 2, 9).getTime() - new Date(2026, 2, 8).getTime(), 23 * 3600000);
  });

  check('New York fall back (1 Nov 2026, 25 hours): both 1:30s and the 25th hour are the same day', () => {
    setZone('America/New_York');
    const first130 = new Date(2026, 10, 1, 1, 30).getTime();
    const second130 = first130 + 3600000;
    assert.strictEqual(new Date(second130).getHours(), 1);
    assert.strictEqual(new Date(second130).getTimezoneOffset(), 300);
    assert.strictEqual(Mastery.dayNumber(first130), 304);
    assert.strictEqual(Mastery.dayNumber(second130), 304);
    const midnight = new Date(2026, 10, 1).getTime();
    assert.strictEqual(new Date(2026, 10, 2).getTime() - midnight, 25 * 3600000);
    assert.strictEqual(Mastery.dayNumber(midnight + 24 * 3600000 + 1800000), 304, '24.5 hours after midnight is still 1 Nov');
    assert.strictEqual(Mastery.dayNumber(midnight + 25 * 3600000), 305);
    assert.strictEqual(Mastery.dayNumber(midnight - 1), 303);
  });

  check('days whose midnight does not exist (Santiago, Cairo, Havana, Beirut) are still one day each', () => {
    let found = 0;
    ['America/Santiago', 'Africa/Cairo', 'America/Havana', 'Asia/Beirut'].forEach(tz => {
      setZone(tz);
      for (let i = 0; i < 365; i++) {
        const start = new Date(2026, 0, 1 + i, 0, 0);
        if (start.getHours() === 0) continue;
        found++;
        const day = Mastery.dayNumber(start.getTime());
        assert.strictEqual(day, i, tz + ' day ' + i);
        assert.strictEqual(Mastery.dayNumber(start.getTime() - 1), i - 1, tz + ' the instant before');
        assert.strictEqual(Mastery.dayNumber(new Date(2026, 0, 1 + i, 23, 59).getTime()), i);
        assert.strictEqual(Mastery.dayNumber(new Date(2026, 0, 2 + i, 12).getTime()), i + 1);
      }
    });
    assert.ok(found >= 2, 'expected at least two midnight-gap days in this tz database, found ' + found);
  });

  check('instance across the spring-forward night: due dates, rows and the streak stay on calendar days', () => {
    setZone('America/New_York');
    const t = fresh({ clock: fakeClock(2026, 3, 7, 23, 30) });
    t.m.record('s', 'x', 'first');                                  // Sat 7 Mar, due Sun 8 Mar
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 10 });
    assert.strictEqual(t.m.get('s', 'x').isDue, false);
    t.clock.set(2026, 3, 8, 0, 30);
    assert.strictEqual(t.m.get('s', 'x').isDue, true);
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 10 });
    t.clock.set(2026, 3, 8, 23, 30);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 10 });
    t.clock.set(2026, 3, 9, 0, 30);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 10 });
    assert.deepStrictEqual(t.m.activity(3).map(a => [a.date, a.games]), [['2026-03-07', 1], ['2026-03-08', 2], ['2026-03-09', 1]]);
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    assert.strictEqual(t.m.get('s', 'x').due, 66 + 3);
  });

  check('instance across the fall-back day: 25 hours of play is one row; the next row starts at midnight', () => {
    setZone('America/New_York');
    const t = fresh({ clock: fakeClock(2026, 10, 31, 23, 59) });
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    const midnight = new Date(2026, 10, 1).getTime();
    [0.5, 1.5, 2.5, 12, 24.9].forEach(h => {
      t.clock.setMs(midnight + h * 3600000);
      t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
      t.m.record('s', 'x', 'first');
    });
    assert.strictEqual(t.m.get('s', 'x').box, 1, 'five first-tries in one 25-hour day are one step');
    t.clock.setMs(midnight + 25 * 3600000 + 60000);
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
    assert.deepStrictEqual(t.m.activity(3).map(a => [a.date, a.games]), [['2026-10-31', 1], ['2026-11-01', 5], ['2026-11-02', 1]]);
    assert.deepStrictEqual(t.m.streak(), { current: 3, longest: 3 });
    const dates = t.m.activity(40).map(a => a.date);
    assert.strictEqual(new Set(dates).size, 40);
  });

  check('instance on a day with no midnight (Santiago, 6 Sep 2026)', () => {
    setZone('America/Santiago');
    const t = fresh({ clock: fakeClock(2026, 9, 5, 23, 59) });
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    t.m.record('s', 'x', 'miss');
    const before = t.m.today();
    t.clock.ms(60000);                                            // 23:59 + 1 min = 01:00 on the 6th
    assert.strictEqual(t.m.today(), before + 1);
    assert.strictEqual(t.m.activity(1)[0].date, '2026-09-06');
    t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    assert.strictEqual(t.m.record('s', 'x', 'first').box, 2);
    assert.deepStrictEqual(t.m.streak(), { current: 2, longest: 2 });
  });

  check('local, not UTC: at the same instant Kiritimati and Pago Pago are on different days', () => {
    const instant = Date.UTC(2026, 10, 16, 10, 30);
    setZone('Pacific/Kiritimati');
    const east = Mastery.dayNumber(instant);
    assert.strictEqual(Mastery.dayToDate(east), '2026-11-17');
    setZone('Pacific/Pago_Pago');
    const west = Mastery.dayNumber(instant);
    assert.strictEqual(Mastery.dayToDate(west), '2026-11-15');
    assert.strictEqual(east - west, 2);
    setZone('UTC');
    assert.strictEqual(Mastery.dayNumber(instant), 319);
  });

  check('a 400-day daily streak across four DST changes counts every day once', () => {
    setZone('Europe/London');
    const t = fresh({ clock: fakeClock(2026, 1, 1, 0, 10) });
    for (let i = 0; i < 400; i++) {
      if (i) t.clock.days(1);
      t.m.recordSession({ questions: 1, firstTry: 1, seconds: 1 });
    }
    assert.deepStrictEqual(t.m.streak(), { current: 400, longest: 400 });
    const act = t.m.activity(400);
    assert.ok(act.every(a => a.games === 1));
    assert.strictEqual(act[0].date, '2026-01-01');
    assert.strictEqual(act[399].date, '2027-02-04');
    assert.strictEqual(new Set(act.map(a => a.date)).size, 400);
  });
}

/* ===== Size and speed ===== */

// The game's real item names, if the repo is there to read (it is never written to)
function realGameNames() {
  try {
    const repo = process.env.ATLAS_REPO || path.resolve(__dirname, '../..');
    const html = fs.readFileSync(path.join(repo, 'public/index.html'), 'utf8');
    // Evaluates the object literal assigned to `const <name> = {...};`
    const literal = name => {
      let i = html.indexOf('{', html.indexOf('const ' + name + ' = '));
      const begin = i;
      let depth = 0, quote = null;
      for (; i < html.length; i++) {
        const c = html[i];
        if (quote) {
          if (c === '\\') i++;
          else if (c === quote) quote = null;
        } else if (c === '/' && html[i + 1] === '/') {
          i = html.indexOf('\n', i);
        } else if (c === '\'' || c === '"' || c === '`') {
          quote = c;
        } else if (c === '{') {
          depth++;
        } else if (c === '}' && --depth === 0) {
          break;
        }
      }
      return vm.runInNewContext('(' + html.slice(begin, i + 1) + ')');
    };
    const flat = lists => [].concat.apply([], Object.keys(lists).map(k => lists[k]));
    const countries = flat(literal('CONTINENTS'));
    const capitals = literal('US_CAPITALS');
    const sets = {
      'world-country': countries, flag: countries, capital: countries, name: countries,
      'us-state': Object.keys(capitals), 'us-capital': Object.keys(capitals).map(k => capitals[k]),
      'us-city': flat(literal('US_CITIES_BY_REGION')).map(c => c.name),
      'pin-city': flat(literal('PIN_CITIES')).map(c => c[0])
    };
    ['canada', 'china', 'india', 'russia'].forEach(c => {
      const topo = JSON.parse(fs.readFileSync(path.join(repo, 'public/data/provinces-' + c + '.json'), 'utf8'));
      sets['province:' + c] = [];
      Object.keys(topo.objects).forEach(k => topo.objects[k].geometries.forEach(g => sets['province:' + c].push(g.properties.name)));
    });
    const ok = Object.keys(sets).every(k => sets[k].length >= 10 && sets[k].every(n => typeof n === 'string' && n.length > 1));
    return ok ? sets : null;
  } catch (e) {
    return null;
  }
}

// Stand-in names: 1,100 items over twelve skills, mean length about 10
// characters (the game's own names average 9.2)
function syntheticNames(rng) {
  const sizes = {
    'world-country': 185, flag: 185, capital: 185, name: 185, 'us-state': 50, 'us-capital': 50,
    'us-city': 40, 'pin-city': 87, 'province:canada': 13, 'province:china': 33, 'province:india': 36, 'province:russia': 51
  };
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const sets = {};
  Object.keys(sizes).forEach(skill => {
    const had = new Set();
    while (had.size < sizes[skill]) {
      const len = 4 + Math.floor(rng() * 13);
      let n = '';
      for (let i = 0; i < len; i++) n += i === Math.floor(len / 2) && rng() < 0.3 ? ' ' : letters[Math.floor(rng() * 26)];
      had.add(n[0].toUpperCase() + n.slice(1));
    }
    sets[skill] = Array.from(had);
  });
  return sets;
}

// Plays `sets` over `span` days: every item answered between `least` and
// `most` times (80% first try, 12% second, 8% missed), with games logged on
// `activeShare` of the days
function buildBigStore(sets, rng, o) {
  const clock = fakeClock(2026, 1, 1);
  const m = Mastery.create({ storage: null, now: clock });
  const byDay = [];
  for (let d = 0; d < o.span; d++) byDay.push([]);
  let items = 0, chars = 0, answers = 0;
  Object.keys(sets).forEach(skill => sets[skill].forEach(name => {
    items++;
    chars += name.length;
    const n = o.least + Math.floor(rng() * (o.most - o.least + 1));
    answers += n;
    for (let i = 0; i < n; i++) byDay[Math.floor(rng() * o.span)].push([skill, name]);
  }));
  for (let d = 0; d < o.span; d++) {
    if (d) clock.days(1);
    byDay[d].forEach(a => {
      const r = rng();
      m.record(a[0], a[1], r < 0.8 ? 'first' : r < 0.92 ? 'second' : 'miss');
    });
    if (rng() < o.activeShare) {
      const games = 1 + Math.floor(rng() * 4);
      for (let g = 0; g < games; g++) m.recordSession({ questions: 10 + Math.floor(rng() * 190), firstTry: 5 + Math.floor(rng() * 5), seconds: 30 + Math.floor(rng() * 900) });
    }
  }
  return { m: m, clock: clock, items: items, meanName: chars / items, meanAnswers: answers / items };
}

// What the same history would take in the spec's wide item layout
function wideLayoutSize(blob) {
  const wide = { v: 1, items: {}, days: blob.days };
  Object.keys(blob.items).forEach(skill => {
    wide.items[skill] = {};
    Object.keys(blob.items[skill]).forEach(name => {
      const a = blob.items[skill][name];
      const first = a[2] || 0, second = a[4] || 0, missed = a[5] || 0;
      const dueIn = a[6] ? a[6] - 1 : Mastery.INTERVALS[a[1]];
      wide.items[skill][name] = [first + second + missed, first, second, missed, a[3] || 0, a[1], a[0] + dueIn, a[0]];
    });
  });
  return JSON.stringify(wide).length;
}

function sizeChecks() {
  setZone('UTC');
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  const ORDINARY = { span: 420, least: 1, most: 9, activeShare: 0.35 };    // a year of regular play
  const DEEP = { span: 420, least: 4, most: 25, activeShare: 0.35 };       // every item drilled again and again
  const WORST = { span: 460, least: 4, most: 25, activeShare: 1 };         // ...and a game logged on all 401 kept days
  const describe = big => {
    const blob = big.m.exportBlob();
    return big.items + ' items (names average ' + big.meanName.toFixed(1) + ' chars, ' + big.meanAnswers.toFixed(1) + ' answers each), ' +
      Object.keys(blob.days).length + ' day rows: ' + big.m.byteSize() + ' bytes = ' + kb(big.m.byteSize()) +
      '  [the spec\'s 8-field item layout: ' + kb(wideLayoutSize(blob)) + ']';
  };

  check('size: 1,100 items after a year of ordinary play stay under 35 KB (the spec asks for "well under 40 KB")', () => {
    const big = buildBigStore(syntheticNames(mulberry32(7)), mulberry32(11), ORDINARY);
    console.log('      ' + describe(big));
    assert.strictEqual(big.items, 1100);
    assert.strictEqual(big.m.totals().itemsSeen, 1100);
    assert.ok(big.meanName >= 9.2, 'stand-in names should be no shorter than the game\'s (9.0-9.2 chars)');
    assert.ok(big.m.byteSize() < 35 * 1024, big.m.byteSize() + ' bytes');
  });

  check('size: 1,100 items with deep histories (4-25 answers each) stay under 37 KB', () => {
    const big = buildBigStore(syntheticNames(mulberry32(7)), mulberry32(11), DEEP);
    console.log('      ' + describe(big));
    assert.strictEqual(big.m.totals().itemsSeen, 1100);
    assert.ok(big.m.byteSize() < 37 * 1024, big.m.byteSize() + ' bytes');
  });

  check('size: the worst case found (deep histories and a game logged on every one of 401 days) is about 40 KB, not under it', () => {
    const big = buildBigStore(syntheticNames(mulberry32(7)), mulberry32(13), WORST);
    console.log('      ' + describe(big));
    assert.strictEqual(Object.keys(big.m.exportBlob().days).length, 401);
    assert.strictEqual(big.m.streak().current, 460);
    assert.ok(big.m.byteSize() < 42 * 1024, big.m.byteSize() + ' bytes');
  });

  check('size: the same three histories over the game\'s own item names (read from the repo if present)', () => {
    const sets = realGameNames();
    if (!sets) {
      console.log('      SKIPPED: repo not found; set ATLAS_REPO to check against the real names');
      return;
    }
    const runs = [[ORDINARY, 17, 35], [DEEP, 17, 37], [WORST, 19, 42]].map(r => {
      const big = buildBigStore(sets, mulberry32(r[1]), r[0]);
      console.log('      ' + describe(big));
      return { big: big, limit: r[2] * 1024 * big.items / 1100 };
    });
    assert.ok(runs[0].big.items > 1000);
    runs.forEach(r => assert.ok(r.big.m.byteSize() < r.limit, r.big.m.byteSize() + ' bytes for ' + r.big.items + ' items'));
  });

  check('size: an untouched store is tiny, and a fresh item costs its name plus 15 bytes', () => {
    const t = fresh();
    assert.strictEqual(t.m.byteSize(), 28);
    t.m.record('world-country', 'France', 'first');
    const one = t.m.byteSize();
    t.m.record('world-country', 'Brazil', 'first');
    assert.strictEqual(t.m.byteSize() - one, '"Brazil":[319,1,1,1],'.length);
    assert.strictEqual(t.m.byteSize() - one, 'Brazil'.length + 15);
  });

  check('speed: record() on the full 1,100-item store, saving every time, stays cheap', () => {
    const storage = fakeStorage();
    const sets = syntheticNames(mulberry32(7));
    const big = buildBigStore(sets, mulberry32(11), DEEP);
    const m = Mastery.create({ storage: storage, now: big.clock });
    m.mergeBlob(big.m.exportBlob());
    const names = sets['world-country'];
    const n = 400;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) m.record('world-country', names[i % names.length], i % 7 ? 'first' : 'miss');
    const perRecord = Number(process.hrtime.bigint() - t0) / 1e6 / n;
    const t1 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) { m.summary('world-country', names); m.due('world-country', names); m.levels('world-country', names); }
    const perRead = Number(process.hrtime.bigint() - t1) / 1e6 / 600;
    const t2 = process.hrtime.bigint();
    for (let i = 0; i < 50; i++) Mastery.create({ storage: storage, now: big.clock });
    const perLoad = Number(process.hrtime.bigint() - t2) / 1e6 / 50;
    console.log('      on a ' + m.byteSize() + '-byte store: record() + save ' + perRecord.toFixed(3) + ' ms; summary/due/levels over 185 names ' +
      perRead.toFixed(3) + ' ms each; load ' + perLoad.toFixed(2) + ' ms');
    assert.strictEqual(storage.sets, n + 1);
    assert.ok(perRecord < 5, perRecord + ' ms per record');
    assert.ok(perRead < 2, perRead + ' ms per read');
    assert.ok(perLoad < 50, perLoad + ' ms per load');
  });
}

/* ===== Run ===== */

const HOME_ZONE = 'America/New_York';
const OTHER_ZONES = ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'America/Santiago', 'Europe/London'];

console.log('--- suite (time zone ' + HOME_ZONE + ') ---');
setZone(HOME_ZONE);
suite();

console.log('--- day boundaries and DST ---');
zoneChecks();

console.log('--- size and speed ---');
sizeChecks();

console.log('--- the whole suite again in other time zones ---');
OTHER_ZONES.forEach(tz => {
  const failedBefore = tally.failed, passedBefore = tally.passed;
  quiet = true;
  zoneFailures = [];
  setZone(tz);
  suite();
  quiet = false;
  const ran = tally.passed - passedBefore + tally.failed - failedBefore;
  if (tally.failed === failedBefore) console.log('PASS  suite in ' + tz + ' (' + ran + ' checks)');
  else console.log('FAIL  suite in ' + tz + ': ' + (tally.failed - failedBefore) + ' of ' + ran + ' checks\n      ' + zoneFailures.join('\n      '));
});

console.log('\n' + tally.passed + ' passed, ' + tally.failed + ' failed');
process.exitCode = tally.failed ? 1 : 0;
