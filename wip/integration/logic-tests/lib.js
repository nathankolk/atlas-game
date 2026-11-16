// Driver for the logic-stage checks: launches the app in the shared harness and plays rounds
// through the real DOM handlers (clicks on map features, choice buttons, city dots, the pin flow).
'use strict';

const path = require('path');
const S = path.resolve(__dirname, '..', '..', '..');
const { launch } = require(path.join(S, 'harness', 'atlas-harness.js'));

// Runs before the app's script. fast: shrink the game's delays so a long round takes seconds.
function initScript(opts) {
  if (opts.noPaint) {
    // The SVG map is rasterised in software here, which costs seconds per repaint of the detailed maps.
    // Hidden, it still lays out and takes dispatched events, so the game logic runs exactly the same.
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#world-map, #sat-canvas { visibility: hidden !important; }';
      document.head.appendChild(style);
    });
  }
  if (opts.fast) {
    const st = window.setTimeout;
    window.setTimeout = function (fn, ms) {
      const rest = Array.prototype.slice.call(arguments, 2);
      return st.apply(window, [fn, ms > 50 ? ms / (opts.fast === true ? 25 : opts.fast) : ms].concat(rest));
    };
  }
}

// Helpers living in the page, built on window.__atlas
function pageHelpers() {
  const A = window.__atlas;
  const st = A.state;
  const T = {};
  T.screen = () => (document.querySelector('.screen.active') || {}).id || null;
  T.byName = () => st.activeDataset === 'us' ? st.usFeatureByCanonical
    : st.activeDataset === 'province'
      ? st.provinceStores[st.currentProvinceRound.split('-')[0]].featureByCanonical
      : st.featureByCanonical;
  T.pathFor = (name) => {
    const f = T.byName().get(name);
    if (!f) return null;
    const raw = f.properties.name || f.properties.NAME;
    return document.querySelector('.country[data-fkey="' + CSS.escape('name:' + raw) + '"]');
  };
  T.click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  // An eligible, not-yet-answered feature other than the target
  T.wrongPath = () => {
    const target = T.pathFor(st.current);
    return Array.from(document.querySelectorAll('.country.eligible')).find(el =>
      el !== target && !el.classList.contains('completed-correct') && !el.classList.contains('completed-wrong')) || null;
  };
  T.snapshot = () => ({
    screen: T.screen(), current: st.current, locked: st.interactionLocked, mode: st.gameMode,
    seq: st.sequence.length, pinDone: st.pin ? st.pin.results.length : 0, pinPhase: st.pin ? st.pin.phase : null,
    queue: st.queue.length, learnPhase: st.learn ? st.learn.phase : null, learnLevel: st.learn ? st.learn.level : null,
    prompt: (document.getElementById('prompt-country') || {}).textContent,
    score: st.score, correct: st.correct, wrong: st.wrong, total: st.totalQuestions, practice: st.practice
  });
  // One attempt at the current question; right = true clicks the answer, false a wrong one.
  // Returns false if no wrong target exists.
  T.attempt = (right) => {
    const mode = st.gameMode;
    if (mode === 'us-state-to-capital') {
      const btns = Array.from(document.querySelectorAll('#choices-panel .choice-btn'));
      const capital = document.querySelector('#choices-panel .choice-btn') && btns.find(b => !b.disabled && (b.dataset.capital === T.capitalOf(st.current)) === right);
      if (!capital) return false;
      capital.click();
      return true;
    }
    if (mode === 'us-city') {
      const dots = Array.from(document.querySelectorAll('.city-dot'));
      const dot = right ? dots.find(d => d.getAttribute('data-city') === st.current)
        : dots.find(d => d.getAttribute('data-city') !== st.current &&
            !d.classList.contains('completed-correct') && !d.classList.contains('completed-wrong'));
      if (!dot) return false;
      T.click(dot);
      return true;
    }
    const el = right ? T.pathFor(st.current) : T.wrongPath();
    if (!el) return false;
    T.click(el);
    return true;
  };
  T.capitalOf = (stateName) => {
    // The correct button is the one the game marks; find it through a throwaway reveal-free lookup:
    // the choices panel holds 4 capitals, and the app's own table is closed over, so keep a copy.
    return T.CAPITALS[stateName];
  };
  T.CAPITALS = {
    'Alabama': 'Montgomery', 'Alaska': 'Juneau', 'Arizona': 'Phoenix', 'Arkansas': 'Little Rock', 'California': 'Sacramento',
    'Colorado': 'Denver', 'Connecticut': 'Hartford', 'Delaware': 'Dover', 'Florida': 'Tallahassee', 'Georgia': 'Atlanta',
    'Hawaii': 'Honolulu', 'Idaho': 'Boise', 'Illinois': 'Springfield', 'Indiana': 'Indianapolis', 'Iowa': 'Des Moines',
    'Kansas': 'Topeka', 'Kentucky': 'Frankfort', 'Louisiana': 'Baton Rouge', 'Maine': 'Augusta', 'Maryland': 'Annapolis',
    'Massachusetts': 'Boston', 'Michigan': 'Lansing', 'Minnesota': 'Saint Paul', 'Mississippi': 'Jackson',
    'Missouri': 'Jefferson City', 'Montana': 'Helena', 'Nebraska': 'Lincoln', 'Nevada': 'Carson City',
    'New Hampshire': 'Concord', 'New Jersey': 'Trenton', 'New Mexico': 'Santa Fe', 'New York': 'Albany',
    'North Carolina': 'Raleigh', 'North Dakota': 'Bismarck', 'Ohio': 'Columbus', 'Oklahoma': 'Oklahoma City',
    'Oregon': 'Salem', 'Pennsylvania': 'Harrisburg', 'Rhode Island': 'Providence', 'South Carolina': 'Columbia',
    'South Dakota': 'Pierre', 'Tennessee': 'Nashville', 'Texas': 'Austin', 'Utah': 'Salt Lake City', 'Vermont': 'Montpelier',
    'Virginia': 'Richmond', 'Washington': 'Olympia', 'West Virginia': 'Charleston', 'Wisconsin': 'Madison', 'Wyoming': 'Cheyenne'
  };
  // Client coordinates of a lon/lat on the map as drawn. Goes through the map group's own screen matrix,
  // which covers the zoom transform and the viewBox squeeze when the map area has changed height (B2).
  T.clientPoint = (lon, lat) => {
    const p = st.projection([lon, lat]);
    const pt = document.getElementById('world-map').createSVGPoint();
    pt.x = p[0];
    pt.y = p[1];
    const out = pt.matrixTransform(st.mapG.node().getScreenCTM());
    return { x: out.x, y: out.y };
  };
  T.ls = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return localStorage.getItem(key); } };
  window.__t = T;
}

// Small window by default: the SVG map is rasterised in software here, and paint time grows with its size
async function launchApp(opts) {
  opts = Object.assign({ width: 600, height: 460 }, opts || {});
  const h = await launch(opts);
  await h.context.addInitScript(initScript, { fast: opts.fast || false, noPaint: !!opts.noPaint });
  if (opts.beforeLoad) await opts.beforeLoad(h);
  await h.page.goto(h.url + (opts.query || ''));
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 20000 });
  await h.page.evaluate(pageHelpers);
  return h;
}

async function reloadApp(h, query) {
  await h.page.goto(h.url + (query || ''));
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 20000 });
  await h.page.evaluate(pageHelpers);
}

const snap = (page) => page.evaluate(() => window.__t.snapshot());

// Starts a round through startGame() and waits for its first prompt (or the Learn study panel)
async function startLevel(page, arg, startOpts) {
  await page.evaluate(([a, o]) => { window.__atlas.startGame(a, o || undefined); }, [arg, startOpts || null]);
  await page.waitForFunction(() => {
    const s = window.__t.snapshot();
    return s.screen === 'game-screen' && (s.current || s.learnPhase === 'study') && document.querySelector('#world-map g');
  }, null, { timeout: 30000 });
  return snap(page);
}

// Waits until the question that was showing has been replaced (next prompt, results, or a Learn study panel)
async function waitNext(page, before) {
  await page.waitForFunction((b) => {
    const s = window.__t.snapshot();
    if (s.screen !== 'game-screen') return true;
    if (s.learnPhase === 'study') return true;
    if (s.mode === 'city-pin') return s.pinDone > b.pinDone && s.pinPhase === 'reveal';
    return !s.locked && (s.seq > b.seq) && s.current;
  }, before, { timeout: 30000 });
  return snap(page);
}

// Answers the current question: 'first' | 'second' | 'miss' | 'skip'. Returns what was actually done.
async function answer(page, how) {
  const before = await snap(page);
  if (before.mode === 'city-pin') {
    if (how === 'skip') {
      await page.click('#skip-btn');
    } else {
      // first: on the city; second: about 300 km off (50 pts); miss: about 1,500 km off
      const offKm = how === 'first' ? 0 : how === 'second' ? 300 : 1500;
      const city = await page.evaluate(() => window.__pinCities[window.__atlas.state.current]);
      const dLat = offKm / 111.2 * (city.lat > 0 ? -1 : 1);
      const xy = await page.evaluate(([lon, lat]) => window.__t.clientPoint(lon, lat), [city.lon, city.lat + dLat]);
      // A dispatched click rather than a real one, so it also lands when the map is not painted
      await page.evaluate(([x, y]) => {
        document.getElementById('world-map').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      }, [xy.x, xy.y]);
      await page.waitForFunction(() => !document.getElementById('pin-btn').disabled, null, { timeout: 5000 });
      await page.click('#pin-btn');
    }
    await waitNext(page, before);
    await page.click('#pin-btn');   // Next / Finish
    await page.waitForFunction((b) => {
      const s = window.__t.snapshot();
      return s.screen !== 'game-screen' || (s.pinPhase === 'aim' && s.current !== b.current);
    }, before, { timeout: 30000 });
    return how;
  }
  let did = how;
  if (how === 'skip') {
    await page.click('#skip-btn');
  } else if (how === 'first') {
    await page.evaluate(() => window.__t.attempt(true));
  } else {
    const ok = await page.evaluate(() => window.__t.attempt(false));
    if (!ok) {
      // Nothing left to click wrongly: fall back to the nearest thing
      if (how === 'miss') { await page.click('#skip-btn'); did = 'skip'; } else { await page.evaluate(() => window.__t.attempt(true)); did = 'first'; }
    } else if (how === 'second') {
      await page.evaluate(() => window.__t.attempt(true));
    } else if (before.learnPhase !== 'quiz') {
      const again = await page.evaluate(() => window.__t.attempt(false));
      if (!again) await page.evaluate(() => { document.getElementById('skip-btn').click(); });
    }
  }
  await waitNext(page, before);
  return did;
}

// Plays the round in progress to its results screen. plan(i, name) -> 'first' | 'second' | 'miss' | 'skip'.
// Returns [{ name, outcome }] in the order asked.
async function playRound(page, plan) {
  const log = [];
  for (let i = 0; i < 2000; i++) {
    const s = await snap(page);
    if (s.screen !== 'game-screen') break;
    const want = plan ? plan(i, s.current) : 'first';
    const did = await answer(page, want);
    log.push({ name: s.current, outcome: did === 'skip' ? 'miss' : did });
  }
  await page.waitForFunction(() => window.__t.screen() === 'results-screen', null, { timeout: 30000 });
  return log;
}

// Pin the City needs the cities' coordinates, which the app keeps to itself: read them from the source
function pinCitiesFromSource() {
  const fs = require('fs');
  const src = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
  const m = src.match(/const PIN_CITIES = (\{[\s\S]*?\n  \});/);
  const table = eval('(' + m[1] + ')');
  const out = {};
  Object.keys(table).forEach(region => table[region].forEach(c => { out[c[0]] = { country: c[1], lat: c[2], lon: c[3], region: region }; }));
  return out;
}

async function installPinCities(page) {
  await page.evaluate((cities) => { window.__pinCities = cities; }, pinCitiesFromSource());
}

// Tiny assertion reporter
function reporter(title) {
  const r = { passed: 0, failed: 0 };
  r.check = (name, cond, detail) => {
    if (cond) { r.passed++; console.log('PASS  ' + name); }
    else { r.failed++; console.log('FAIL  ' + name + (detail !== undefined ? '\n      ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
  };
  r.eq = (name, got, want) => r.check(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
  r.done = () => { console.log('\n' + title + ': ' + r.passed + ' passed, ' + r.failed + ' failed'); return r.failed === 0; };
  return r;
}

module.exports = { S, launchApp, reloadApp, startLevel, answer, playRound, snap, installPinCities, pinCitiesFromSource, reporter, pageHelpers };
