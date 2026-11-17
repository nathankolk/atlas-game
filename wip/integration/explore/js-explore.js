  /* =========================================================
   * EXPLORE (the globe to look around on)
   *
   * A view, not a round. There is one globe: while this view shows, its
   * canvases are attached to #explore-globe (the engine's attachTo), and
   * they go back to the game's #globe-host on leaving, so there is never
   * a second WebGL context. Explore paints the world layer itself; a
   * round that starts afterwards sets its own map up from scratch
   * (setupMap), so nothing here needs undoing.
   *
   * A tap or a search selects a country and opens its place card. What
   * the card says comes from the files the quizzes are built on:
   * WORLD_FACTS, the continent lists, the world map's own topology for the
   * neighbours, and the mastery store. '#explore=<country>' in the address
   * selects one (the slug is Quiz.slug of its name: 'ivory-coast').
   * ========================================================= */

  // What "Colour by" offers besides Plain: one mastery skill each, with the
  // countries that have a question in it
  const EXPLORE_SKILLS = [
    { key: 'country', label: 'Find', line: 'Find on the globe', plural: 'Countries', names: () => countryNames('World') },
    { key: 'country-name', label: 'Name', line: 'Name it', plural: 'Names', names: () => quizNames('name-it', 'World') },
    { key: 'capital', label: 'Capital', line: 'Capital', plural: 'Capitals', names: () => quizNames('capital-pick', 'World') },
    { key: 'flag', label: 'Flag', line: 'Flag', plural: 'Flags', names: () => quizNames('flag', 'World') }
  ];
  // The mastery levels, best first: the word for each, its swatch class and its style on the globe
  const MASTERY_STEPS = [
    { level: 'mastered', label: 'Mastered', swatch: ' m3', style: 'step3' },
    { level: 'familiar', label: 'Familiar', swatch: ' m2', style: 'step2' },
    { level: 'learning', label: 'Learning', swatch: ' m1', style: 'step1' },
    { level: 'new', label: 'New', swatch: '', style: 'step0' }
  ];
  const EXPLORE_CLOSE = 12;      // how far a search zooms in on a small country: its surroundings stay in view
  const EXPLORE_RESULTS = 6;     // how many countries a search lists

  // Land borders the 1:50m shapes are too coarse to draw: Spain's two cities
  // on the coast of Morocco, and the 150 m of river bank where Botswana
  // meets Zambia
  const EXTRA_BORDERS = [['Morocco', 'Spain'], ['Botswana', 'Zambia']];
  // Countries the map has but this atlas asks nothing about, which a
  // neighbour's list of borders would be wrong without: map name -> name to show
  const BORDER_ONLY = {
    'Andorra': 'Andorra', 'Liechtenstein': 'Liechtenstein', 'Monaco': 'Monaco',
    'San Marino': 'San Marino', 'Vatican': 'Vatican City'
  };

  const explore = {
    on: false,            // the view is showing, and the globe is in it
    selected: null,       // canonical name of the country whose card is open
    colour: 'plain',      // 'plain', or the key of one of EXPLORE_SKILLS
    view: null,           // where the globe was left, for coming back to
    home: null,           // the whole globe, fitted to the screen
    countries: null,      // canonical name -> keys of its shapes on the world layer (see exploreCountries)
    focus: new Map(),     // canonical name -> its main piece (see countryFocus)
    results: [],          // the search results on show: [{ name, note }]
    active: -1,           // which of them the arrow keys have reached
    flags: false          // true once flags are known to draw here (see renderPlace)
  };

  // Which countries border which, read off the world map's topology: two
  // countries are neighbours when their shapes share a stretch of border
  // (France and Brazil do, through French Guiana, which the map draws as
  // part of France). Returns canonical name -> { countries, others }: the
  // neighbours this atlas knows, and the names of the BORDER_ONLY ones.
  function worldNeighbours(geometries) {
    const adjacent = topojson.neighbors(geometries);
    const found = new Map();
    geometries.forEach((geometry, i) => {
      const name = canonicalize(featureName(geometry));
      if (!getContinent(name)) return;
      const entry = found.get(name) || { countries: new Set(), others: new Set() };
      found.set(name, entry);
      adjacent[i].forEach(j => {
        const raw = featureName(geometries[j]);
        const other = canonicalize(raw);
        if (getContinent(other)) {
          if (other !== name) entry.countries.add(other);
        } else if (Object.prototype.hasOwnProperty.call(BORDER_ONLY, raw)) {
          entry.others.add(BORDER_ONLY[raw]);
        }
      });
    });
    EXTRA_BORDERS.forEach(pair => {
      if (!found.has(pair[0]) || !found.has(pair[1])) return;
      found.get(pair[0]).countries.add(pair[1]);
      found.get(pair[1]).countries.add(pair[0]);
    });
    const out = new Map();
    found.forEach((entry, name) => {
      out.set(name, { countries: Array.from(entry.countries).sort(), others: Array.from(entry.others).sort() });
    });
    return out;
  }

  // The countries Explore knows, once the world map is in: canonical name
  // -> the keys of its shapes on the world layer
  function exploreCountries() {
    if (!explore.countries && state.allFeatures.length) {
      explore.countries = new Map();
      state.allFeatures.forEach(f => {
        const key = featureKey(f);
        if (!isCountryKey(key)) return;
        const name = state.canonicalByFeature.get(key);
        if (!explore.countries.has(name)) explore.countries.set(name, []);
        explore.countries.get(name).push(key);
      });
    }
    return explore.countries || new Map();
  }

  // True for a shape of the world layer that is one of the atlas's countries
  // (the map also draws territories and Antarctica, which have no card)
  function isCountryKey(key) {
    return !!state.continentByFeature.get(key);
  }

  function exploreSkill() {
    return EXPLORE_SKILLS.find(skill => skill.key === explore.colour) || null;
  }

  // The country a '#explore=<slug>' address names, or null
  function countryFromHash() {
    const parts = window.location.hash.replace(/^#/, '').split('=');
    if (parts[0] !== 'explore' || !parts[1]) return null;
    let wanted = parts[1];
    try { wanted = decodeURIComponent(wanted); } catch (e) { /* as typed */ }
    wanted = Quiz.slug(wanted.replace(/-/g, ' '));
    return Array.from(exploreCountries().keys()).find(name => Quiz.slug(name) === wanted) || null;
  }

  /* ----- Coming and going ----- */

  // Draws the Explore view: when it comes on screen, and whenever what it
  // shows may have changed under it (a sync pull, a reset, the flag font)
  function renderExplore() {
    const status = document.getElementById('explore-status');
    if (!state.allFeatures.length || !map.globe) {
      if (state.worldFailed) {
        status.className = 'explore-status error-state';
        status.textContent = 'The map could not be unfurled. Check your connection and refresh the page.';
      }
      return;
    }
    status.hidden = true;
    const arriving = !explore.on;
    enterExplore();
    renderExploreTools();
    renderPlace();
    paintExplore();
    const linked = countryFromHash();
    if (linked && linked !== explore.selected) selectCountry(linked, { instant: arriving });
  }

  // Moves the globe into the Explore screen and sets it up for looking around
  function enterExplore() {
    if (explore.on) return;
    const g = map.globe;
    explore.on = true;
    g.attachTo(document.getElementById('explore-globe'));
    document.getElementById('explore-globe').style.setProperty('--globe-cursor', '');
    sat.failed = false;
    applyImagerySupport();
    applyMapStyle();
    g.resume();
    frameExplore();
    g.setView(explore.view || explore.home);
    setExploreLayers();
    // Straight after the page has loaded the map may still be on its way
    // to the globe: what was set on it is set again once it is there
    if (!map.drawn) {
      map.drawing.then(() => {
        if (!explore.on) return;
        setExploreLayers();
        paintExplore();
        if (explore.selected) showCountry(explore.selected, { instant: true });
      });
    }
  }

  // Only the world shows, and every country of it can be picked
  function setExploreLayers() {
    const g = map.globe;
    MAP_LAYERS.forEach(id => g.updateLayer(id, { visible: id === 'world', interactive: id === 'world' }));
    MAP_LAYERS.forEach(id => g.setHoverStyle(id, id === 'world' ? 'hover' : null, isCountryKey));
  }

  // Hands the globe back to the game's stage
  function leaveExplore() {
    if (!explore.on) return;
    explore.view = map.globe.getView();
    explore.on = false;
    closeExploreResults();
    map.globe.attachTo(document.getElementById('globe-host'));
  }

  // Works out the whole-globe view for the screen as it is now: what Reset
  // view returns to, and as far out as Explore zooms
  function frameExplore() {
    const g = map.globe;
    const host = document.getElementById('explore-globe');
    g.resize();
    const base = g.radiusPx() / g.getView().k;      // the globe's radius at zoom 1
    const across = Math.min(host.clientWidth, host.clientHeight);
    const whole = (across / 2 - Math.max(8, across * 0.04)) / base;
    const wasHome = explore.home && exploreAtHome();
    explore.home = { lon: WORLD_VIEW.lon, lat: WORLD_VIEW.lat, k: whole };
    g.setOptions({ minZoom: Math.min(1, whole), maxZoom: 80 });
    g.setHome(explore.home);
    if (wasHome) g.setView(explore.home);
  }

  // True while the globe shows Explore's whole-globe view
  function exploreAtHome() {
    const v = map.globe.getView(), h = explore.home;
    return Math.abs(v.lon - h.lon) < 1e-6 && Math.abs(v.lat - h.lat) < 1e-6 && Math.abs(v.k - h.k) < 1e-6;
  }

  window.addEventListener('resize', () => {
    if (!explore.on) return;
    frameExplore();
    setPlaceHeight();
  });

  /* ----- The globe ----- */

  // Paints the world for Explore. Plain: the atlas's countries as land, the
  // selected one tinted. Coloured by a skill: each country in the step of
  // the moss ramp its mastery has reached. Land that is no country of the
  // atlas, or has no question in the skill, is dimmed.
  function paintExplore() {
    if (!explore.on) return;
    const skill = exploreSkill();
    const levels = skill ? mastery.levels(skill.key, skill.names()) : null;
    const styles = {};
    state.allFeatures.forEach(f => {
      const key = featureKey(f);
      const name = state.canonicalByFeature.get(key);
      if (!isCountryKey(key)) {
        styles[key] = 'dim';
      } else if (!levels) {
        styles[key] = name === explore.selected ? 'prompt' : 'land';
      } else {
        const step = Object.prototype.hasOwnProperty.call(levels, name) ? MASTERY_STEPS.find(s => s.level === levels[name]) : null;
        styles[key] = step ? step.style : 'dim';
      }
    });
    map.globe.setStyles('world', styles);
    map.globe.invalidate();
  }

  // Over the globe in Explore: the selected country's outline
  function drawExploreOverlay(ctx) {
    (exploreCountries().get(explore.selected) || []).forEach(key => {
      const info = map.globe.featureInfo('world', key);
      if (info) map.globe.draw.outline(ctx, info.feature, { stroke: map.ink.label, width: 2 });
    });
  }

  // A tap on the globe: the country under it is selected; a tap on the sea
  // or on land that is no country of the atlas puts the card away
  function onExploreClick(e) {
    const touch = !!e.originalEvent && e.originalEvent.pointerType !== 'mouse';
    const hit = map.globe.featureAt(e.x, e.y, {
      tolerance: touch ? 20 : 12,
      eligible: (layerId, key) => layerId === 'world' && isCountryKey(key)
    });
    const name = hit && isCountryKey(hit.key) ? state.canonicalByFeature.get(hit.key) : null;
    if (name !== explore.selected) selectCountry(name, { gentle: true });
  }

  // The main piece of a country: the middle of its largest polygon and how
  // far that polygon reaches from there, in radians. Outlying parts (French
  // Guiana, Alaska, Svalbard) are a turn of the globe away, as on the map.
  function countryFocus(name) {
    if (explore.focus.has(name)) return explore.focus.get(name);
    const keys = exploreCountries().get(name);
    const info = keys ? map.globe.featureInfo('world', keys[0]) : null;
    if (!info) return null;
    const lonlat = map.globe.anchor('world', keys[0]) || info.centroid;
    const geometry = info.feature.geometry;
    const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    // The anchor lies inside the largest piece, so the nearest border point of all is on that piece
    let main = polygons[0][0], nearest = Infinity;
    polygons.forEach(polygon => {
      polygon[0].forEach(point => {
        const d = d3.geoDistance(lonlat, point);
        if (d < nearest) { nearest = d; main = polygon[0]; }
      });
    });
    const focus = { lonlat: lonlat, radius: main.reduce((r, point) => Math.max(r, d3.geoDistance(lonlat, point)), 0) };
    explore.focus.set(name, focus);
    return focus;
  }

  // The part of the Explore stage its floating parts leave free, in px
  // from the stage's corner: where a selected country is shown
  function exploreClear() {
    const stage = document.getElementById('explore-stage').getBoundingClientRect();
    const box = id => {
      const el = document.getElementById(id);
      const r = el && !el.hidden ? el.getBoundingClientRect() : null;
      return r && r.width > 0 ? r : null;
    };
    const gap = 16;
    const card = box('place-card'), tools = box('explore-tools');
    const search = document.querySelector('.explore-search').getBoundingClientRect();
    const clear = { left: gap, right: stage.width - gap, top: gap, bottom: stage.height - gap };
    if (card && card.width > stage.width * 0.7) {
      // A phone: the search and the tools above, the card's sheet below
      clear.top = (tools || search).bottom - stage.top + gap;
      clear.bottom = card.top - stage.top - gap;
    } else {
      // The side column on the left, the map controls on the right, the tools in the top corner
      clear.left = search.right - stage.left + gap;
      clear.right = document.querySelector('#explore-screen .mapctl').getBoundingClientRect().left - stage.left - gap;
      if (tools && stage.height - (tools.bottom - stage.top) > 360) clear.top = tools.bottom - stage.top + gap;
    }
    return clear;
  }

  // The view centre that puts a place dx px right of and dy px below the
  // middle of a globe drawn radius px wide (the orthographic projection,
  // solved for its centre)
  function viewCentreFor(lonlat, radius, dx, dy) {
    const rad = Math.PI / 180;
    // No further out than the disc shows well
    const reach = Math.hypot(dx, dy), most = radius * 0.8;
    if (reach > most) { dx *= most / reach; dy *= most / reach; }
    const lat = lonlat[1] * rad;
    const dLon = Math.asin(Math.max(-1, Math.min(1, dx / (radius * Math.max(Math.cos(lat), 0.05)))));
    const a = Math.sin(lat), b = Math.cos(lat) * Math.cos(dLon);
    const lat0 = Math.acos(Math.max(-1, Math.min(1, -dy / (radius * Math.hypot(a, b))))) - Math.atan2(b, a);
    return [lonlat[0] - dLon / rad, lat0 / rad];
  }

  // Turns the globe so that a country sits in the middle of what the
  // floating parts leave free, at a size that shows its main piece whole.
  // opts.gentle (it was tapped, so it is in view): the globe moves only if
  // the card has covered the country, or it is too small or too large to
  // take in. opts.instant: no flight.
  function showCountry(name, opts) {
    const g = map.globe;
    const focus = countryFocus(name);
    if (!focus) return;
    const clear = exploreClear();
    const host = document.getElementById('explore-globe');
    const view = g.getView();
    const base = g.radiusPx() / view.k;
    const room = Math.min(clear.right - clear.left, clear.bottom - clear.top) / 2;
    const sine = Math.max(Math.sin(Math.min(focus.radius, Math.PI / 2)), 1e-6);
    // Whole, with air around it; a speck of an island comes up to a size that can be made out
    let k = Math.min(room * 0.72 / (base * sine), Math.max(EXPLORE_CLOSE, PROMPT_MIN_PX / (2 * base * sine)));
    k = Math.max(k, explore.home.k);
    if (opts && opts.gentle) {
      const across = 2 * base * view.k * sine;
      const p = g.project(focus.lonlat);
      const fits = across >= PROMPT_MIN_PX && across <= 2 * room;
      const inSight = p.z > 0.35 && p.x >= clear.left + 24 && p.x <= clear.right - 24 && p.y >= clear.top + 24 && p.y <= clear.bottom - 24;
      if (fits && inSight) return;
      if (fits) k = view.k;
    }
    const centre = viewCentreFor(focus.lonlat, base * k,
      (clear.left + clear.right) / 2 - host.clientWidth / 2, (clear.top + clear.bottom) / 2 - host.clientHeight / 2);
    g.flyTo({ lon: centre[0], lat: centre[1], k: k }, { duration: (opts && opts.instant) || reducedMotion() ? 0 : 700 });
  }

  // Selects a country, or none (null): its card, its mark on the globe and
  // the address bar follow. opts are showCountry's.
  function selectCountry(name, opts) {
    explore.selected = name && exploreCountries().has(name) ? name : null;
    renderPlace();
    paintExplore();
    if (document.body.dataset.screen === 'explore') setAddressBar(viewUrl('explore'));
    if (explore.selected && explore.on) showCountry(explore.selected, opts);
  }

  /* ----- Colour by ----- */

  // The Colour by control and, under it, what the colours count. Drawn
  // once; after that only its state and the legend's counts change.
  function renderExploreTools() {
    const tools = document.getElementById('explore-tools');
    if (!tools.firstChild) {
      tools.innerHTML =
        '<p class="eyebrow" id="explore-colour-label">Colour by</p>' +
        '<div class="seg seg--block" role="radiogroup" aria-labelledby="explore-colour-label">' +
          [{ key: 'plain', label: 'Plain' }].concat(EXPLORE_SKILLS).map(option =>
            '<button type="button" role="radio" data-action="explore-colour" data-value="' + option.key + '">' + option.label + '</button>').join('') +
        '</div>' +
        '<div class="legend explore-legend" id="explore-legend"></div>';
    }
    tools.querySelectorAll('[data-action="explore-colour"]').forEach(btn => {
      const on = btn.dataset.value === explore.colour;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    const skill = exploreSkill();
    const legend = document.getElementById('explore-legend');
    legend.hidden = !skill;
    if (!skill) return;
    const summary = mastery.summary(skill.key, skill.names());
    legend.setAttribute('role', 'group');
    legend.setAttribute('aria-label', skill.line + ', your mastery of ' + summary.total + ' countries');
    legend.innerHTML = MASTERY_STEPS.map(step =>
      '<span><i class="swatch' + step.swatch + '"></i>' + step.label + ' <b>' + summary[step.level] + '</b></span>').join('');
  }

  function chooseExploreColour(colour) {
    explore.colour = colour;
    renderExploreTools();
    paintExplore();
  }

  /* ----- The place card ----- */

  // "today", "yesterday", "5 days ago", then the date
  function daysAgoText(day) {
    const ago = mastery.today() - day;
    if (ago <= 0) return 'today';
    if (ago === 1) return 'yesterday';
    if (ago <= 30) return ago + ' days ago';
    const date = new Date(Mastery.dayToDate(day) + 'T12:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // The card of the selected country: its flag, name, capital and
  // continent, the countries it borders, and where the player stands with
  // it in each skill. Hidden when nothing is selected.
  function renderPlace() {
    const card = document.getElementById('place-card');
    const name = explore.selected;
    card.hidden = !name;
    if (!name) {
      card.innerHTML = '';
      setPlaceHeight();
      return;
    }
    const continent = getContinent(name);
    const capital = Quiz.capitalOf(WORLD_FACTS, name);
    const near = state.neighbours.get(name) || { countries: [], others: [] };
    const flag = !state.flagsOff && Quiz.flagPrompt(WORLD_FACTS, name);
    const bordered = near.countries.length + near.others.length;
    const list = names => names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];

    const skills = EXPLORE_SKILLS.map(skill => {
      let standing = '<small>No question for it</small>';
      if (skill.names().indexOf(name) !== -1) {
        const item = mastery.get(skill.key, name);
        const step = MASTERY_STEPS.find(s => s.level === item.level);
        standing = item.seen
          ? '<b><i class="swatch' + step.swatch + '"></i>' + step.label + '</b><small>' + daysAgoText(item.last) + '</small>'
          : '<small>Not seen yet</small>';
      }
      return '<li><span>' + skill.line + '</span>' + standing + '</li>';
    }).join('');

    card.innerHTML =
      '<div class="place-head">' +
        (flag ? '<span class="flag place-flag' + (explore.flags ? '' : ' is-waiting') + '" aria-hidden="true">' + flag.flag + '</span>' : '') +
        '<p class="eyebrow">' + escapeHtml(continent) + '</p>' +
        '<button type="button" class="icon-btn place-close" data-action="explore-close" aria-label="Close">' + icon('close') + '</button>' +
      '</div>' +
      '<h2 class="display-m place-name" id="place-name">' + escapeHtml(name) + '</h2>' +
      (capital
        ? '<dl class="place-facts"><div><dt>Capital</dt><dd>' + escapeHtml(capital.capital) +
            (capital.alternates.length ? '<small>also ' + escapeHtml(list(capital.alternates)) + '</small>' : '') +
          '</dd></div></dl>'
        : '') +
      '<div class="place-block">' +
        '<p class="eyebrow"><span>Borders</span>' + (bordered ? '<span>' + bordered + '</span>' : '') + '</p>' +
        (bordered ? '' : '<p class="place-note">No land borders.</p>') +
        (near.countries.length
          ? '<div class="chips">' + near.countries.map(other =>
              '<button type="button" class="chip" data-action="explore-pick" data-name="' + escapeHtml(other) + '">' + escapeHtml(other) + '</button>').join('') +
            '</div>'
          : '') +
        (near.others.length
          ? '<p class="place-note">' + (near.countries.length ? 'Also ' : '') + escapeHtml(list(near.others)) +
            ', which ' + (near.others.length > 1 ? 'are' : 'is') + ' on the map but not in this atlas’s levels.</p>'
          : '') +
      '</div>' +
      '<div class="place-block">' +
        '<p class="eyebrow">Where you stand</p>' +
        '<ul class="place-skills">' + skills + '</ul>' +
      '</div>' +
      '<button type="button" class="btn btn--secondary btn--block" data-action="open-level" data-level="' +
        continent.toLowerCase().replace(/ /g, '-') + '">' + escapeHtml(continent) + ' level' + icon('arrow') + '</button>';
    card.scrollTop = 0;
    setPlaceHeight();
    // The flag's font is fetched the first time a card wants one
    if (flag && !explore.flags) {
      flagsReady().then(ok => {
        if (!ok || explore.flags) return;
        explore.flags = true;
        if (explore.selected) renderPlace();
      });
    }
  }

  // Tells the stylesheet how much of the screen's foot the card's sheet
  // covers on a phone (0 on a wide screen, where it stands at the side), so
  // that the map controls and the imagery credit stand clear of it
  function setPlaceHeight() {
    const screen = document.getElementById('explore-screen');
    const card = document.getElementById('place-card');
    const sheet = !card.hidden && card.offsetWidth > screen.clientWidth * 0.7;
    screen.style.setProperty('--place-h', (sheet ? card.offsetHeight : 0) + 'px');
  }

  /* ----- Search ----- */

  // Countries for what has been typed, best first: a name that starts with
  // it, a name with a word that does, another spelling the typed-name quiz
  // accepts, a capital, then the text anywhere in the name. Accents, case
  // and punctuation make no difference (Quiz.fold). Each is { name, note }.
  function searchCountries(text) {
    const q = Quiz.fold(text);
    if (!q) return [];
    const starts = spelling => { const f = Quiz.fold(spelling); return f.indexOf(q) === 0 || f.indexOf(' ' + q) !== -1; };
    const ranked = [];
    exploreCountries().forEach((keys, name) => {
      const folded = Quiz.fold(name);
      const capital = Quiz.capitalOf(WORLD_FACTS, name);
      const alias = (COUNTRY_TYPED_ALIASES[name] || []).find(starts);
      const city = capital ? [capital.capital].concat(capital.alternates).find(starts) : null;
      let rank = -1, note = getContinent(name);
      if (folded.indexOf(q) === 0) rank = 0;
      else if (folded.indexOf(' ' + q) !== -1) rank = 1;
      else if (alias) { rank = 2; note = 'also “' + alias + '”'; }
      else if (city) { rank = 3; note = 'capital ' + city; }
      else if (folded.indexOf(q) !== -1) rank = 4;
      if (rank >= 0) ranked.push({ name: name, note: note, rank: rank });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return ranked.slice(0, EXPLORE_RESULTS);
  }

  // The field changed: list the countries that match
  function onExploreSearch() {
    const input = document.getElementById('explore-search');
    explore.results = searchCountries(input.value);
    explore.active = explore.results.length ? 0 : -1;
    renderExploreResults();
  }

  // The list under the search field, as the search and the arrow keys have left it
  function renderExploreResults() {
    const input = document.getElementById('explore-search');
    const list = document.getElementById('explore-results');
    const typed = Quiz.fold(input.value) !== '';
    document.getElementById('explore-search-clear').hidden = input.value === '';
    list.hidden = !typed;
    input.setAttribute('aria-expanded', String(typed && explore.results.length > 0));
    if (explore.active >= 0) input.setAttribute('aria-activedescendant', 'explore-result-' + explore.active);
    else input.removeAttribute('aria-activedescendant');
    list.innerHTML = explore.results.length
      ? explore.results.map((result, i) =>
          '<li role="option" id="explore-result-' + i + '" data-action="explore-pick" data-name="' + escapeHtml(result.name) +
            '" aria-selected="' + (i === explore.active) + '">' + escapeHtml(result.name) + '<small>' + escapeHtml(result.note) + '</small></li>').join('')
      : (typed ? '<li class="explore-none" role="presentation">No country by that name in this atlas</li>' : '');
  }

  function closeExploreResults() {
    const input = document.getElementById('explore-search');
    input.value = '';
    explore.results = [];
    explore.active = -1;
    renderExploreResults();
  }

  // A search result or a neighbour's chip was chosen: the globe flies there.
  // After a search the focus moves to the card, so that a phone's keyboard
  // closes and the arrow keys are the globe's again.
  function pickCountry(name, fromSearch) {
    closeExploreResults();
    selectCountry(name);
    if (fromSearch) document.getElementById('place-card').focus({ preventScroll: true });
  }

  document.getElementById('explore-search').addEventListener('input', onExploreSearch);
  document.getElementById('explore-search').addEventListener('focus', onExploreSearch);
  // A click anywhere else puts the list away (what was typed stays in the field)
  document.addEventListener('click', (e) => {
    if (!explore.on || !e.target.closest || e.target.closest('.explore-search')) return;
    document.getElementById('explore-results').hidden = true;
    document.getElementById('explore-search').setAttribute('aria-expanded', 'false');
  });

  /* ----- Keys ----- */

  // In the search field: the arrows walk the list, Enter goes to the
  // country, Escape clears the field. Anywhere else in Explore: Escape
  // closes the card, / goes to the search, and the globe's own keys work
  // as they do in a round.
  document.addEventListener('keydown', (e) => {
    // A key the dialog, the level sheet or a radio group has taken is not Explore's as well
    if (!explore.on || e.defaultPrevented || dialog.open || sheet.level) return;
    const input = document.getElementById('explore-search');
    if (e.target === input) {
      const n = explore.results.length;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
        e.preventDefault();
        explore.active = (explore.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        renderExploreResults();
      } else if (e.key === 'Enter' && n) {
        e.preventDefault();
        pickCountry(explore.results[Math.max(0, explore.active)].name, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (input.value) closeExploreResults();
        else selectCountry(null);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (explore.selected) selectCountry(null);
    } else if (e.key === '/') {
      e.preventDefault();
      input.focus();
    } else if (globeKey(e)) {
      e.preventDefault();
    }
  });

