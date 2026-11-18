// Checks for the Explore view and for Learn on the continent levels and States.
//   NODE_PATH=/opt/node-tools/node_modules node check-explore.js [--mobile] [--only=name,name]
// Groups: nav, neighbours, select, search, colour, satellite, keys, roundtrip, links, stats, learn, nogl
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const chromium = require('playwright').chromium;
const stockLaunch = chromium.launch.bind(chromium);
chromium.launch = options => stockLaunch(Object.assign({}, options, {
  args: ((options && options.args) || []).concat(['--disable-gpu-compositing'])
}));
const lib = require(path.join(S, 'work/integration/logic-tests/lib.js'));
const args = process.argv.slice(2);
const MOBILE = args.includes('--mobile');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : null;
// --root=<dir> serves another copy of the app (to show a check failing on an earlier tree)
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || undefined;
const r = lib.reporter('explore' + (MOBILE ? ' (phone)' : ' (desktop)'));
const SEED = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-quiz.json'), 'utf8'));

async function open(opts) {
  opts = opts || {};
  const size = MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 };
  return lib.launchApp(Object.assign({
    seedStorage: Object.assign({ 'atlas-theme': 'light' }, opts.seed === null ? {} : (opts.seed || SEED), opts.extra || {}),
    fast: opts.fast || false,
    query: opts.query || '',
    root: ROOT
  }, size));
}
const st = (page, fn, arg) => page.evaluate(fn, arg);
// Waits until the globe has stopped moving and holds the map it was last given
async function still(page) {
  await page.evaluate(() => { window.__lastView = null; });
  await page.waitForFunction(() => {
    const A = window.__atlas, g = A.globe;
    if (!g || !A.map.drawn) return false;
    const v = g.getView();
    const key = v.lon.toFixed(5) + ',' + v.lat.toFixed(5) + ',' + v.k.toFixed(5);
    const same = window.__lastView === key;
    window.__lastView = key;
    return same;
  }, null, { timeout: 30000, polling: 350 });
}
// Waits for the globe to leave a view it was in, then to come to rest
async function moved(page, from) {
  await page.waitForFunction(v => {
    const now = window.__atlas.globe.getView();
    return Math.abs(now.lon - v.lon) > 1e-9 || Math.abs(now.lat - v.lat) > 1e-9 || Math.abs(now.k - v.k) > 1e-9;
  }, from, { timeout: 8000 }).catch(() => {});
  await still(page);
}
async function goExplore(page) {
  await page.evaluate(() => { location.hash = '#explore'; });
  await page.waitForFunction(() => document.body.dataset.screen === 'explore' && window.__atlas.explore.on, null, { timeout: 20000 });
  await still(page);
}
// Where a country's anchor is drawn now, in client px (null when it is round the back)
const pointOf = (page, name) => st(page, n => {
  const A = window.__atlas, g = A.globe;
  const p = g.project(g.anchor('world', A.explore.countries.get(n)[0]));
  const b = document.getElementById('explore-globe').getBoundingClientRect();
  return p.visible ? { x: b.left + p.x, y: b.top + p.y, z: p.z } : null;
}, name);
// Puts a country in the middle of the globe at a size that can be hit
const centreOn = (page, name, k) => st(page, ([n, zoom]) => {
  const A = window.__atlas, g = A.globe;
  const at = g.anchor('world', A.explore.countries.get(n)[0]);
  g.setView({ lon: at[0], lat: at[1], k: zoom });
}, [name, k || 3]);
const sel = page => st(page, () => window.__atlas.explore.selected);
const card = page => st(page, () => {
  const c = document.getElementById('place-card');
  if (c.hidden) return null;
  const text = q => { const el = c.querySelector(q); return el ? el.textContent.trim() : null; };
  return {
    name: text('.place-name'), continent: text('.place-head .eyebrow'), capital: text('.place-facts dd'),
    chips: Array.from(c.querySelectorAll('.chips .chip')).map(el => el.textContent.trim()),
    notes: Array.from(c.querySelectorAll('.place-note')).map(el => el.textContent.trim()),
    skills: Array.from(c.querySelectorAll('.place-skills li')).map(li => li.textContent.trim()),
    flag: !!c.querySelector('.place-flag'), button: text('.btn'), live: c.getAttribute('aria-live')
  };
});
// The colour of one screen pixel, read back through a canvas in the page
async function pixelAt(page, x, y) {
  const shot = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } });
  return st(page, async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, shot.toString('base64'));
}
const token = (page, name) => st(page, n => {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = getComputedStyle(document.getElementById('explore-stage')).getPropertyValue(n).trim();
  const s = ctx.fillStyle;
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}, name);
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const groups = {};

/* ----- nav: the fourth view, one globe ----- */
groups.nav = async () => {
  const h = await open();
  const page = h.page;
  const navs = await st(page, () => ({
    top: Array.from(document.querySelectorAll('#topnav-links a')).map(a => a.textContent.trim()),
    tabs: Array.from(document.querySelectorAll('#tabbar a')).map(a => a.textContent.trim()),
    views: window.__atlas.VIEWS.map(v => v.key)
  }));
  r.eq('nav: the top bar lists Home, Explore, Stats, Settings', navs.top, ['Home', 'Explore', 'Stats', 'Settings']);
  r.eq('nav: the tab bar lists the same four', navs.tabs, ['Home', 'Explore', 'Stats', 'Settings']);
  r.eq('nav: VIEWS order', navs.views, ['home', 'explore', 'stats', 'settings']);
  // A real click on the link that is on show at this size
  await page.click((MOBILE ? '#tabbar' : '#topnav-links') + ' a[data-view="explore"]');
  await page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 15000 });
  await still(page);
  const on = await st(page, () => ({
    hash: location.hash, screen: document.body.dataset.screen,
    active: (document.querySelector('.screen.active') || {}).id,
    current: Array.from(document.querySelectorAll('[aria-current="page"]')).map(a => a.dataset.view),
    canvases: document.querySelectorAll('canvas').length,
    inExplore: document.querySelectorAll('#explore-globe canvas').length,
    inGame: document.querySelectorAll('#globe-host canvas').length,
    status: document.getElementById('explore-status').hidden,
    navShown: getComputedStyle(document.querySelector(window.innerWidth > 760 ? '.topnav' : '.tabbar')).display !== 'none',
    titles: document.querySelectorAll('[title]').length
  }));
  r.eq('nav: the address says #explore', on.hash, '#explore');
  r.eq('nav: the Explore screen is the one on show', [on.screen, on.active], ['explore', 'explore-screen']);
  r.check('nav: the Explore link is marked current in both navigations', on.current.length === 2 && on.current.every(v => v === 'explore'), on.current);
  r.eq('nav: the globe\'s two canvases are in the Explore screen, and there are no others', [on.canvases, on.inExplore, on.inGame], [2, 2, 0]);
  r.check('nav: the loading line is gone and the navigation stays', on.status && on.navShown, on);
  r.eq('nav: no title= tooltips anywhere', on.titles, 0);
  const box = await st(page, () => {
    const s = document.getElementById('explore-stage').getBoundingClientRect(), g = document.getElementById('explore-globe').getBoundingClientRect();
    const v = window.__atlas.globe.getView(), hm = window.__atlas.explore.home;
    return { stage: [s.width, s.height], host: [g.width, g.height], atHome: Math.abs(v.k - hm.k) < 1e-6, radius: window.__atlas.globe.radiusPx() };
  });
  r.eq('nav: the globe\'s host fills the stage', box.host, box.stage);
  r.check('nav: the whole globe is in view at the opening', box.atHome && box.radius * 2 <= Math.min(box.stage[0], box.stage[1]), box);
  // Away and back
  await page.evaluate(() => { location.hash = '#stats'; });
  await page.waitForFunction(() => document.body.dataset.screen === 'stats');
  const away = await st(page, () => ({ on: window.__atlas.explore.on, inGame: document.querySelectorAll('#globe-host canvas').length, all: document.querySelectorAll('canvas').length }));
  r.eq('nav: leaving hands the globe back to the game\'s stage', away, { on: false, inGame: 2, all: 2 });
  r.eq('nav: no page errors', h.errors, []);
  await h.close();
};

/* ----- neighbours: the topology's borders against a hand-checked sample ----- */
groups.neighbours = async () => {
  const h = await open({ seed: null });
  const page = h.page;
  const all = await st(page, () => {
    const out = {};
    window.__atlas.state.neighbours.forEach((v, k) => { out[k] = v; });
    return out;
  });
  const names = Object.keys(all);
  r.eq('neighbours: one entry for each of the 184 countries on the map', names.length, 184);
  const asym = [];
  names.forEach(a => all[a].countries.forEach(b => {
    if (!all[b] || all[b].countries.indexOf(a) === -1) asym.push(a + ' -> ' + b);
    if (a === b) asym.push(a + ' lists itself');
  }));
  r.eq('neighbours: every border is listed from both sides, and no country borders itself', asym, []);
  // Checked by hand against an atlas, country by country
  const want = {
    'France': [['Belgium', 'Brazil', 'Germany', 'Italy', 'Luxembourg', 'Spain', 'Suriname', 'Switzerland'], ['Andorra', 'Monaco']],
    'Brazil': [['Argentina', 'Bolivia', 'Colombia', 'France', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'], []],
    'Suriname': [['Brazil', 'France', 'Guyana'], []],
    'Germany': [['Austria', 'Belgium', 'Czech Republic', 'Denmark', 'France', 'Luxembourg', 'Netherlands', 'Poland', 'Switzerland'], []],
    'Russia': [['Azerbaijan', 'Belarus', 'China', 'Estonia', 'Finland', 'Georgia', 'Kazakhstan', 'Latvia', 'Lithuania', 'Mongolia', 'North Korea', 'Norway', 'Poland', 'Ukraine'], []],
    'China': [['Afghanistan', 'Bhutan', 'India', 'Kazakhstan', 'Kyrgyzstan', 'Laos', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Pakistan', 'Russia', 'Tajikistan', 'Vietnam'], []],
    'India': [['Bangladesh', 'Bhutan', 'China', 'Myanmar', 'Nepal', 'Pakistan'], []],
    'Italy': [['Austria', 'France', 'Slovenia', 'Switzerland'], ['San Marino', 'Vatican City']],
    'Austria': [['Czech Republic', 'Germany', 'Hungary', 'Italy', 'Slovakia', 'Slovenia', 'Switzerland'], ['Liechtenstein']],
    'Spain': [['France', 'Morocco', 'Portugal'], ['Andorra']],
    'Morocco': [['Algeria', 'Spain', 'Western Sahara'], []],
    'Zambia': [['Angola', 'Botswana', 'Democratic Republic of the Congo', 'Malawi', 'Mozambique', 'Namibia', 'Tanzania', 'Zimbabwe'], []],
    'Botswana': [['Namibia', 'South Africa', 'Zambia', 'Zimbabwe'], []],
    'Democratic Republic of the Congo': [['Angola', 'Burundi', 'Central African Republic', 'Republic of the Congo', 'Rwanda', 'South Sudan', 'Tanzania', 'Uganda', 'Zambia'], []],
    'South Africa': [['Botswana', 'Eswatini', 'Lesotho', 'Mozambique', 'Namibia', 'Zimbabwe'], []],
    'Egypt': [['Israel', 'Libya', 'Palestine', 'Sudan'], []],
    'United States': [['Canada', 'Mexico'], []],
    'Indonesia': [['Malaysia', 'Papua New Guinea', 'Timor-Leste'], []],
    'United Kingdom': [['Ireland'], []],
    'Haiti': [['Dominican Republic'], []],
    'Cyprus': [['Northern Cyprus'], []],
    'Somalia': [['Ethiopia', 'Kenya', 'Somaliland'], []],
    'Turkey': [['Armenia', 'Azerbaijan', 'Bulgaria', 'Georgia', 'Greece', 'Iran', 'Iraq', 'Syria'], []],
    'Saudi Arabia': [['Iraq', 'Jordan', 'Kuwait', 'Oman', 'Qatar', 'United Arab Emirates', 'Yemen'], []],
    // Islands with no land border
    'Japan': [[], []], 'Iceland': [[], []], 'Madagascar': [[], []], 'Australia': [[], []], 'New Zealand': [[], []],
    'Sri Lanka': [[], []], 'Cuba': [[], []], 'Philippines': [[], []], 'Jamaica': [[], []], 'Taiwan': [[], []],
    'Bahrain': [[], []], 'Fiji': [[], []], 'Barbados': [[], []]
  };
  Object.keys(want).forEach(name => {
    r.eq('neighbours: ' + name, all[name] ? [all[name].countries, all[name].others] : null, want[name]);
  });
  const none = names.filter(n => !all[n].countries.length && !all[n].others.length).sort();
  // The atlas's island countries (and the two Koreas' neighbour Japan, Taiwan, the Falklands, New Caledonia)
  r.eq('neighbours: the countries with no land border are the atlas\'s islands', none, [
    'Antigua and Barbuda', 'Australia', 'Bahamas', 'Bahrain', 'Barbados', 'Cape Verde', 'Comoros', 'Cuba', 'Dominica', 'Falkland Islands', 'Fiji',
    'Grenada', 'Iceland', 'Jamaica', 'Japan', 'Madagascar', 'Mauritius', 'New Caledonia', 'New Zealand', 'Philippines', 'Saint Kitts and Nevis',
    'Saint Lucia', 'Saint Vincent and the Grenadines', 'Solomon Islands', 'Sri Lanka', 'Taiwan', 'Trinidad and Tobago', 'Vanuatu'
  ]);
  await h.close();
};

/* ----- select: tap, card, chips, close ----- */
groups.select = async () => {
  const h = await open();
  const page = h.page;
  await goExplore(page);
  r.eq('select: nothing is selected at first and the card is hidden', [await sel(page), await card(page)], [null, null]);
  // A real click on a country in the middle of the screen
  await centreOn(page, 'Brazil', 2);
  await still(page);
  let p = await pointOf(page, 'Brazil');
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  const cursor = await st(page, () => getComputedStyle(document.getElementById('explore-globe')).getPropertyValue('--globe-cursor').trim());
  r.eq('select: the pointer is a hand over a country', cursor, 'pointer');
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Brazil', null, { timeout: 5000 });
  await still(page);
  let c = await card(page);
  r.eq('select: a click on Brazil opens its card', [c.name, c.continent, c.capital], ['Brazil', 'South America', 'Brasília']);
  r.eq('select: the card lists its ten neighbours as chips', c.chips.length, 10);
  r.check('select: one line per skill, each with a standing', c.skills.length === 4 && /^Find on the globe/.test(c.skills[0]) && /^Name it/.test(c.skills[1]) &&
    /^Capital/.test(c.skills[2]) && /^Flag/.test(c.skills[3]) && c.skills.every(s => /(Mastered|Familiar|Learning|New|Not seen yet)/.test(s)), c.skills);
  r.eq('select: the card is a polite live region and names its continent\'s level', [c.live, c.button], ['polite', 'Open the South America level']);
  r.eq('select: the address names the country', await st(page, () => location.hash), '#explore=brazil');
  const clear = await st(page, () => {
    const cardBox = document.getElementById('place-card').getBoundingClientRect();
    return { card: [cardBox.left, cardBox.top, cardBox.right, cardBox.bottom], w: innerWidth, h: innerHeight };
  });
  p = await pointOf(page, 'Brazil');
  const covered = p && p.x >= clear.card[0] && p.x <= clear.card[2] && p.y >= clear.card[1] && p.y <= clear.card[3];
  r.check('select: the card does not cover the selected country', p && !covered, { p, clear });
  // A flag is drawn once its font is in
  await page.waitForFunction(() => { const f = document.querySelector('.place-flag'); return f && !f.classList.contains('is-waiting'); }, null, { timeout: 15000 }).catch(() => {});
  r.check('select: the card shows the flag', await st(page, () => { const f = document.querySelector('.place-flag'); return !!f && !f.classList.contains('is-waiting') && f.textContent.length > 0; }));
  // A neighbour's chip flies there and selects it
  await page.click('.place .chip[data-name="Peru"]');
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Peru');
  await still(page);
  c = await card(page);
  p = await pointOf(page, 'Peru');
  r.eq('select: a chip selects that neighbour', [c.name, c.capital], ['Peru', 'Lima']);
  r.check('select: and the globe has turned to it', !!p && p.z > 0.6 && p.x > 0 && p.x < clear.w && p.y > 0 && p.y < clear.h, p);
  r.eq('select: the address follows', await st(page, () => location.hash), '#explore=peru');
  // Facts from the data files
  await st(page, () => window.__atlas.selectCountry('South Africa'));
  c = await card(page);
  r.check('select: other capitals are listed after the first', c.capital.indexOf('Pretoria') === 0 && /also Cape Town and Bloemfontein/.test(c.capital), c.capital);
  await st(page, () => window.__atlas.selectCountry('France'));
  c = await card(page);
  r.check('select: France lists Brazil and Suriname, and says Andorra and Monaco are not in the atlas',
    c.chips.includes('Brazil') && c.chips.includes('Suriname') && c.notes.some(n => /Andorra and Monaco/.test(n)), c);
  await st(page, () => window.__atlas.selectCountry('Japan'));
  c = await card(page);
  r.check('select: an island country says it has no land borders', c.chips.length === 0 && c.notes.includes('No land borders.'), c);
  await st(page, () => window.__atlas.selectCountry('Syria'));
  c = await card(page);
  r.check('select: a country with no flag question shows no flag and says so on its line', !c.flag && /No question for it/.test(c.skills[3]), c);
  await still(page);
  // The close button, and a tap on the sea
  await page.click('.place-close');
  r.eq('select: the close button puts the card away', [await sel(page), await card(page), await st(page, () => location.hash)], [null, null, '#explore']);
  await st(page, () => window.__atlas.selectCountry('Madagascar'));
  await still(page);
  const sea = await st(page, () => {
    const g = window.__atlas.globe, b = document.getElementById('explore-globe').getBoundingClientRect();
    g.setView({ lon: -30, lat: 0, k: 3 });      // the middle of the Atlantic
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await still(page);
  await st(page, pt => {
    const host = document.getElementById('explore-globe');
    ['pointerdown', 'pointerup'].forEach(type => host.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, clientX: pt.x, clientY: pt.y
    })));
  }, sea);
  r.eq('select: a tap on the sea deselects', await sel(page), null);
  // Land that is no country of the atlas
  const green = await st(page, () => {
    const g = window.__atlas.globe, b = document.getElementById('explore-globe').getBoundingClientRect();
    g.setView({ lon: -42, lat: 72, k: 3 });     // Greenland
    const hit = g.featureAt(b.width / 2, b.height / 2, {});
    const host = document.getElementById('explore-globe');
    ['pointerdown', 'pointerup'].forEach(type => host.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2
    })));
    return { hit: hit && hit.key, selected: window.__atlas.explore.selected };
  });
  r.eq('select: Greenland is on the map but has no card', green, { hit: 'name:Greenland', selected: null });
  r.eq('select: no page errors', h.errors, []);
  await h.close();
};

/* ----- search ----- */
groups.search = async () => {
  const h = await open();
  const page = h.page;
  await goExplore(page);
  const find = text => st(page, t => window.__atlas.searchCountries(t).map(x => x.name), text);
  r.eq('search: "gui" lists the Guineas, names that start with it first', await find('gui'), ['Guinea', 'Guinea-Bissau', 'Equatorial Guinea', 'Papua New Guinea']);
  r.eq('search: accents and case make no difference', [(await find('CÔTE'))[0], (await find('côte d’ivoire'))[0], (await find('TÜRK'))[0] || null, (await find('sao'))[0] || null],
    ['Ivory Coast', 'Ivory Coast', (await find('turk'))[0] || null, (await find('são'))[0] || null]);
  r.eq('search: other spellings find their country', [(await find('holland'))[0], (await find('usa'))[0], (await find('burma'))[0], (await find('czechia'))[0]],
    ['Netherlands', 'United States', 'Myanmar', 'Czech Republic']);
  r.eq('search: a capital finds its country', [(await find('paris'))[0], (await find('ouaga'))[0]], ['France', 'Burkina Faso']);
  r.eq('search: nothing typed, nothing listed', [await find(''), await find('   '), await find('zzzz')], [[], [], []]);
  r.check('search: never more than six', (await find('a')).length === 6);
  // Through the field
  r.check('search: the field can be reached with the keyboard', await st(page, () => document.getElementById('explore-search').tabIndex >= 0));
  await page.click('#explore-search');
  await page.keyboard.type('nig', { delay: 20 });
  let ui = await st(page, () => {
    const input = document.getElementById('explore-search'), list = document.getElementById('explore-results');
    return {
      expanded: input.getAttribute('aria-expanded'), active: input.getAttribute('aria-activedescendant'), hidden: list.hidden,
      options: Array.from(list.querySelectorAll('[role="option"]')).map(li => li.firstChild.textContent + '|' + li.getAttribute('aria-selected'))
    };
  });
  r.eq('search: typing opens the list with the first result active', ui, {
    expanded: 'true', active: 'explore-result-0', hidden: false, options: ['Niger|true', 'Nigeria|false']
  });
  await page.keyboard.press('ArrowDown');
  ui = await st(page, () => document.getElementById('explore-search').getAttribute('aria-activedescendant'));
  r.eq('search: the down arrow moves to the next result', ui, 'explore-result-1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Nigeria');
  await still(page);
  const after = await st(page, () => ({
    value: document.getElementById('explore-search').value, list: document.getElementById('explore-results').hidden,
    focus: document.activeElement && document.activeElement.id, hash: location.hash
  }));
  r.eq('search: Enter selects it, clears the field and moves the focus to the card', after, { value: '', list: true, focus: 'place-card', hash: '#explore=nigeria' });
  const p = await pointOf(page, 'Nigeria');
  const cardBox = await st(page, () => { const b = document.getElementById('place-card').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
  r.check('search: the globe has flown there, clear of the card', !!p && p.z > 0.6 && !(p.x >= cardBox[0] && p.x <= cardBox[2] && p.y >= cardBox[1] && p.y <= cardBox[3]), { p, cardBox });
  // A click on a result
  await page.click('#explore-search');
  await page.keyboard.type('fiji', { delay: 20 });
  await page.click('#explore-results [role="option"]');
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Fiji');
  r.eq('search: a click on a result selects it', await sel(page), 'Fiji');
  // No match, then Escape
  await page.click('#explore-search');
  await page.keyboard.type('atlantis', { delay: 10 });
  ui = await st(page, () => ({ text: document.getElementById('explore-results').textContent.trim(), expanded: document.getElementById('explore-search').getAttribute('aria-expanded') }));
  r.eq('search: no match says so', ui, { text: 'No country by that name in this atlas', expanded: 'false' });
  await page.keyboard.press('Escape');
  r.eq('search: Escape clears the field first', [await st(page, () => document.getElementById('explore-search').value), await sel(page)], ['', 'Fiji']);
  await page.keyboard.press('Escape');
  r.eq('search: and then closes the card', await sel(page), null);
  r.eq('search: no page errors', h.errors, []);
  await h.close();
};

/* ----- colour: mastery on the globe, the legend ----- */
groups.colour = async () => {
  const h = await open();
  const page = h.page;
  await goExplore(page);
  // What the globe was last told to show, style by key
  await st(page, () => {
    const g = window.__atlas.globe, set = g.setStyles;
    window.__styles = {};
    g.setStyles = function (layer, styles) { if (layer === 'world') window.__styles = Object.assign({}, styles); return set.apply(g, arguments); };
  });
  const options = await st(page, () => Array.from(document.querySelectorAll('[data-action="explore-colour"]')).map(b => b.textContent + '|' + b.getAttribute('aria-checked')));
  r.eq('colour: Plain, Find, Name, Capital, Flag; Plain to begin with', options, ['Plain|true', 'Find|false', 'Name|false', 'Capital|false', 'Flag|false']);
  r.check('colour: no legend while plain', await st(page, () => document.getElementById('explore-legend').hidden));
  for (const [key, skillNames] of [['country', 184], ['country-name', 184], ['capital', 184], ['flag', 181]]) {
    await page.click('[data-action="explore-colour"][data-value="' + key + '"]');
    const got = await st(page, k => {
      const A = window.__atlas;
      const legend = Array.from(document.querySelectorAll('#explore-legend > span')).map(s => s.textContent.trim());
      const counts = {};
      Object.keys(window.__styles).forEach(key2 => { counts[window.__styles[key2]] = (counts[window.__styles[key2]] || 0) + 1; });
      // Each country's style against its mastery level
      const want = { new: 'step0', learning: 'step1', familiar: 'step2', mastered: 'step3' };
      const wrong = [];
      A.explore.countries.forEach((keys, name) => {
        const item = A.mastery.get(k, name);
        keys.forEach(key2 => {
          const style = window.__styles[key2];
          if (style !== want[item.level] && style !== 'dim') wrong.push(name + ':' + style + '/' + item.level);
        });
      });
      const names = Object.keys(window.__styles).filter(key2 => /^step/.test(window.__styles[key2])).length;
      return { legend, counts, wrong, names, checked: document.querySelector('[data-action="explore-colour"][aria-checked="true"]').dataset.value,
        hidden: document.getElementById('explore-legend').hidden };
    }, key);
    const n = s => Number((got.legend.find(x => x.indexOf(s) === 0) || '').replace(/\D/g, ''));
    r.eq('colour ' + key + ': the control shows it and the legend is up', [got.checked, got.hidden], [key, false]);
    r.eq('colour ' + key + ': every country wears the step of its mastery', got.wrong, []);
    r.eq('colour ' + key + ': ' + skillNames + ' countries are coloured', got.names, skillNames);
    r.eq('colour ' + key + ': the legend counts what is on the globe',
      [n('Mastered'), n('Familiar'), n('Learning'), n('New')],
      [got.counts.step3 || 0, got.counts.step2 || 0, got.counts.step1 || 0, got.counts.step0 || 0]);
    r.eq('colour ' + key + ': the legend adds up to the skill\'s countries', n('Mastered') + n('Familiar') + n('Learning') + n('New'), skillNames);
  }
  r.check('colour: land that is no country of the atlas is dimmed', await st(page, () => window.__styles['name:Greenland'] === 'dim' && window.__styles['name:Antarctica'] === 'dim'));
  r.check('colour flag: countries with no flag question are dimmed', await st(page, () => window.__styles['name:Syria'] === 'dim' && window.__styles['name:Somaliland'] === 'dim'));
  // The colour that reaches the screen, for one mastered and one unseen country
  await page.click('[data-action="explore-colour"][data-value="country"]');
  const pick = await st(page, () => {
    const A = window.__atlas;
    const big = ['Brazil', 'Australia', 'China', 'India', 'Algeria', 'Canada', 'Argentina', 'Kazakhstan', 'Mexico', 'Mongolia', 'Sudan', 'Libya', 'Iran', 'Peru'];
    const of = level => big.find(n => A.mastery.get('country', n).level === level) || null;
    return { mastered: of('mastered'), familiar: of('familiar'), learning: of('learning') };
  });
  for (const [level, tok] of [['mastered', '--m3'], ['familiar', '--m2'], ['learning', '--m1']]) {
    if (!pick[level]) { console.log('      (no large ' + level + ' country in the seed: pixel check skipped)'); continue; }
    await centreOn(page, pick[level], 2.5);
    await still(page);
    await page.waitForTimeout(600);
    const p = await pointOf(page, pick[level]);
    const px = await pixelAt(page, p.x, p.y), want = await token(page, tok);
    r.check('colour: ' + pick[level] + ' (' + level + ') is drawn in ' + tok, near(px, want, 30), { px, want });
  }
  // Selecting keeps the colour: the card opens and the mark is an outline
  await st(page, () => window.__atlas.selectCountry('Brazil'));
  r.check('colour: a selected country keeps its mastery colour', await st(page, () => /^step/.test(window.__styles['name:Brazil'])));
  await page.click('[data-action="explore-colour"][data-value="plain"]');
  r.eq('colour: back to Plain: land, and the selected country tinted', await st(page, () => [window.__styles['name:Brazil'], window.__styles['name:Peru'], window.__styles['name:Greenland']]), ['prompt', 'land', 'dim']);
  // A new player: everything is New
  const h2 = await open({ seed: null });
  await goExplore(h2.page);
  await h2.page.click('[data-action="explore-colour"][data-value="capital"]');
  const fresh = await st(h2.page, () => Array.from(document.querySelectorAll('#explore-legend > span')).map(s => s.textContent.trim()));
  r.eq('colour: a new player has all 184 capitals New', fresh, ['Mastered 0', 'Familiar 0', 'Learning 0', 'New 184']);
  r.eq('colour: no page errors', h.errors.concat(h2.errors), []);
  await h2.close();
  await h.close();
};

/* ----- satellite ----- */
groups.satellite = async () => {
  const h = await open({ extra: { 'atlas-difficulty': 'uncharted', 'atlas-map-style': 'parchment' } });
  const page = h.page;
  await goExplore(page);
  let s = await st(page, () => ({
    sat: document.getElementById('explore-stage').classList.contains('sat-on'),
    noBorders: document.getElementById('explore-stage').classList.contains('no-borders'),
    pressed: document.getElementById('explore-style-btn').getAttribute('aria-pressed'),
    shown: getComputedStyle(document.getElementById('explore-style-btn')).display !== 'none'
  }));
  r.eq('satellite: Uncharted is a way to play, not to explore: chart, borders, and the layers button', s, { sat: false, noBorders: false, pressed: 'false', shown: true });
  await page.click('#explore-style-btn');
  await page.waitForFunction(() => document.getElementById('explore-stage').classList.contains('sat-on'), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  s = await st(page, () => ({
    pressed: document.getElementById('explore-style-btn').getAttribute('aria-pressed'),
    credit: getComputedStyle(document.getElementById('explore-credit')).display !== 'none' && /Esri/.test(document.getElementById('explore-credit').textContent),
    saved: localStorage.getItem('atlas-map-style'),
    gameStage: document.getElementById('map-wrap').classList.contains('sat-on')
  }));
  r.eq('satellite: the layers button turns imagery on, with the credit, and saves the choice', [s.pressed, s.credit, s.saved], ['true', true, 'satellite']);
  // The credit is in sight: inside the window, and not under the card
  await st(page, () => window.__atlas.selectCountry('Egypt'));
  await still(page);
  const vis = await st(page, () => {
    const c = document.getElementById('explore-credit').getBoundingClientRect(), k = document.getElementById('place-card').getBoundingClientRect();
    const overlap = !(c.right <= k.left || c.left >= k.right || c.bottom <= k.top || c.top >= k.bottom);
    const top = document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2);
    return { inside: c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth, overlap, top: top && (top.id || top.className) };
  });
  r.check('satellite: the credit stays in sight with a card open', vis.inside && !vis.overlap, vis);
  // Mastery colours over imagery stay nearly solid
  await page.click('[data-action="explore-colour"][data-value="country"]');
  await page.click('#explore-style-btn');
  await page.waitForFunction(() => !document.getElementById('explore-stage').classList.contains('sat-on'));
  r.eq('satellite: and off again', await st(page, () => [document.getElementById('explore-style-btn').getAttribute('aria-pressed'), localStorage.getItem('atlas-map-style')]), ['false', 'parchment']);
  r.eq('satellite: no page errors', h.errors, []);
  await h.close();

  // Imagery that cannot be had: the chart, and a word about it
  const h2 = await lib.launchApp(Object.assign({ seedStorage: { 'atlas-theme': 'light', 'atlas-map-style': 'satellite' }, tiles: 'fail' },
    MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 }));
  await goExplore(h2.page);
  await h2.page.waitForFunction(() => { const n = document.getElementById('app-notice'); return n && n.classList.contains('show'); }, null, { timeout: 30000 }).catch(() => {});
  const failed = await st(h2.page, () => ({
    notice: (document.getElementById('app-notice') || {}).textContent || '',
    sat: document.getElementById('explore-stage').classList.contains('sat-on')
  }));
  r.check('satellite: when no imagery loads, Explore says so and shows the chart', /couldn’t load/.test(failed.notice) && !failed.sat, failed);
  await h2.close();
};

/* ----- keys ----- */
groups.keys = async () => {
  const h = await open();
  const page = h.page;
  await goExplore(page);
  const view = () => st(page, () => window.__atlas.globe.getView());
  // Focus on the page, outside any field
  await st(page, () => { if (document.activeElement) document.activeElement.blur(); });
  let a = await view();
  await page.keyboard.press('ArrowRight');
  await moved(page, a);
  let b = await view();
  r.check('keys: the right arrow turns the globe east', b.lon > a.lon + 5 && Math.abs(b.lat - a.lat) < 0.01, [a, b]);
  await page.keyboard.press('ArrowUp');
  await moved(page, b);
  a = b; b = await view();
  r.check('keys: the up arrow turns it north', b.lat > a.lat + 5 && Math.abs(b.lon - a.lon) < 0.01, [a, b]);
  await page.keyboard.press('ArrowLeft');
  await moved(page, b);
  const mid = await view();
  await page.keyboard.press('ArrowDown');
  await moved(page, mid);
  a = b; b = await view();
  r.check('keys: left and down turn it back', b.lon < a.lon - 5 && b.lat < a.lat - 5, [a, b]);
  await page.keyboard.press('+');
  await moved(page, b);
  a = b; b = await view();
  r.check('keys: + zooms in', b.k > a.k * 1.3, [a.k, b.k]);
  await page.keyboard.press('-');
  await moved(page, b);
  a = b; b = await view();
  r.check('keys: - zooms out', b.k < a.k / 1.3, [a.k, b.k]);
  await st(page, () => window.__atlas.globe.setView({ lon: 60, lat: -10, k: 2 }));
  await page.keyboard.press('0');
  await moved(page, { lon: 60, lat: -10, k: 2 });
  r.check('keys: 0 goes back to the whole globe', await st(page, () => { const v = window.__atlas.globe.getView(), hm = window.__atlas.explore.home; return Math.abs(v.k - hm.k) < 1e-6 && Math.abs(v.lon - hm.lon) < 1e-6; }));
  // The buttons do the same
  b = await view();
  await page.click('[data-action="explore-zoom"][data-value="in"]');
  await moved(page, b);
  a = await view();
  await page.click('[data-action="explore-zoom"][data-value="out"]');
  await moved(page, a);
  b = await view();
  r.check('keys: the zoom buttons zoom', a.k > b.k * 1.3, [a.k, b.k]);
  await st(page, () => window.__atlas.globe.setView({ lon: 100, lat: 10, k: 4 }));
  await page.click('[data-action="explore-zoom"][data-value="reset"]');
  await moved(page, { lon: 100, lat: 10, k: 4 });
  r.check('keys: Reset view goes back to the whole globe', await st(page, () => Math.abs(window.__atlas.globe.getView().k - window.__atlas.explore.home.k) < 1e-6));
  // Escape closes the card; / goes to the search
  await st(page, () => { window.__atlas.selectCountry('Kenya'); document.activeElement && document.activeElement.blur(); });
  await page.keyboard.press('Escape');
  r.eq('keys: Escape closes the card', await sel(page), null);
  await page.keyboard.press('/');
  r.eq('keys: / goes to the search field, and types nothing into it', await st(page, () => [document.activeElement.id, document.getElementById('explore-search').value]), ['explore-search', '']);
  // In the field the arrows are the caret's, not the globe's
  a = await view();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  b = await view();
  r.check('keys: with the cursor in the field the arrows leave the globe alone', Math.abs(a.lon - b.lon) < 1e-9);
  // In the Colour by group the arrows change the colour, not the view
  await page.focus('[data-action="explore-colour"][data-value="plain"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  b = await view();
  r.check('keys: in Colour by the arrows pick the next colour and leave the globe alone',
    Math.abs(a.lon - b.lon) < 1e-9 && await st(page, () => window.__atlas.explore.colour === 'country'));
  // With the level sheet open over Explore, Escape closes the sheet and leaves the card
  await st(page, () => window.__atlas.selectCountry('Kenya'));
  await page.click('.place > .btn');
  await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
  r.eq('keys: the card\'s button opens its continent\'s level sheet', await st(page, () => document.getElementById('sheet-title').textContent), 'Africa');
  await page.keyboard.press('Escape');
  r.eq('keys: Escape closes the sheet first, and the card stays', [await st(page, () => document.getElementById('level-sheet').hidden), await sel(page)], [true, 'Kenya']);
  r.eq('keys: no page errors', h.errors, []);
  await h.close();
};

/* ----- roundtrip: Explore, a round, Explore again ----- */
groups.roundtrip = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  await goExplore(page);
  await st(page, () => window.__atlas.selectCountry('Kenya'));
  await page.click('[data-action="explore-colour"][data-value="capital"]');
  await still(page);
  const before = await st(page, () => window.__atlas.globe.getView());
  // From the card to a round of Africa
  await page.click('.place > .btn');
  await page.waitForFunction(() => !document.getElementById('level-sheet').hidden);
  await page.click('#sheet-start-btn');
  await page.waitForFunction(() => {
    const A = window.__atlas, s = window.__t.snapshot();
    return s.screen === 'game-screen' && s.current && A.map.round === A.state.roundId && A.map.drawn;
  }, null, { timeout: 30000 });
  let g = await st(page, () => ({
    on: window.__atlas.explore.on, inGame: document.querySelectorAll('#globe-host canvas').length, all: document.querySelectorAll('canvas').length,
    region: window.__atlas.state.currentContinent, hash: location.search + location.hash, eligible: window.__atlas.map.eligible.size
  }));
  r.eq('roundtrip: a round of Africa starts from the card, on the game\'s stage', g, { on: false, inGame: 2, all: 2, region: 'Africa', hash: '?play=africa', eligible: 54 });
  for (let i = 0; i < 3; i++) {
    const s0 = await lib.snap(page);
    await page.evaluate(() => window.__t.attempt(true));
    await page.waitForFunction(b => { const s = window.__t.snapshot(); return s.screen !== 'game-screen' || (!s.locked && s.seq > b && s.current); }, s0.seq, { timeout: 30000 });
  }
  const marks = await st(page, () => window.__t.marks());
  r.eq('roundtrip: three answers by tapping the globe leave three marks', [marks.found, marks.second, marks.missed], [3, 0, 0]);
  // The hand over what can be picked is the round's again
  const aim = await st(page, () => window.__t.aimKey(window.__t.keyFor(window.__atlas.state.current)));
  await page.waitForTimeout(300);
  await page.mouse.move(aim.x + 3, aim.y + 3);
  await page.mouse.move(aim.x, aim.y);
  await page.waitForTimeout(300);
  r.eq('roundtrip: in the round the pointer is a hand over a country that can be picked',
    await st(page, () => getComputedStyle(document.getElementById('globe-host')).getPropertyValue('--globe-cursor').trim()), 'pointer');
  const v0 = await st(page, () => window.__atlas.globe.getView());
  await page.keyboard.press('ArrowRight');
  await moved(page, v0);
  r.check('roundtrip: in a round, too, the arrow keys turn the globe', (await st(page, () => window.__atlas.globe.getView())).lon > v0.lon + 1, v0);
  // A wrong tap is still told apart, and a hover style is the game's
  r.check('roundtrip: in the round only Africa can be picked', await st(page, () => {
    const A = window.__atlas;
    return !A.map.eligible.has('name:France') && A.map.eligible.has('name:Kenya');
  }));
  // Back to Explore: the view, the selection and the colour are as they were left
  await page.evaluate(() => { location.hash = '#explore'; });
  await page.waitForFunction(() => window.__atlas.explore.on);
  await still(page);
  const back = await st(page, () => {
    const A = window.__atlas, v = A.globe.getView();
    return { selected: A.explore.selected, colour: A.explore.colour, view: v, inExplore: document.querySelectorAll('#explore-globe canvas').length,
      card: !document.getElementById('place-card').hidden, hash: location.hash };
  });
  r.eq('roundtrip: back in Explore the selection, the colour and the card are as they were left', [back.selected, back.colour, back.card, back.inExplore, back.hash],
    ['Kenya', 'capital', true, 2, '#explore=kenya']);
  r.check('roundtrip: and so is the view', Math.abs(back.view.lon - before.lon) < 1e-6 && Math.abs(back.view.lat - before.lat) < 1e-6 && Math.abs(back.view.k - before.k) < 1e-6, [before, back.view]);
  // The round's marks are not Explore's: a country found in the round wears its mastery colour again
  await st(page, () => {
    const g2 = window.__atlas.globe, set = g2.setStyles;
    window.__styles = {};
    g2.setStyles = function (layer, styles) { if (layer === 'world') window.__styles = Object.assign({}, styles); return set.apply(g2, arguments); };
  });
  await page.click('[data-action="explore-colour"][data-value="country"]');
  r.check('roundtrip: the globe is painted for Explore again', await st(page, () => Object.keys(window.__styles).length > 200 && Object.keys(window.__styles).every(k => /^(step\d|dim)$/.test(window.__styles[k]))));
  // A real click still selects
  await page.click('.place-close');
  await centreOn(page, 'Chad', 2.5);
  await still(page);
  const p = await pointOf(page, 'Chad');
  await page.mouse.move(p.x + 3, p.y + 3);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(300);
  r.eq('roundtrip: the pointer is a hand over a country in Explore again',
    await st(page, () => getComputedStyle(document.getElementById('explore-globe')).getPropertyValue('--globe-cursor').trim()), 'pointer');
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Chad', null, { timeout: 5000 }).catch(() => {});
  r.eq('roundtrip: a click on the globe selects again', await sel(page), 'Chad');
  // A round on another map, with imagery, and back: only the world shows in Explore
  await page.click('#explore-style-btn');
  await lib.startLevel(page, 'us-state');
  const us = await st(page, () => ({ layer: window.__atlas.map.layer, sat: document.getElementById('map-wrap').classList.contains('sat-on'), inGame: document.querySelectorAll('#globe-host canvas').length }));
  r.eq('roundtrip: a States round after Explore is played on the US map, with the imagery that was switched on', us, { layer: 'us', sat: true, inGame: 2 });
  const s1 = await lib.snap(page);
  await page.evaluate(() => window.__t.attempt(true));
  await page.waitForFunction(b => { const s = window.__t.snapshot(); return !s.locked && s.seq > b && s.current; }, s1.seq, { timeout: 30000 });
  r.eq('roundtrip: a state is found by tapping it', (await st(page, () => window.__t.marks())).found, 1);
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => { location.hash = '#explore'; });
  await page.waitForFunction(() => window.__atlas.explore.on);
  await still(page);
  await centreOn(page, 'United States', 3);
  await still(page);
  const hit = await st(page, () => {
    const g2 = window.__atlas.globe, b = document.getElementById('explore-globe').getBoundingClientRect();
    const hit2 = g2.featureAt(b.width / 2, b.height / 2, {});
    return { layer: hit2 && hit2.layerId, key: hit2 && hit2.key, sat: document.getElementById('explore-stage').classList.contains('sat-on') };
  });
  r.eq('roundtrip: back in Explore the states are gone and the country is there to pick, on imagery', hit, { layer: 'world', key: 'name:United States of America', sat: true });
  const p2 = await pointOf(page, 'United States');
  await page.mouse.click(p2.x, p2.y);
  await page.waitForFunction(() => window.__atlas.explore.selected === 'United States', null, { timeout: 5000 }).catch(() => {});
  r.eq('roundtrip: and a click selects it', await sel(page), 'United States');
  r.eq('roundtrip: no page errors', h.errors, []);
  await h.close();
};

/* ----- links: #explore and #explore=<country> ----- */
groups.links = async () => {
  let h = await open({ query: '#explore=japan' });
  let page = h.page;
  await page.waitForFunction(() => window.__atlas.explore.on && window.__atlas.explore.selected === 'Japan', null, { timeout: 20000 }).catch(() => {});
  await still(page);
  let c = await card(page);
  let p = await pointOf(page, 'Japan');
  r.eq('links: #explore=japan opens Explore with Japan selected', [await sel(page), c && c.name, await st(page, () => location.hash)], ['Japan', 'Japan', '#explore=japan']);
  r.check('links: and the globe turned to it', !!p && p.z > 0.6, p);
  // A typed hash while the app is open
  await page.evaluate(() => { location.hash = '#explore=ivory-coast'; });
  await page.waitForFunction(() => window.__atlas.explore.selected === 'Ivory Coast', null, { timeout: 10000 }).catch(() => {});
  r.eq('links: a hash typed later selects its country', await sel(page), 'Ivory Coast');
  await page.evaluate(() => { location.hash = '#explore=United%20States'; });
  await page.waitForFunction(() => window.__atlas.explore.selected === 'United States', null, { timeout: 10000 }).catch(() => {});
  r.eq('links: a name with a space and capitals is understood', [await sel(page), await st(page, () => location.hash)], ['United States', '#explore=united-states']);
  await h.close();
  h = await open({ query: '#explore=atlantis' });
  page = h.page;
  await page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 20000 });
  r.eq('links: an unknown country opens Explore with nothing selected', [await sel(page), await st(page, () => location.hash)], [null, '#explore']);
  r.eq('links: no page errors', h.errors, []);
  await h.close();
  h = await open({ query: '#explore' });
  page = h.page;
  await page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 20000 });
  await still(page);
  r.eq('links: #explore on load opens the view', await st(page, () => [document.body.dataset.screen, document.querySelectorAll('#explore-globe canvas').length]), ['explore', 2]);
  // The map could not be loaded
  await h.close();
  const hf = await require(path.join(S, 'harness/atlas-harness.js')).launch(MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 });
  await hf.page.route(/countries-(50|110)m\.json/, route => route.abort());
  await hf.page.goto(hf.url + '#explore');
  await hf.page.waitForFunction(() => window.__atlas && window.__atlas.state.worldFailed, null, { timeout: 20000 });
  const failed = await hf.page.evaluate(() => ({ text: document.getElementById('explore-status').textContent, cls: document.getElementById('explore-status').className, hidden: document.getElementById('explore-status').hidden }));
  r.check('links: when the map cannot be loaded Explore says so', /could not be unfurled/.test(failed.text) && /error-state/.test(failed.cls) && !failed.hidden, failed);
  await hf.close();
};

/* ----- stats: See it on the globe ----- */
groups.stats = async () => {
  const h = await open();
  const page = h.page;
  await page.evaluate(() => { location.hash = '#stats'; });
  await page.waitForFunction(() => document.querySelector('[data-action="see-on-globe"]'));
  const links = await st(page, () => Array.from(document.querySelectorAll('[data-action="see-on-globe"]')).map(b => b.textContent.trim() + '|' + b.dataset.value));
  r.eq('stats: the mastery panel offers the globe for four skills', links, ['Countries|country', 'Names|country-name', 'Capitals|capital', 'Flags|flag']);
  await page.click('[data-action="see-on-globe"][data-value="flag"]');
  await page.waitForFunction(() => window.__atlas.explore.on, null, { timeout: 15000 });
  await still(page);
  const got = await st(page, () => ({
    colour: window.__atlas.explore.colour, checked: document.querySelector('[data-action="explore-colour"][aria-checked="true"]').dataset.value,
    legend: !document.getElementById('explore-legend').hidden, hash: location.hash
  }));
  r.eq('stats: the link opens Explore coloured by that skill', got, { colour: 'flag', checked: 'flag', legend: true, hash: '#explore' });
  r.eq('stats: no page errors', h.errors, []);
  await h.close();
};

/* ----- learn: the ladder on continents and States ----- */
groups.learn = async () => {
  const h = await open({ fast: 25 });
  const page = h.page;
  const offered = await st(page, () => window.__atlas.LEVELS.filter(l => l.learn).map(l => l.key));
  r.eq('learn: offered for the six continents, States and the province levels',
    offered, ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'us-state', 'canada-provinces', 'china-provinces', 'india-states', 'russia-west', 'russia-south', 'russia-east']);
  const ways = async key => {
    await st(page, k => document.querySelector('[data-action="open-level"][data-level="' + k + '"]').click(), key);
    const w = await st(page, () => Array.from(document.querySelectorAll('[data-action="sheet-way"]')).map(b => b.dataset.value));
    await st(page, () => document.querySelector('[data-action="sheet-close"]').click());
    return w;
  };
  r.check('learn: the level sheet of a continent offers Learn', (await ways('oceania')).includes('learn'));
  r.check('learn: so does States', (await ways('us-state')).includes('learn'));
  r.check('learn: The World does not', !(await ways('world')).includes('learn'));
  r.check('learn: nor does a level answered another way', !(await ways('us-state-to-capital')).includes('learn') && !(await ways('flags-europe')).includes('learn'));
  // Through the sheet: Oceania, level 1 and 2
  const records = await st(page, () => localStorage.getItem('atlas-records'));
  const focus = await st(page, () => localStorage.getItem('atlas-focus'));
  await st(page, () => document.querySelector('[data-action="open-level"][data-level="oceania"]').click());
  await page.click('[data-action="sheet-way"][data-value="learn"]');
  r.check('learn: Start says Learn from one', /Learn/.test(await st(page, () => document.getElementById('sheet-start-btn').textContent)));
  await page.click('#sheet-start-btn');
  await page.waitForFunction(() => { const s = window.__t.snapshot(); return s.screen === 'game-screen' && s.learnPhase === 'study' && window.__atlas.map.drawn; }, null, { timeout: 30000 });
  await still(page);
  let run = await st(page, () => {
    const A = window.__atlas, run2 = A.state.learn;
    return {
      key: run2.levelKey, level: run2.level, n: run2.order.length, labels: A.map.labels.map(l => l.name), newest: run2.order[0],
      saved: JSON.parse(localStorage.getItem('atlas-learn')).oceania, kind: document.getElementById('game-kind').textContent,
      title: document.getElementById('region-tag').textContent, url: location.search, ready: !document.getElementById('learn-ready-btn').hidden
    };
  });
  r.eq('learn: Oceania opens at level 1 of 7, saved under the level\'s key', [run.key, run.level, run.n, run.saved.level, run.saved.order.length], ['oceania', 1, 7, 1, 7]);
  r.eq('learn: the newest name is drawn on the globe', run.labels, [run.newest]);
  r.eq('learn: the bar says what it is, and the address is the Learn link', [run.title, run.kind, run.url, run.ready], ['Oceania', 'Learn', '?play=oceania&learn=1', true]);
  const seenBefore = await st(page, n => window.__atlas.mastery.get('country', n).seen, run.newest);
  await page.click('#learn-ready-btn');
  await page.waitForFunction(() => window.__atlas.state.current);
  r.eq('learn: Quiz me asks for that country, with the names off the map', await st(page, () => [window.__atlas.state.current, window.__atlas.map.labels.length]), [run.newest, 0]);
  await page.evaluate(() => window.__t.attempt(true));
  await page.waitForFunction(() => window.__atlas.state.learn && window.__atlas.state.learn.level === 2 && window.__atlas.state.learn.phase === 'study', null, { timeout: 20000 });
  await still(page);
  run = await st(page, () => ({ saved: JSON.parse(localStorage.getItem('atlas-learn')).oceania.level, labels: window.__atlas.map.labels.length }));
  r.eq('learn: a clean pass moves to level 2, saved, with two names to study', [run.saved, run.labels], [2, 2]);
  // A miss restarts the level
  await page.click('#learn-ready-btn');
  await page.waitForFunction(() => window.__atlas.state.current);
  await page.evaluate(() => window.__t.attempt(false));
  await page.waitForFunction(() => window.__atlas.state.learn.phase === 'study' && window.__atlas.state.learn.restarts === 1, null, { timeout: 20000 });
  r.eq('learn: a miss restarts level 2', await st(page, () => [window.__atlas.state.learn.level, window.__atlas.state.learn.restarts]), [2, 1]);
  r.eq('learn: nothing is written to records, the focus lists or the country\'s mastery',
    [await st(page, () => localStorage.getItem('atlas-records')) === records, await st(page, () => localStorage.getItem('atlas-focus')) === focus,
      await st(page, n => window.__atlas.mastery.get('country', n).seen, await st(page, () => window.__atlas.state.learn.order[0])) === seenBefore],
    [true, true, true]);
  // Home shows the ladder in progress on the card's sheet
  await page.click('#back-btn');
  await st(page, () => document.querySelector('[data-action="open-level"][data-level="oceania"]').click());
  const again = await st(page, () => ({
    title: (document.querySelector('[data-action="sheet-way"][data-value="learn"] strong') || {}).textContent,
    reset: !!document.querySelector('[data-action="sheet-learn-reset"]')
  }));
  r.eq('learn: the sheet now offers to keep learning, or to start over', again, { title: 'Keep Learning', reset: true });
  await st(page, () => document.querySelector('[data-action="sheet-close"]').click());
  // States
  await lib.startLevel(page, 'us-state', { learn: true });
  await still(page);
  const us = await st(page, () => {
    const A = window.__atlas;
    return { key: A.state.learn.levelKey, n: A.state.learn.order.length, layer: A.map.layer, labels: A.map.labels.length, saved: !!JSON.parse(localStorage.getItem('atlas-learn'))['us-state'] };
  });
  r.eq('learn: States is a ladder of 50 on the US map, saved as us-state', us, { key: 'us-state', n: 50, layer: 'us', labels: 1, saved: true });
  // Europe: Russia's name stays in the frame
  await st(page, () => {
    const A = window.__atlas, names = A.levelByKey('europe').names().filter(n => n !== 'Russia');
    const all = JSON.parse(localStorage.getItem('atlas-learn') || '{}');
    all.europe = { order: names.slice(0, 5).concat(['Russia']).concat(names.slice(5)), level: 6, savedAt: Date.now() };
    localStorage.setItem('atlas-learn', JSON.stringify(all));
  });
  // Every point-on-the-sphere test the page asks d3 for from here on is counted
  await st(page, () => { const real = d3.geoContains; window.__contains = 0; d3.geoContains = function () { window.__contains++; return real.apply(this, arguments); }; });
  await lib.startLevel(page, 'Europe', { learn: true });
  await still(page);
  const asked = await st(page, () => window.__contains);
  r.eq('learn: finding where Russia\'s name goes in Europe costs no point-by-point tests of its whole outline', asked, 0);
  // The spot is the one a point-by-point search of the same 30 x 30 grid finds
  const ref = await st(page, () => {
    const A = window.__atlas, box = [-25, 45, 34, 72], n = 30, f = A.state.featureByCanonical.get('Russia');
    const stepLon = (box[1] - box[0]) / n, stepLat = (box[3] - box[2]) / n;
    const at = (i, j) => [box[0] + (i + 0.5) * stepLon, box[2] + (j + 0.5) * stepLat];
    const inside = [];
    for (let i = 0; i < n; i++) { inside.push([]); for (let j = 0; j < n; j++) inside[i].push(d3.geoContains(f, at(i, j))); }
    const depth = (i, j) => { for (let q = 1; q < n; q++) for (let a = -q; a <= q; a++) for (const c of [[i + a, j - q], [i + a, j + q], [i - q, j + a], [i + q, j + a]])
      if (c[0] < 0 || c[0] >= n || c[1] < 0 || c[1] >= n || !inside[c[0]][c[1]]) return q; return n; };
    let best = null, bestDepth = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const d = inside[i][j] ? depth(i, j) : 0; if (d > bestDepth) { bestDepth = d; best = at(i, j); } }
    const label = A.map.labels.find(l => l.name === 'Russia');
    return { best: best, got: label && label.lonlat };
  });
  r.check('learn: and it is the spot the point-by-point search finds', !!ref.got && Math.abs(ref.got[0] - ref.best[0]) < 1e-9 && Math.abs(ref.got[1] - ref.best[1]) < 1e-9, ref);
  const eu = await st(page, () => {
    const A = window.__atlas, label = A.map.labels.find(l => l.name === 'Russia');
    const p = label ? A.globe.project(label.lonlat) : null;
    const host = document.getElementById('globe-host').getBoundingClientRect();
    const v = A.globe.getView(), hm = A.map.home;
    return { lonlat: label && label.lonlat, on: !!p && p.visible && host.top + p.y > 0 && host.top + p.y < innerHeight && p.x > 0 && p.x < innerWidth,
      home: Math.abs(v.lon - hm.lon) < 1e-6 && Math.abs(v.k - hm.k) < 1e-6, labels: A.map.labels.length };
  });
  r.check('learn: in Europe, Russia\'s name sits on European Russia, in view', !!eu.lonlat && eu.lonlat[0] < 45 && eu.lonlat[0] > 25 && eu.on, eu);
  r.check('learn: and Europe stays where it was', eu.home, eu);
  // A province level's ladder keeps its key
  await lib.startLevel(page, 'canada-provinces', { learn: true });
  r.eq('learn: a province ladder is still saved under its round key', await st(page, () => [window.__atlas.state.learn.levelKey, !!JSON.parse(localStorage.getItem('atlas-learn'))['canada-provinces']]), ['canada-provinces', true]);
  r.eq('learn: no page errors', h.errors, []);
  await h.close();
  // Links
  let h2 = await open({ query: '?play=south-america&learn=1', fast: 25 });
  await h2.page.waitForFunction(() => { const s = window.__t && window.__t.snapshot(); return s && s.screen === 'game-screen' && (s.current || s.learnPhase === 'study'); }, null, { timeout: 30000 });
  r.eq('learn: ?play=south-america&learn=1 opens the ladder', await st(h2.page, () => !!window.__atlas.state.learn && window.__atlas.state.learn.levelKey), 'south-america');
  await h2.close();
  h2 = await open({ query: '?play=world&learn=1', fast: 25 });
  await h2.page.waitForFunction(() => { const s = window.__t && window.__t.snapshot(); return s && s.screen === 'game-screen' && (s.current || s.learnPhase === 'study'); }, null, { timeout: 30000 });
  r.eq('learn: ?play=world&learn=1 is a plain round of The World', await st(h2.page, () => [!!window.__atlas.state.learn, window.__atlas.state.totalQuestions]), [false, 184]);
  await h2.close();
};

/* ----- nogl: no WebGL, so the globe's Canvas 2D renderer and no imagery ----- */
groups.nogl = async () => {
  const size = MOBILE ? { mobile: true, dpr: 1 } : { width: 1280, height: 800 };
  const h = await lib.launchApp(Object.assign({
    seedStorage: Object.assign({ 'atlas-theme': 'light', 'atlas-map-style': 'satellite' }, SEED, { 'atlas-map-style': 'satellite' }),
    beforeLoad: hh => hh.context.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) { return /webgl/.test(type) ? null : get.apply(this, arguments); };
    })
  }, size));
  const page = h.page;
  await goExplore(page);
  const s = await st(page, () => ({
    imagery: window.__atlas.globe.supportsImagery(), button: document.getElementById('explore-style-btn').hidden,
    sat: document.getElementById('explore-stage').classList.contains('sat-on')
  }));
  r.eq('nogl: without WebGL there is no imagery and no layers button, and the chart shows', s, { imagery: false, button: true, sat: false });
  await centreOn(page, 'India', 2.5);
  await still(page);
  const p = await pointOf(page, 'India');
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__atlas.explore.selected === 'India', null, { timeout: 5000 }).catch(() => {});
  r.eq('nogl: a click still selects a country', [await sel(page), (await card(page) || {}).capital], ['India', 'New Delhi']);
  await page.click('[data-action="explore-colour"][data-value="country"]');
  await page.waitForTimeout(800);
  await still(page);
  const lvl = await st(page, () => window.__atlas.mastery.get('country', 'India').level);
  const tok = { mastered: '--m3', familiar: '--m2', learning: '--m1', new: '--m0' }[lvl];
  const pt = await pointOf(page, 'India');
  const px = await pixelAt(page, pt.x, pt.y), want = await token(page, tok);
  r.check('nogl: mastery colours are drawn (India, ' + lvl + ', in ' + tok + ')', near(px, want, 30), { px, want });
  r.eq('nogl: no page errors', h.errors, []);
  await h.close();
};

(async () => {
  for (const name of Object.keys(groups)) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log('\n== ' + name + ' ==');
    try { await groups[name](); } catch (e) { r.check(name + ': the group ran to its end', false, String(e.stack || e)); }
  }
  process.exit(r.done() ? 0 : 1);
})();
