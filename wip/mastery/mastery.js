/* =========================================================
 * MASTERY (per-item learning history, spaced review, daily activity)
 *
 * Pure logic, no DOM: storage and clock can be injected, so the same code
 * runs in the game and under node.
 *   const mastery = Mastery.create();   // the page's localStorage, the real clock
 *   const mastery = Mastery.create({ storage: fakeStorage, now: () => fakeMs });
 *
 * Storage shape under key "atlas-mastery" (synced; kept compact because it
 * shares the sync payload with every other store):
 * {
 *   v: 2,
 *   items: { "<skill>": { "<name>": [lastDay, box, first, streak, second, missed, dueFix] } },
 *   days:  { "<dayNumber>": [games, questions, firstTry, seconds] },
 *   life:  [games, questions, firstTry, seconds, daysActive, longestStreak, runEnd, runLength]
 * }
 * - skill is an opaque string chosen by the game ("world-country", "flag",
 *   "province:china", ...); name is the game's canonical name.
 * - dayNumber = whole local-calendar days since 2026-01-01.
 * - Trailing zeros of an item are dropped, and only seen items are stored.
 *   seen = first + second + missed. An item is due INTERVALS[box] days after
 *   lastDay unless dueFix says otherwise: dueFix n > 0 means n - 1 days after.
 * - days keeps the last 400 days. life holds the lifetime tallies, so totals
 *   and streaks don't shrink when old rows are pruned; runLength is the run
 *   of active days ending on runEnd.
 * - An item written in the wide v: 1 layout, [seen, first, second, missed,
 *   streak, box, dueDay, lastDay], is read too (its eight fields give it
 *   away) and rewritten in this layout on the next save.
 *
 * Scheduling (Leitner): a first-try answer moves an item up a box, at most
 * once per calendar day, and schedules it INTERVALS[box] days out. A
 * second-try answer caps it at box 2, due tomorrow. A miss or skip sends it
 * to box 1, due again straight away.
 * ========================================================= */

const Mastery = (function () {
  'use strict';

  const KEY = 'atlas-mastery';
  const VERSION = 2;
  const INTERVALS = [0, 1, 3, 7, 16, 35];        // days until the next review, by box
  const WEIGHTS = [0, 0.2, 0.45, 0.7, 0.9, 1];   // how much of "mastered" each box is worth
  const LEVELS = ['new', 'learning', 'familiar', 'mastered'];
  const OUTCOMES = ['miss', 'second', 'first'];  // indexed by points earned (0, 1, 2)
  const MAX_BOX = INTERVALS.length - 1;
  const KEEP_DAYS = 400;                         // day rows older than this are pruned
  const DAY_MS = 86400000;
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const COUNT_LIMIT = 1e9;                       // ceilings for numbers read from storage or sync
  const DAY_LIMIT = 1e6;

  // Item fields
  const LAST = 0, BOX = 1, FIRST = 2, STREAK = 3, SECOND = 4, MISSED = 5, DUE_FIX = 6;
  // Lifetime fields; 0-3 are the day-row fields in day-row order
  const DAYS_ACTIVE = 4, LONGEST = 5, RUN_END = 6, RUN_LEN = 7;

  /* ===== Days ===== */

  // Whole local-calendar days from 2026-01-01 to the day containing `ms`.
  // Counts calendar fields, not elapsed hours, so 23- and 25-hour DST days
  // and days whose midnight doesn't exist still come out as one day each.
  function dayNumber(ms) {
    const d = new Date(ms);
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH_UTC) / DAY_MS);
  }

  // 'YYYY-MM-DD' (local calendar) for a day number
  function dayToDate(day) {
    const ms = EPOCH_UTC + day * DAY_MS;
    return isFinite(ms) && Math.abs(ms) < 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : '';
  }

  /* ===== Store shape ===== */

  // Lookup table without Object.prototype, so a skill or name such as
  // "constructor" or "__proto__" is just another key
  function dict() {
    return Object.create(null);
  }

  function emptyStore() {
    return { v: VERSION, items: dict(), days: dict() };
  }

  // Non-negative whole number; 0 for anything else
  function count(v) {
    const n = Math.floor(Number(v));
    return n > 0 ? Math.min(n, COUNT_LIMIT) : 0;
  }

  // Whole day number (may be negative), or null if it isn't a number
  function dayValue(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.max(-DAY_LIMIT, Math.min(DAY_LIMIT, Math.floor(v)));
  }

  function isMap(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // Drops trailing zeros (in place)
  function trim(a) {
    let n = a.length;
    while (n > 1 && !a[n - 1]) n--;
    a.length = n;
    return a;
  }

  function seenOf(it) {
    return (it[FIRST] || 0) + (it[SECOND] || 0) + (it[MISSED] || 0);
  }

  function dueOf(it) {
    const fix = it[DUE_FIX] || 0;
    return it[LAST] + (fix ? fix - 1 : INTERVALS[it[BOX]]);
  }

  // The stored form of an item last answered on `last` and due `dueIn` days
  // later (capped, so an absurd due day reads back the way it was written)
  function pack(last, box, dueIn, first, streak, second, missed) {
    const wait = Math.min(dueIn, DAY_LIMIT - 1);
    return trim([last, box, first, streak, second, missed, wait === INTERVALS[box] ? 0 : wait + 1]);
  }

  function levelOf(box) {
    return box >= 4 ? LEVELS[3] : box >= 2 ? LEVELS[2] : LEVELS[1];
  }

  // A stored item from untrusted JSON, or null if it isn't one. Eight fields
  // mean the wide v1 layout [seen, first, second, missed, streak, box, dueDay,
  // lastDay]; the compact layout never has more than seven.
  function cleanItem(a) {
    if (!Array.isArray(a)) return null;
    const wide = a.length === 8;
    const last = dayValue(wide ? a[7] : a[LAST]);
    if (last === null) return null;
    const first = count(wide ? a[1] : a[FIRST]);
    const second = count(wide ? a[2] : a[SECOND]);
    let missed = count(wide ? a[3] : a[MISSED]);
    // Answers the three tallies don't account for can't have been first-try
    if (wide) missed += Math.max(0, count(a[0]) - first - second - missed);
    if (first + second + missed === 0) return null;
    const box = Math.max(1, Math.min(MAX_BOX, count(wide ? a[5] : a[BOX])));
    const streak = count(wide ? a[4] : a[STREAK]);
    let dueIn;
    if (wide) {
      const due = dayValue(a[6]);
      dueIn = due === null ? INTERVALS[box] : Math.max(0, due - last);
    } else {
      const fix = Math.min(count(a[DUE_FIX]), DAY_LIMIT);
      dueIn = fix ? fix - 1 : INTERVALS[box];
    }
    return pack(last, box, dueIn, first, streak, second, missed);
  }

  // A clean store from parsed JSON, or null if it isn't one (or is from a
  // version this code doesn't know). Copies everything, so the result shares
  // nothing with its input.
  function normalize(raw) {
    if (!isMap(raw)) return null;
    if (raw.v !== undefined && raw.v !== 1 && raw.v !== VERSION) return null;
    const st = emptyStore();

    if (isMap(raw.items)) {
      Object.keys(raw.items).forEach(skill => {
        const from = raw.items[skill];
        if (!isMap(from)) return;
        Object.keys(from).forEach(name => {
          const it = cleanItem(from[name]);
          if (it) (st.items[skill] || (st.items[skill] = dict()))[name] = it;
        });
      });
    }

    if (isMap(raw.days)) {
      Object.keys(raw.days).forEach(k => {
        const row = raw.days[k];
        // Only the way a day number is written out counts as one: "007" or
        // "-0" would land on another row's key
        if (!/^(0|-?[1-9]\d{0,5})$/.test(k) || !Array.isArray(row)) return;
        const clean = [count(row[0]), count(row[1]), count(row[2]), count(row[3])];
        if (clean[0] + clean[1] + clean[2] + clean[3] > 0) st.days[k] = clean;
      });
    }

    if (Array.isArray(raw.life)) {
      st.life = [];
      for (let i = 0; i <= LONGEST; i++) st.life[i] = count(raw.life[i]);
      const end = dayValue(raw.life[RUN_END]);
      st.life[RUN_END] = end === null ? -DAY_LIMIT : end;
      st.life[RUN_LEN] = count(raw.life[RUN_LEN]);
    }
    return st;
  }

  /* ===== Activity log: runs, lifetime tallies, pruning ===== */

  // Day numbers with at least one game, ascending
  function activeDays(st) {
    const out = [];
    for (const k in st.days) if (st.days[k][0] > 0) out.push(Number(k));
    return out.sort((a, b) => a - b);
  }

  // Every run of active days the store knows of, oldest first, as [first day,
  // last day] pairs: the runs in the day rows, the stored run (which can reach
  // back past the pruned rows) and, in a merge, the other device's stored run
  // (`other` is its lifetime row) - joined wherever they overlap or abut
  function runsOf(st, other) {
    const runs = [];
    activeDays(st).forEach(d => {
      const top = runs[runs.length - 1];
      if (top && d === top[1] + 1) top[1] = d;
      else runs.push([d, d]);
    });
    [st.life, other].forEach(life => {
      if (life && life[RUN_LEN] > 0) runs.push([life[RUN_END] - life[RUN_LEN] + 1, life[RUN_END]]);
    });
    runs.sort((a, b) => a[0] - b[0]);
    const joined = [];
    runs.forEach(r => {
      const top = joined[joined.length - 1];
      if (top && r[0] <= top[1] + 1) top[1] = Math.max(top[1], r[1]);
      else joined.push(r);
    });
    return joined;
  }

  // Sums of the day rows' four numbers, then the number of days with a game
  // (the first five lifetime fields, as far as the rows show them), over the
  // rows dated `from` or later, or over all of them
  function rowTotals(st, from) {
    const out = [0, 0, 0, 0, 0];
    for (const k in st.days) {
      if (from !== undefined && Number(k) < from) continue;
      for (let i = 0; i < 4; i++) out[i] += st.days[k][i];
      if (st.days[k][0] > 0) out[DAYS_ACTIVE]++;
    }
    return out;
  }

  // The first of the "recent" days: those whose rows every device still has.
  // The two oldest days a save keeps don't count, as a device one time zone
  // ahead has pruned them already.
  function recentFrom(today) {
    return today - KEEP_DAYS + 2;
  }

  // Brings the lifetime row into line with everything else the store holds:
  // tallies at least what the day rows show (so rows are counted before they
  // are pruned), and the stored run brought up to date, with `other`'s run
  // joined in when merging
  function settle(st, today, other) {
    if (!st.life && !Object.keys(st.days).length) return;
    const life = st.life || (st.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
    rowTotals(st).forEach((sum, i) => { life[i] = Math.max(life[i], sum); });
    // The recent rows spell out every run that began among them. The run to
    // remember is the one that began earlier: its first days are in no row,
    // and a day played on another device may yet join it to today. Failing
    // that, the latest run. No real run ends after tomorrow (where a device
    // one time zone ahead may already be), so one from a clock that ran fast
    // is cut back to tomorrow, or passed over if it starts later still.
    let early = null, latest = null, longest = life[LONGEST];
    runsOf(st, other).forEach(r => {
      longest = Math.max(longest, r[1] - r[0] + 1);
      if (r[0] < recentFrom(today)) early = r;
      if (r[0] <= today + 1) latest = r;
    });
    const run = early || latest;
    life[RUN_END] = run ? Math.min(run[1], today + 1) : -DAY_LIMIT;
    life[RUN_LEN] = run ? life[RUN_END] - run[0] + 1 : 0;
    life[LONGEST] = longest;
    life[DAYS_ACTIVE] = Math.max(life[DAYS_ACTIVE], longest);
    // Nothing is left above the ceiling it would be read back with
    for (let i = 0; i <= RUN_LEN; i++) {
      if (i !== RUN_END) life[i] = Math.min(life[i], COUNT_LIMIT);
    }
  }

  // Drops day rows more than KEEP_DAYS old. Returns true if any went.
  function pruneStore(st, today) {
    const cutoff = today - KEEP_DAYS;
    let changed = false;
    for (const k in st.days) {
      if (Number(k) < cutoff) {
        delete st.days[k];
        changed = true;
      }
    }
    return changed;
  }

  /* ===== Merging two stores ===== */

  // True if history `a` of an item should replace history `b`: more answers
  // wins, then the more recent, then the higher box. The remaining fields only
  // make the choice the same whichever side does the merging.
  function better(a, b) {
    const order = [seenOf(a) - seenOf(b), a[LAST] - b[LAST], a[BOX] - b[BOX]];
    [FIRST, STREAK, SECOND, DUE_FIX].forEach(i => order.push((a[i] || 0) - (b[i] || 0)));
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== 0) return order[i] > 0;
    }
    return false;
  }

  // Merges `src` into `dst`. `src` must be a normalize() result nobody else
  // holds: `dst` takes over its arrays, and both come out pruned as of `today`.
  function mergeStores(dst, src, today) {
    // What each side's lifetime tallies hold beyond its recent day rows. Both
    // sides are first brought to where a save today would leave them, so that
    // each has all of its recent rows and nothing older than a save keeps.
    const recent = recentFrom(today);
    const older = [dst, src].map(st => {
      settle(st, today);
      pruneStore(st, today);
      return rowTotals(st, recent).map((sum, i) => (st.life ? st.life[i] - sum : 0));
    });

    for (const skill in src.items) {
      const from = src.items[skill];
      const to = dst.items[skill] || (dst.items[skill] = dict());
      for (const name in from) {
        if (!to[name] || better(from[name], to[name])) to[name] = from[name];
      }
    }
    for (const k in src.days) {
      const mine = dst.days[k], theirs = src.days[k];
      if (!mine) dst.days[k] = theirs;
      else for (let i = 0; i < 4; i++) mine[i] = Math.max(mine[i], theirs[i]);
    }
    if (src.life) {
      const life = dst.life || (dst.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
      // The older history is taken to be one both devices share (the larger
      // count of the two) and the recent rows, now merged, are counted on top:
      // games played on one device before it saw the other's are added, not
      // swallowed by the larger total
      rowTotals(dst, recent).forEach((sum, i) => { life[i] = Math.max(older[0][i], older[1][i]) + sum; });
      life[LONGEST] = Math.max(life[LONGEST], src.life[LONGEST]);
    }
    // The two devices' runs are one run if the days they cover meet, which
    // settle() works out from both stored runs and the merged day rows
    settle(dst, today, src.life);
  }

  /* ===== Instance ===== */

  function defaultStorage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
      return null;
    }
  }

  // options: storage (getItem/setItem/removeItem; default localStorage, null =
  // memory only), now (ms clock; default Date.now), key, promote ('daily', the
  // default = a box gained at most once per calendar day; 'always' = every
  // first-try answer gains one)
  function create(options) {
    const opts = options || {};
    const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const key = opts.key || KEY;
    const promoteAlways = opts.promote === 'always';

    let store = emptyStore();
    let lastRaw = null;    // what storage held when we last read or wrote it
    let dirty = false;     // true while the latest save hasn't reached storage
    let trusted = false;   // true once storage has handed back what was saved
    let tidied = null;     // the day the tallies and pruning were last brought up to date

    // A clock that throws, or hands back something Date can't hold, is
    // replaced by the real one
    function today() {
      let day;
      try { day = dayNumber(Number(now())); } catch (e) { day = NaN; }
      return isFinite(day) ? day : dayNumber(Date.now());
    }

    // The stored string, null if there is none, undefined if storage can't be read
    function read() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(key);
        return typeof raw === 'string' ? raw : null;
      } catch (e) {
        return undefined;
      }
    }

    function parse(raw) {
      try {
        return normalize(JSON.parse(raw));
      } catch (e) {
        return null;
      }
    }

    function persist(raw) {
      if (!storage) return;
      try {
        storage.setItem(key, raw);
        lastRaw = raw;
        dirty = false;
      } catch (e) {
        dirty = true;   // storage full or blocked: carry on in memory
        return;
      }
      // A storage that doesn't hand back what it was given (a stub, some
      // private modes) reads as empty forever; reload() must not take that
      // for another tab wiping the store
      if (!trusted) trusted = read() === raw;
    }

    // Settles the lifetime tallies and prunes old day rows, once per calendar
    // day: after that, writes and merges keep the tallies in step themselves
    // and no row can age past the cutoff until the date changes. Returns true
    // if rows were pruned.
    function tidy() {
      const day = today();
      if (tidied === day) return false;
      settle(store, day);
      tidied = day;
      return pruneStore(store, day);
    }

    function save() {
      tidy();
      if (storage) persist(JSON.stringify(store));
    }

    // Picks up what another tab wrote since we last looked, so two tabs don't
    // overwrite each other: its data is merged in, and a wiped store empties
    // ours. Runs before every write; call it on the window's "storage" event
    // to refresh what the read methods see. Returns true if storage had changed.
    function reload() {
      const raw = read();
      if (raw === undefined || raw === lastRaw) return false;
      if (raw === null) {
        if (!trusted) return false;
        store = emptyStore();
      } else {
        trusted = true;
        const other = parse(raw);
        if (other) mergeStores(store, other, today());
      }
      lastRaw = raw;
      return true;
    }

    function lookup(skill, name) {
      const bySkill = store.items[skill];
      return (bySkill && bySkill[name]) || null;
    }

    // The names a query covers: the caller's list without repeats, or every
    // stored name of the skill when no list is given
    function nameList(skill, names) {
      if (!Array.isArray(names)) return Object.keys(store.items[skill] || {});
      const had = new Set();
      return names.filter(n => typeof n === 'string' && !had.has(n) && had.add(n));
    }

    function view(it, day) {
      if (!it) {
        return {
          seen: 0, first: 0, second: 0, missed: 0, streak: 0, box: 0,
          due: null, last: null, accuracy: null, level: LEVELS[0], isDue: false
        };
      }
      const first = it[FIRST] || 0, second = it[SECOND] || 0, missed = it[MISSED] || 0;
      const seen = first + second + missed;
      const dueDay = dueOf(it);
      return {
        seen: seen, first: first, second: second, missed: missed,
        streak: it[STREAK] || 0, box: it[BOX], due: dueDay, last: it[LAST],
        accuracy: first / seen, level: levelOf(it[BOX]), isDue: dueDay <= day
      };
    }

    function dayView(day) {
      const row = store.days[day] || [0, 0, 0, 0];
      return { day: day, date: dayToDate(day), games: row[0], questions: row[1], firstTry: row[2], seconds: row[3] };
    }

    // ---- Writing ----

    // Records one answer: outcome is 'first' (right first try), 'second'
    // (right second try) or 'miss' (missed twice, or skipped). Returns the
    // item as get() would. An unknown outcome changes nothing; a skill or
    // name that isn't a non-empty string returns null.
    function record(skill, name, outcome) {
      if (typeof skill !== 'string' || !skill || typeof name !== 'string' || !name) return null;
      if (OUTCOMES.indexOf(outcome) < 0) return get(skill, name);
      reload();
      const day = today();
      const it = lookup(skill, name);
      let box = it ? it[BOX] : 0;
      let first = it ? it[FIRST] || 0 : 0, second = it ? it[SECOND] || 0 : 0, missed = it ? it[MISSED] || 0 : 0;
      let inARow = it ? it[STREAK] || 0 : 0;
      let dueDay;

      if (outcome === 'first') {
        first++;
        inARow++;
        if (promoteAlways || !it || it[LAST] !== day) {
          box = Math.min(MAX_BOX, box + 1);
          dueDay = day + INTERVALS[box];
        } else {
          // Already answered today: repeating it the same day earns no second
          // step up, but it does clear an item that was due
          dueDay = Math.max(dueOf(it), day + 1);
        }
      } else if (outcome === 'second') {
        second++;
        inARow = 0;
        box = Math.max(1, Math.min(box, 2));
        dueDay = day + 1;
      } else {
        missed++;
        inARow = 0;
        box = 1;
        dueDay = day;
      }

      const next = pack(day, box, dueDay - day, first, inARow, second, missed);
      (store.items[skill] || (store.items[skill] = dict()))[name] = next;
      save();
      return view(next, day);
    }

    // Adds one finished game (or practice round) to today's row and to the
    // lifetime tallies. Returns today's row as activity() would.
    function recordSession(session) {
      const s = session || {};
      reload();
      const day = today();
      const row = store.days[day] || (store.days[day] = [0, 0, 0, 0]);
      const life = store.life || (store.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
      // A number that isn't finite is a bug in the caller, not a long game
      const amount = v => (isFinite(v) ? count(v) : 0);
      const add = [1, amount(s.questions), 0, amount(Math.round(Number(s.seconds)))];
      add[2] = Math.min(amount(s.firstTry), add[1]);
      if (row[0] === 0) life[DAYS_ACTIVE]++;
      for (let i = 0; i < 4; i++) {
        row[i] += add[i];
        life[i] += add[i];
      }
      settle(store, day);   // today joins the run that reached yesterday, or starts one

      save();
      return dayView(day);
    }

    // Folds another device's export into this store. Per item, the history
    // with more answers wins (then the more recent, then the higher box); day
    // rows keep the larger of each number, and the lifetime tallies and the
    // streak follow from the merged rows. Returns true if this store changed.
    function mergeBlob(remote) {
      let other = null;
      try { other = normalize(remote); } catch (e) { /* not a store */ }
      if (!other) return false;
      reload();
      tidy();
      const before = JSON.stringify(store);
      mergeStores(store, other, tidied);
      const after = JSON.stringify(store);
      if (after !== before || dirty) persist(after);
      return after !== before;
    }

    // Drops day rows older than 400 days (their numbers stay in the lifetime
    // tallies). Runs on every save; returns true if any rows went.
    function prune() {
      tidied = null;
      const changed = tidy();
      if (changed) persist(JSON.stringify(store));
      return changed;
    }

    function reset() {
      store = emptyStore();
      dirty = false;
      lastRaw = null;
      if (!storage) return;
      try {
        if (typeof storage.removeItem === 'function') storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(store));
      } catch (e) {
        dirty = true;   // storage blocked: memory is cleared, and the next save that gets through replaces the rest
      }
      // Anything storage still holds is what was just wiped: reload() must
      // not take it for another tab's work and merge it back in
      const left = read();
      if (left !== undefined) lastRaw = left;
    }

    // Saves are immediate, so there is normally nothing to flush; this only
    // retries a save that storage refused
    function flush() {
      if (dirty) save();
    }

    // ---- Reading ----

    function get(skill, name) {
      return view(lookup(skill, name), today());
    }

    // Counts by level over `names`, how many are due, pooled first-try
    // accuracy (null until something is seen), and pct: the mean box weight,
    // 0-100 to one decimal
    function summary(skill, names) {
      const day = today();
      const list = nameList(skill, names);
      const out = { total: list.length, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0, accuracy: null, pct: 0 };
      let first = 0, answers = 0, weight = 0;
      list.forEach(name => {
        const it = lookup(skill, name);
        if (!it) {
          out.new++;
          return;
        }
        out.seen++;
        out[levelOf(it[BOX])]++;
        if (dueOf(it) <= day) out.due++;
        first += it[FIRST] || 0;
        answers += seenOf(it);
        weight += WEIGHTS[it[BOX]];
      });
      if (answers) out.accuracy = first / answers;
      if (list.length) out.pct = Math.round(weight / list.length * 1000) / 10;
      return out;
    }

    // Names due today or earlier: most overdue first, then lowest box, then
    // most missed. Never-seen names aren't due.
    function due(skill, names, query) {
      const day = today();
      const rows = [];
      nameList(skill, names).forEach((name, i) => {
        const it = lookup(skill, name);
        if (it && dueOf(it) <= day) rows.push({ name: name, due: dueOf(it), box: it[BOX], missed: it[MISSED] || 0, i: i });
      });
      rows.sort((a, b) => a.due - b.due || a.box - b.box || b.missed - a.missed || a.i - b.i);
      const limit = query ? query.limit : null;
      return (limit == null ? rows : rows.slice(0, count(limit))).map(r => r.name);
    }

    // Up to n names with the lowest first-try accuracy (ties: more misses, then
    // more recent), among those seen at least minSeen times. A name never
    // missed on the first try isn't weak, so it is left out unless
    // includePerfect is set.
    function weakest(skill, names, n, query) {
      const o = query || {};
      const minSeen = o.minSeen == null ? 2 : o.minSeen;
      const rows = [];
      nameList(skill, names).forEach((name, i) => {
        const it = lookup(skill, name);
        if (!it) return;
        const seen = seenOf(it), first = it[FIRST] || 0;
        if (seen < minSeen || (first === seen && !o.includePerfect)) return;
        rows.push({ name: name, accuracy: first / seen, missed: it[MISSED] || 0, last: it[LAST], i: i });
      });
      rows.sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || b.last - a.last || a.i - b.i);
      return (n == null ? rows : rows.slice(0, count(n))).map(r => r.name);
    }

    // { name: level } for colouring a map. Built from entries so that a name
    // such as "__proto__" becomes an ordinary key of the result.
    function levels(skill, names) {
      return Object.fromEntries(nameList(skill, names).map(name => {
        const it = lookup(skill, name);
        return [name, it ? levelOf(it[BOX]) : LEVELS[0]];
      }));
    }

    // The last `daysBack` days ending today, oldest first, quiet days included
    function activity(daysBack) {
      const n = Math.min(count(daysBack == null ? 30 : daysBack), 4000);
      const day = today();
      const out = [];
      for (let d = day - n + 1; d <= day; d++) out.push(dayView(d));
      return out;
    }

    // Days in a row with at least one game. `current` holds until the end of
    // the day after the last active day; `longest` is the lifetime best.
    // Tomorrow counts as "now" too: a device one time zone ahead may be there.
    function streak() {
      const day = today();
      let longest = store.life ? store.life[LONGEST] : 0;
      let current = 0;
      runsOf(store).forEach(r => {
        longest = Math.max(longest, r[1] - r[0] + 1);
        if (r[1] >= day - 1 && r[0] <= day + 1) current = Math.min(r[1], day + 1) - r[0] + 1;
      });
      return { current: current, longest: longest };
    }

    function totals() {
      const life = store.life || [0, 0, 0, 0, 0];
      const sums = [0, 0, 0, 0];
      let active = 0, itemsSeen = 0, itemsMastered = 0;
      for (const k in store.days) {
        for (let i = 0; i < 4; i++) sums[i] += store.days[k][i];
        if (store.days[k][0] > 0) active++;
      }
      for (const skill in store.items) {
        for (const name in store.items[skill]) {
          itemsSeen++;
          if (store.items[skill][name][BOX] >= 4) itemsMastered++;
        }
      }
      return {
        games: Math.max(life[0], sums[0]), questions: Math.max(life[1], sums[1]),
        firstTry: Math.max(life[2], sums[2]), seconds: Math.max(life[3], sums[3]),
        daysActive: Math.max(life[DAYS_ACTIVE], active),
        itemsSeen: itemsSeen, itemsMastered: itemsMastered
      };
    }

    function skills() {
      return Object.keys(store.items).filter(skill => Object.keys(store.items[skill]).length > 0);
    }

    // A detached copy of the whole store, for the sync payload
    function exportBlob() {
      reload();
      tidy();
      return JSON.parse(JSON.stringify(store));
    }

    function byteSize() {
      return JSON.stringify(store).length;
    }

    const stored = read();
    if (stored) {
      store = parse(stored) || emptyStore();
      lastRaw = stored;
      trusted = true;
    }

    return {
      record: record, recordSession: recordSession,
      get: get, summary: summary, due: due, weakest: weakest, levels: levels,
      activity: activity, streak: streak, totals: totals, skills: skills,
      exportBlob: exportBlob, mergeBlob: mergeBlob,
      prune: prune, byteSize: byteSize, reset: reset, flush: flush,
      reload: reload, today: today
    };
  }

  return {
    create: create,
    KEY: KEY, INTERVALS: INTERVALS, WEIGHTS: WEIGHTS, LEVELS: LEVELS, OUTCOMES: OUTCOMES,
    dayNumber: dayNumber, dayToDate: dayToDate
  };
})();

// Lets node load this file for its tests; a browser never takes this branch
if (typeof module !== 'undefined' && module.exports) module.exports = Mastery;
