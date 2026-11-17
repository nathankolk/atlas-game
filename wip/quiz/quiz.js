/* ===== QUIZ LOGIC (quiz.js): typed-answer matching, capital choices, flags, level lists. Pasted byte for byte from the tested module. ===== */
const Quiz = (function () {
  'use strict';

  const MAX_INPUT = 60;          // longer typed answers never match
  const NEAR_ONE = 6;            // a spelling this long forgives one edit
  const NEAR_TWO = 10;           // a spelling this long forgives two
  const MAX_REACH = 3;           // farthest edit distance the matcher ever needs to know about

  function own(obj, key) { return obj != null && Object.prototype.hasOwnProperty.call(obj, key); }
  function isString(v) { return typeof v === 'string'; }

  /* ===== QUIZ: text folding ===== */

  // Unicode property escapes are compiled at run time, so an engine without them falls back to
  // ASCII-only rules instead of failing to parse the whole script.
  function rx(source, fallback) {
    try { return new RegExp(source, 'gu'); } catch (e) { return new RegExp(fallback, 'g'); }
  }
  const RX_MARKS = rx('\\p{M}+', '[\\u0300-\\u036f]+');
  const RX_INVISIBLE = rx('\\p{Cf}+', '[\\u00ad\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\ufeff]+');
  const RX_SEPARATOR = rx('[\\s\\p{Z}\\p{Pd}\\u2212/_]+', '[\\s\\-\\u2010-\\u2015\\u2212/_]+');
  const RX_JUNK = rx('[^\\p{L}\\p{N} .]+|[\\u02b0-\\u02ff]+', '[^a-z0-9 .]+');
  // Letters NFKD leaves whole: sharp s, ae, oe, o-slash, d-stroke, eth, thorn, l-stroke, h-stroke,
  // dotless i, eng, t-stroke, kra
  const SPECIAL = {
    '\u00df': 'ss', '\u00e6': 'ae', '\u0153': 'oe', '\u00f8': 'o', '\u0111': 'd', '\u00f0': 'd', '\u00fe': 'th',
    '\u0142': 'l', '\u0127': 'h', '\u0131': 'i', '\u014b': 'n', '\u0167': 't', '\u0138': 'k'
  };
  const RX_SPECIAL = /[\u00df\u00e6\u0153\u00f8\u0111\u00f0\u00fe\u0142\u0127\u0131\u014b\u0167\u0138]/g;

  // Reduces a typed or stored name to the form names are compared in: lower case, no accents, no
  // punctuation, single spaces, "&" as "and", "st"/"st." as "saint", no leading "the".
  function fold(text) {
    if (!isString(text)) return '';
    let s = text.toLowerCase();
    // Plain letters and spaces (most typing) need none of the Unicode work.
    if (/[^a-z ]/.test(s)) {
      s = text.normalize('NFKD').toLowerCase();
      s = s.replace(RX_MARKS, '').replace(RX_INVISIBLE, '').replace(RX_SPECIAL, ch => SPECIAL[ch]);
      s = s.replace(/&/g, ' and ').replace(RX_SEPARATOR, ' ').replace(RX_JUNK, '');
      s = s.replace(/(^| )st\./g, '$1saint ').replace(/\./g, '');
    }
    s = s.replace(/ +/g, ' ').trim().replace(/(^| )st(?= |$)/g, '$1saint');
    return s.replace(/^(?:the )+/, '');
  }

  /* ===== QUIZ: typed answers ===== */

  // Real places that are not answers in the game. A typed decoy matches nothing, and a near match is
  // refused when the input is at least as close to a decoy as to the answer ("prussia" is not Russia,
  // "south amrica" is not South Africa).
  const DECOYS = Object.freeze((
    'andorra|liechtenstein|malta|monaco|san marino|singapore|maldives|seychelles|sao tome and principe|' +
    'sao tome|kiribati|marshall islands|micronesia|nauru|palau|samoa|tonga|tuvalu|vatican city|vatican|' +
    'greenland|puerto rico|guam|bermuda|aruba|curacao|martinique|guadeloupe|reunion|mayotte|hong kong|' +
    'macau|macao|tibet|gibraltar|england|scotland|wales|northern ireland|tahiti|hawaii|alaska|siberia|' +
    'sardinia|sicily|corsica|crete|tasmania|zanzibar|borneo|sumatra|java|bali|kashmir|kurdistan|' +
    'catalonia|bavaria|anguilla|montserrat|cayman islands|virgin islands|cook islands|faroe islands|' +
    'canary islands|american samoa|french polynesia|guiana|new guinea|papua|timor|sahara|korea|congo|' +
    'africa|asia|europe|oceania|antarctica|americas|north america|south america|central america|' +
    'latin america|north africa|west africa|east africa|central africa|southern africa|middle east|' +
    'arabia|scandinavia|balkans|iberia|caribbean|polynesia|melanesia|australasia|indochina|patagonia|' +
    'prussia|persia|siam|ceylon|zaire|rhodesia|yugoslavia|czechoslovakia|soviet union|ussr|bohemia|' +
    'abyssinia|formosa|mesopotamia|moldavia|transylvania|east germany|west germany|tanganyika|bengal|' +
    'malaya|slavonia|kampuchea|dahomey|gold coast|galicia|silesia|lapland|dalmatia'
  ).split('|'));

  // Words that turn a name into a different place when swapped for one another.
  const COMPASS = [['north', 'south', 'east', 'west'], ['northern', 'southern', 'eastern', 'western']];

  // Number of set bits in a 32-bit integer.
  function bitCount(x) {
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
  }

  // True Damerau-Levenshtein distance (insert, delete, substitute, swap two neighbours) between two
  // sequences of small integer codes. h is scratch space of at least (n + 2) * (m + 2) cells; last has
  // one cell per code and remembers the last row each code was seen in.
  function editDistance(a, n, b, m, h, last) {
    const w = m + 2, inf = n + m;
    last.fill(0);
    h[0] = inf;
    for (let i = 0; i <= n; i++) { h[(i + 1) * w] = inf; h[(i + 1) * w + 1] = i; }
    for (let j = 0; j <= m; j++) { h[j + 1] = inf; h[w + j + 1] = j; }
    for (let i = 1; i <= n; i++) {
      const ai = a[i - 1];
      let lastJ = 0;
      for (let j = 1; j <= m; j++) {
        const bj = b[j - 1];
        const i1 = last[bj], j1 = lastJ;
        let best = h[i * w + j];
        if (ai === bj) lastJ = j; else best++;
        const ins = h[(i + 1) * w + j] + 1;
        const del = h[i * w + j + 1] + 1;
        const swap = h[i1 * w + j1] + (i - i1 - 1) + 1 + (j - j1 - 1);
        if (ins < best) best = ins;
        if (del < best) best = del;
        if (swap < best) best = swap;
        h[(i + 1) * w + j + 1] = best;
      }
      last[ai] = i;
    }
    return h[(n + 1) * w + m + 1];
  }

  // Damerau-Levenshtein distance between two strings, compared as given (no folding).
  function distance(a, b) {
    a = String(a); b = String(b);
    const codes = new Map();
    const encode = s => {
      const out = new Uint16Array(s.length);
      for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        if (!codes.has(ch)) codes.set(ch, codes.size);
        out[i] = codes.get(ch);
      }
      return out;
    };
    const ca = encode(a), cb = encode(b);
    return editDistance(ca, ca.length, cb, cb.length, new Int32Array((ca.length + 2) * (cb.length + 2)), new Int32Array(codes.size + 1));
  }

  // Turns a list of names plus a { name: [spellings] } table into matcher entries.
  function entries(names, aliases) {
    return (Array.isArray(names) ? names : []).filter(isString).map(name => ({
      name: name,
      aliases: own(aliases, name) && Array.isArray(aliases[name]) ? aliases[name].filter(isString) : []
    }));
  }

  // Builds a typed-answer matcher for one level. list is [{ name, aliases }]; opts.restrictTo limits the
  // names that can be answers; opts.decoys replaces the built-in list of real places that are not answers.
  function matcher(list, opts) {
    opts = opts || {};
    if (!Array.isArray(list)) throw new TypeError('Quiz.matcher: entries must be an array');
    const names = [];
    const exact = new Map();       // folded spelling -> { entry, via }; entry is -1 for a decoy
    const texts = [];              // folded spellings, in the order the arrays below use
    const owners = [];             // entry index per spelling, -1 for a decoy

    // Registers one accepted spelling; two entries sharing one is a data bug.
    function accept(raw, entry, via) {
      const f = fold(raw);
      if (!f) throw new Error('Quiz.matcher: "' + raw + '" (' + names[entry] + ') has nothing left to match after folding');
      const seen = exact.get(f);
      if (seen) {
        if (seen.entry !== entry) {
          throw new Error('Quiz.matcher: "' + raw + '" (' + names[entry] + ') and ' + names[seen.entry] + ' share the spelling "' + f + '"');
        }
        return;
      }
      exact.set(f, { entry: entry, via: via });
      texts.push(f);
      owners.push(entry);
    }
    list.forEach((item, i) => {
      if (!item || !isString(item.name)) throw new TypeError('Quiz.matcher: entry ' + i + ' has no name');
      names.push(item.name);
      accept(item.name, i, 'name');
    });
    list.forEach((item, i) => {
      (Array.isArray(item.aliases) ? item.aliases : []).forEach(alias => {
        if (!isString(alias)) throw new TypeError('Quiz.matcher: ' + item.name + ' has an alias that is not a string');
        accept(alias, i, 'alias');
      });
    });
    const realCount = texts.length;

    // Decoys never displace an accepted spelling.
    function decoy(raw) {
      const f = fold(raw);
      if (!f || exact.has(f)) return;
      exact.set(f, { entry: -1, via: 'decoy' });
      texts.push(f);
      owners.push(-1);
    }
    (Array.isArray(opts.decoys) ? opts.decoys : DECOYS).forEach(d => { if (isString(d)) decoy(d); });
    for (let s = 0; s < realCount; s++) {
      const words = texts[s].split(' ');
      if (words.length < 2) continue;
      words.forEach((word, at) => {
        COMPASS.forEach(group => {
          if (group.indexOf(word) === -1) return;
          group.forEach(other => {
            if (other !== word) decoy(words.slice(0, at).concat(other, words.slice(at + 1)).join(' '));
          });
        });
      });
    }

    // Every proper prefix of an accepted spelling -> the one entry it belongs to, or -1 for several.
    const prefixOwner = new Map();
    for (let s = 0; s < realCount; s++) {
      for (let k = 1; k < texts[s].length; k++) {
        if (texts[s].charCodeAt(k - 1) === 32) continue;
        const p = texts[s].slice(0, k);
        const had = prefixOwner.get(p);
        if (had === undefined) prefixOwner.set(p, owners[s]);
        else if (had !== owners[s]) prefixOwner.set(p, -1);
      }
    }
    // True when f is also the start of a spelling of some entry other than this one.
    function startsAnother(f, entry) {
      const o = prefixOwner.get(f);
      return o !== undefined && o !== entry;
    }

    // Spellings as integer codes, a letter-set bitmask each, and buckets by length for the near search.
    const codeOf = new Map();
    texts.forEach(t => { for (let i = 0; i < t.length; i++) if (!codeOf.has(t.charCodeAt(i))) codeOf.set(t.charCodeAt(i), codeOf.size); });
    const unknown = codeOf.size;
    const ascii = new Int16Array(128).fill(unknown);
    codeOf.forEach((code, ch) => { if (ch < 128) ascii[ch] = code; });
    let maxLen = 0;
    const coded = [], masks = new Int32Array(texts.length), buckets = [];
    texts.forEach((t, s) => {
      const c = new Uint16Array(t.length);
      let mask = 0;
      for (let i = 0; i < t.length; i++) { c[i] = codeOf.get(t.charCodeAt(i)); mask |= 1 << (c[i] & 31); }
      coded.push(c);
      masks[s] = mask;
      (buckets[t.length] || (buckets[t.length] = [])).push(s);
      if (t.length > maxLen) maxLen = t.length;
    });
    const input = new Uint16Array(maxLen + MAX_REACH);
    const scratch = new Int32Array((maxLen + MAX_REACH + 2) * (maxLen + 2));
    const last = new Int32Array(unknown + 1);
    const slots = names.length + 1;                  // one per entry, plus one shared by all decoys
    const any = new Uint8Array(slots), long1 = new Uint8Array(slots), long2 = new Uint8Array(slots);

    let allowed = null;
    if (Array.isArray(opts.restrictTo)) {
      const wanted = new Set(opts.restrictTo);
      allowed = names.map(name => wanted.has(name));
    }

    // Index of the one entry the folded input is a forgivable misspelling of, or -1.
    function nearest(f) {
      const n = f.length;
      if (n < NEAR_ONE - 1 || n > maxLen + MAX_REACH) return -1;
      let mask = 0;
      for (let i = 0; i < n; i++) {
        const ch = f.charCodeAt(i);
        const code = ch < 128 ? ascii[ch] : (codeOf.has(ch) ? codeOf.get(ch) : unknown);
        input[i] = code;
        mask |= 1 << (code & 31);
      }
      any.fill(9); long1.fill(9); long2.fill(9);
      const top = Math.min(maxLen, n + MAX_REACH);
      for (let len = Math.max(1, n - MAX_REACH); len <= top; len++) {
        const bucket = buckets[len];
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const s = bucket[b];
          // Each edit changes the set of letters by at most two.
          if (bitCount(mask ^ masks[s]) > 2 * MAX_REACH) continue;
          const d = editDistance(input, n, coded[s], len, scratch, last);
          if (d > MAX_REACH) continue;
          const slot = owners[s] < 0 ? slots - 1 : owners[s];
          if (d < any[slot]) any[slot] = d;
          if (len >= NEAR_ONE && d < long1[slot]) long1[slot] = d;
          if (len >= NEAR_TWO && d < long2[slot]) long2[slot] = d;
        }
      }
      // One edit from exactly one entry, or failing that two edits from exactly one long name.
      let winner = -1, found = 0, reach = 1;
      for (let e = 0; e < names.length; e++) if (long1[e] <= 1) { winner = e; found++; }
      if (found === 0) {
        reach = 2;
        for (let e = 0; e < names.length; e++) if (long2[e] <= 2) { winner = e; found++; }
      }
      if (found !== 1) return -1;
      // Nothing else may be within one more edit, a decoy may not be as close, and the input may not be
      // the beginning of somebody else's name.
      for (let e = 0; e < names.length; e++) if (e !== winner && any[e] <= reach + 1) return -1;
      if (any[slots - 1] <= reach || startsAnother(f, winner)) return -1;
      return winner;
    }

    // Resolves a typed answer to an entry: { name, exact, via } for an answer, { name, outside: true }
    // for an exact name outside restrictTo, null otherwise. partial: true marks an exact match that is
    // also the start of another entry's name.
    function match(text) {
      if (!isString(text) || text.length > MAX_INPUT) return null;
      const f = fold(text);
      if (!f) return null;
      const hit = exact.get(f);
      if (hit) {
        if (hit.entry < 0) return null;
        const res = allowed && !allowed[hit.entry]
          ? { name: names[hit.entry], outside: true }
          : { name: names[hit.entry], exact: true, via: hit.via };
        if (startsAnother(f, hit.entry)) res.partial = true;
        return res;
      }
      const e = nearest(f);
      if (e < 0 || (allowed && !allowed[e])) return null;
      return { name: names[e], exact: false, via: 'near' };
    }

    return Object.freeze({ match: match, size: names.length });
  }

  /* ===== QUIZ: capitals ===== */

  // The [capital, code, alternates] row for a country, or null when the table has no usable one.
  function fact(facts, country) {
    if (!isString(country) || !own(facts, country)) return null;
    const row = facts[country];
    return Array.isArray(row) && isString(row[0]) && row[0] !== '' ? row : null;
  }

  // The capital to show and teach, plus the other cities that also count as right. null if unknown.
  function capitalOf(facts, country) {
    const row = fact(facts, country);
    if (!row) return null;
    return { capital: row[0], alternates: Array.isArray(row[2]) ? row[2].filter(isString) : [] };
  }

  // True when the text names the country's capital or one of its alternates.
  function isCapital(facts, country, text) {
    const c = capitalOf(facts, country);
    if (!c || !isString(text) || text.length > MAX_INPUT) return false;
    const f = fold(text);
    return f !== '' && (fold(c.capital) === f || c.alternates.some(a => fold(a) === f));
  }

  // Every country the city is an accepted capital of, in table order (Nicosia: Cyprus and Northern Cyprus).
  function capitalOwners(facts, capital) {
    const f = isString(capital) && capital.length <= MAX_INPUT ? fold(capital) : '';
    if (!f) return [];
    return Object.keys(facts || {}).filter(country => {
      const c = capitalOf(facts, country);
      return !!c && (fold(c.capital) === f || c.alternates.some(a => fold(a) === f));
    });
  }

  // The capital to name in the reverse mode. trivial: the city carries the country's own name.
  // accept: every country a tap should count as right for.
  function capitalPrompt(facts, country) {
    const c = capitalOf(facts, country);
    if (!c) return null;
    return { capital: c.capital, trivial: fold(c.capital) === fold(country), accept: capitalOwners(facts, c.capital) };
  }

  // Mulberry32: a seeded generator of numbers in [0, 1). A string seed is hashed with FNV-1a first.
  function rng(seed) {
    let a = 0;
    if (isString(seed)) {
      a = 2166136261;
      for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
    } else {
      a = Number(seed) || 0;
    }
    a >>>= 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // n shuffled capitals holding the answer once. Wrong options are first-listed capitals of countries in
  // pool, topped up from the whole table only when the pool runs dry. No option is an alternate capital
  // of the asked country, and no two options (or an option and an accepted answer) contain one another.
  function capitalChoices(facts, country, pool, random, n) {
    const asked = capitalOf(facts, country);
    if (!asked) return [];
    let want = Number.isFinite(n) ? Math.floor(n) : 4;
    if (want < 1) want = 1;
    const rand = typeof random === 'function' ? random : Math.random;
    // A generator that strays outside [0, 1) must not index outside the array.
    const pick = k => { const i = Math.floor(rand() * k); return i >= 0 && i < k ? i : 0; };
    const shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) { const j = pick(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    const avoid = [asked.capital].concat(asked.alternates).map(fold).filter(Boolean);
    const options = [];
    const draw = countries => {
      shuffle(countries);
      for (let i = 0; i < countries.length && options.length < want - 1; i++) {
        const city = capitalOf(facts, countries[i]).capital;
        const f = fold(city);
        if (!f || avoid.some(g => g.indexOf(f) !== -1 || f.indexOf(g) !== -1)) continue;
        options.push(city);
        avoid.push(f);
      }
    };
    const seen = new Set([country]);
    const usable = c => isString(c) && !seen.has(c) && capitalOf(facts, c) && seen.add(c);
    draw((Array.isArray(pool) ? pool : []).filter(usable));
    if (options.length < want - 1) draw(Object.keys(facts).filter(usable));
    options.push(asked.capital);
    return shuffle(options);
  }

  /* ===== QUIZ: flags ===== */

  const FLAG_FONT = 'Atlas Flags';
  const FLAG_FONT_STACK = "'Atlas Flags', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  // Codes with no flag to show: ISO private-use placeholders; codes the flag font has no picture for;
  // codes whose picture in the font is a flag the country has since replaced (Syria: the font still
  // draws the red-white-black flag with two green stars, replaced in 2025).
  const FLAG_PLACEHOLDERS = ['XS', 'XN'];
  const FLAG_NO_GLYPH = [];
  const FLAG_STALE = ['SY'];
  // Flags that differ only by a shade of blue: a question about one cannot count the other as wrong.
  const FLAG_TWINS = [['TD', 'RO'], ['ID', 'MC']];
  const FLAG_LOAD_TIMEOUT = 4000;
  let flagSupportPromise = null;

  // The flag emoji for an upper-case two-letter code: two regional-indicator symbols, or '' for
  // anything else and for the placeholder codes.
  function flagEmoji(iso2) {
    if (!isString(iso2) || !/^[A-Z]{2}$/.test(iso2) || FLAG_PLACEHOLDERS.indexOf(iso2) !== -1) return '';
    return String.fromCodePoint(0x1F1E6 + iso2.charCodeAt(0) - 65, 0x1F1E6 + iso2.charCodeAt(1) - 65);
  }

  // True when the country has a flag the flag font draws, and draws as the country flies it today.
  function hasFlag(facts, country) {
    const row = fact(facts, country);
    return !!row && flagEmoji(row[1]) !== '' && FLAG_NO_GLYPH.indexOf(row[1]) === -1 && FLAG_STALE.indexOf(row[1]) === -1;
  }

  // The flag to show for a country, or null when it has none. accept: every country a tap should count
  // as right for (Chad's flag also answers to Romania).
  function flagPrompt(facts, country) {
    if (!hasFlag(facts, country)) return null;
    const code = facts[country][1];
    const twins = [];
    FLAG_TWINS.forEach(pair => { if (pair.indexOf(code) !== -1) pair.forEach(other => { if (other !== code) twins.push(other); }); });
    const accept = [country].concat(Object.keys(facts).filter(c => c !== country && hasFlag(facts, c) && twins.indexOf(facts[c][1]) !== -1));
    return { flag: flagEmoji(code), accept: accept };
  }

  // Draws the flag for a code in black on a small canvas: true when it comes out as one glyph painted in
  // colours of its own (white counts) rather than two letters, boxes or nothing. Works on the raw code,
  // so it can also test placeholder codes.
  function flagDraws(doc, iso2) {
    try {
      const size = 32;
      const first = String.fromCodePoint(0x1F1E6 + iso2.charCodeAt(0) - 65);
      const second = String.fromCodePoint(0x1F1E6 + iso2.charCodeAt(1) - 65);
      const canvas = doc.createElement('canvas');
      canvas.width = size * 4;
      canvas.height = size * 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.font = size + 'px ' + FLAG_FONT_STACK;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      // A real flag is one glyph: clearly narrower than its two indicator letters set apart.
      const width = ctx.measureText(first + second).width;
      const apart = ctx.measureText(first).width + ctx.measureText(second).width;
      if (!(width > 0) || !(width < apart * 0.75)) return false;
      ctx.fillText(first + second, 4, size);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] >= 128 && Math.max(px[i], px[i + 1], px[i + 2]) >= 96) painted++;
      }
      return painted >= size * 2;
    } catch (e) {
      return false;
    }
  }

  // Resolves to how flags render in this browser: 'font' (the Atlas Flags web font drew them),
  // 'native' (the web font did not load but the system draws flags) or 'none'. Waits for the font load
  // to settle first. The answer is cached once the load has settled.
  function flagSupport(doc) {
    if (flagSupportPromise) return flagSupportPromise;
    if (!doc || typeof doc.createElement !== 'function') return Promise.resolve('none');
    const view = doc.defaultView;
    const later = view && typeof view.setTimeout === 'function' ? view.setTimeout.bind(view) : setTimeout;
    let loading;
    try {
      loading = doc.fonts && typeof doc.fonts.load === 'function'
        ? doc.fonts.load("32px '" + FLAG_FONT + "'", flagEmoji('FR'))
        : [];
    } catch (e) {
      loading = [];
    }
    const settled = Promise.resolve(loading).then(faces => (faces && faces.length > 0 ? 'loaded' : 'missing'), () => 'missing');
    const timeout = new Promise(resolve => later(() => resolve('slow'), FLAG_LOAD_TIMEOUT));
    const run = Promise.race([settled, timeout]).then(font => {
      // A load that has not settled may still succeed, so that answer is not kept.
      if (font === 'slow' && flagSupportPromise === run) flagSupportPromise = null;
      if (!flagDraws(doc, 'FR')) return 'none';
      return font === 'loaded' ? 'font' : 'native';
    });
    flagSupportPromise = run;
    return run;
  }

  /* ===== QUIZ: levels ===== */

  // Region name -> the hyphenated lower-case form used in level keys and links.
  function slug(region) { return fold(region).replace(/ /g, '-'); }

  const LEVEL_KINDS = [
    ['capital', 'capitals-', (facts, c) => !!capitalOf(facts, c)],
    ['capital-reverse', 'capitals-reverse-', (facts, c) => { const cap = capitalOf(facts, c); return !!cap && fold(cap.capital) !== fold(c); }],
    ['flag', 'flags-', hasFlag],
    ['name', 'name-', (facts, c) => fold(c) !== '']
  ];

  // One level per continent plus World for each kind of question, holding only the countries that kind
  // can ask about. Names keep the order of the continents table; a level with nothing to ask is left out.
  function levels(continents, facts) {
    const regions = [], world = [], inWorld = new Set();
    Object.keys(continents || {}).forEach(region => {
      if (!Array.isArray(continents[region])) return;
      const names = [], here = new Set();
      continents[region].forEach(name => {
        if (!isString(name) || here.has(name)) return;
        here.add(name);
        names.push(name);
        if (!inWorld.has(name)) { inWorld.add(name); world.push(name); }
      });
      regions.push([region, names]);
    });
    regions.push(['World', world]);
    const out = [];
    LEVEL_KINDS.forEach(kind => {
      regions.forEach(region => {
        const names = region[1].filter(name => kind[2](facts, name));
        if (names.length) out.push({ key: kind[1] + slug(region[0]), kind: kind[0], region: region[0], names: names });
      });
    });
    return out;
  }

  return Object.freeze({
    fold: fold, distance: distance, entries: entries, matcher: matcher, DECOYS: DECOYS,
    capitalOf: capitalOf, isCapital: isCapital, capitalOwners: capitalOwners, capitalPrompt: capitalPrompt,
    capitalChoices: capitalChoices, rng: rng,
    flagEmoji: flagEmoji, hasFlag: hasFlag, flagPrompt: flagPrompt, flagDraws: flagDraws, flagSupport: flagSupport,
    FLAG_FONT_STACK: FLAG_FONT_STACK, FLAG_NO_GLYPH: Object.freeze(FLAG_NO_GLYPH.slice()),
    FLAG_STALE: Object.freeze(FLAG_STALE.slice()),
    slug: slug, levels: levels
  });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Quiz;
/* ===== END QUIZ LOGIC (quiz.js) ===== */
